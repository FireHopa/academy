import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { lastValueFrom, of, throwError } from "rxjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AdminGuard } from "../src/auth/auth.guard";
import { AuditController } from "../src/audit/audit.controller";
import { AuditInterceptor } from "../src/audit/audit.interceptor";
import { AuditService, sanitizeAuditValue } from "../src/audit/audit.service";
import { recorded } from "./helpers";

function context(request: Record<string, any>) {
  return {
    getType: () => "http",
    getHandler: () => function auditedHandler() {},
    getClass: () => class AuditedController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

test("sanitiza segredos, dados sensíveis, URLs assinadas e payloads excessivos", () => {
  const sanitized = sanitizeAuditValue({
    email: "aluno@example.com",
    password: "Senha123!",
    cpf: "52998224725",
    invite: { token: "segredo" },
    imageUrl: "https://cdn.example/image.webp?signature=segredo",
    rows: Array.from({ length: 25 }, (_, index) => ({ index })),
  }) as Record<string, any>;

  assert.equal(sanitized.email, "aluno@example.com");
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.cpf, "[REDACTED]");
  assert.equal(sanitized.invite, "[REDACTED]");
  assert.equal(sanitized.imageUrl, "https://cdn.example/image.webp");
  assert.equal(sanitized.rows.length, 21);
  assert.match(sanitized.rows[20], /5 ITEM/);
  assert.doesNotMatch(JSON.stringify(sanitized), /Senha123|52998224725|signature=|segredo/);
});

test("interceptor registra ator, request ID e estados anterior e posterior somente após sucesso", async () => {
  let snapshotCall = 0;
  const snapshot = recorded(async () => ++snapshotCall === 1
    ? { id: "course-1", title: "Antes", status: "DRAFT" }
    : { id: "course-1", title: "Depois", status: "PUBLISHED" });
  const record = recorded(async () => true);
  const reflector = { getAllAndOverride: () => ({ action: "course.update", entityType: "COURSE", entityIdParam: "id", snapshot: true }) };
  const interceptor = new AuditInterceptor(reflector as any, { snapshot, record } as any);
  const request = {
    method: "PATCH",
    originalUrl: "/api/admin/courses/course-1?debug=true",
    params: { id: "course-1" },
    query: { debug: "true" },
    body: { title: "Depois", password: "nunca-registrar" },
    user: { sub: "admin-1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
    requestId: "request-123",
    ip: "203.0.113.5",
    socket: {},
    headers: { "user-agent": "Academy Browser" },
    get: (name: string) => name.toLowerCase() === "user-agent" ? "Academy Browser" : undefined,
  };

  const observable = await interceptor.intercept(context(request), { handle: () => of({ id: "course-1" }) } as any);
  const result = await lastValueFrom(observable);

  assert.deepEqual(result, { id: "course-1" });
  assert.equal(snapshot.calls.length, 2);
  assert.equal(record.calls.length, 1);
  const entry = record.calls[0][0];
  assert.equal(entry.actorUserId, "admin-1");
  assert.equal(entry.action, "course.update");
  assert.equal(entry.entityId, "course-1");
  assert.equal(entry.requestId, "request-123");
  assert.equal(entry.metadata.path, "/api/admin/courses/course-1");
  assert.equal(entry.metadata.request.body.password, "[REDACTED]");
  assert.equal(entry.before.title, "Antes");
  assert.equal(entry.after.title, "Depois");
});

test("interceptor não cria AuditLog quando a operação administrativa falha", async () => {
  const record = recorded(async () => true);
  const reflector = { getAllAndOverride: () => ({ action: "course.delete", entityType: "COURSE", entityIdParam: "id", snapshot: true, deleted: true }) };
  const interceptor = new AuditInterceptor(reflector as any, { snapshot: async () => ({ id: "course-1" }), record } as any);
  const request = { method: "DELETE", url: "/api/admin/courses/course-1", params: { id: "course-1" }, query: {}, body: {}, user: {}, socket: {}, headers: {} };

  const observable = await interceptor.intercept(context(request), { handle: () => throwError(() => new Error("falha de negócio")) } as any);
  await assert.rejects(lastValueFrom(observable), /falha de negócio/);
  assert.equal(record.calls.length, 0);
});

test("consulta de auditoria aplica filtros, período e paginação no banco", async () => {
  const findMany = recorded(async () => [{ id: "audit-1" }]);
  const count = recorded(async () => 31);
  const service = new AuditService({ auditLog: { findMany, count } } as any);

  const result = await service.list({
    page: 2,
    pageSize: 10,
    action: "course.update",
    entityType: "COURSE",
    actorUserId: "admin-1",
    q: "course-1",
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-02T23:59:59.000Z",
  });

  assert.equal(result.total, 31);
  assert.equal(result.pages, 4);
  assert.equal(findMany.calls[0][0].skip, 10);
  assert.equal(findMany.calls[0][0].take, 10);
  assert.equal(findMany.calls[0][0].where.action, "course.update");
  assert.equal(findMany.calls[0][0].where.entityType, "COURSE");
  assert.ok(findMany.calls[0][0].where.createdAt.gte instanceof Date);
  assert.equal(findMany.calls[0][0].where.OR.length, 6);
});

test("consulta do AuditLog permanece GET e restrita ao AdminGuard", () => {
  const handler = AuditController.prototype.list;
  const guards = Reflect.getMetadata(GUARDS_METADATA, AuditController) as unknown[];
  const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as Array<{ name: string; value: string }>;

  assert.equal(Reflect.getMetadata(PATH_METADATA, AuditController), "admin/audit-logs");
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), "/");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
  assert.ok(guards.includes(AdminGuard));
  assert.deepEqual(headers, [{ name: "Cache-Control", value: "no-store, private" }]);
});

test("migration do AuditLog preserva o ator e cria índices de consulta", () => {
  const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260902120000_admin_audit_log/migration.sql"), "utf8");

  assert.match(sql, /CREATE TABLE "AuditLog"/);
  assert.match(sql, /"before" JSONB/);
  assert.match(sql, /"after" JSONB/);
  assert.match(sql, /"requestId" TEXT NOT NULL/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /AuditLog_actorUserId_createdAt_idx/);
  assert.match(sql, /AuditLog_entityType_entityId_createdAt_idx/);
});
