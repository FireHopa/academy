import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { config, recorded, rejectsWith } from "./helpers";

const jwtSecret = "test-secret-with-at-least-thirty-two-characters";

function authService(prisma: Record<string, any>, mail: Record<string, any> = { send: async () => ({ delivered: true }) }, extraConfig: Record<string, unknown> = {}, sessionCache?: Record<string, any>) {
  return new AuthService(
    prisma as any,
    config({ JWT_SECRET: jwtSecret, WEB_URL: "http://localhost:3000", NODE_ENV: "test", ...extraConfig }) as any,
    mail as any,
    {} as any,
    sessionCache as any,
  );
}

function activeUser(passwordHash: string) {
  return {
    id: "user-1",
    name: "Aluno Teste",
    email: "aluno@example.com",
    passwordHash,
    role: "STUDENT" as const,
    status: "ACTIVE" as const,
    sessionVersion: 3,
    onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

test("login positivo normaliza o e-mail, valida bcrypt e registra o último acesso", async () => {
  const passwordHash = await hash("SenhaSegura123!", 4);
  const user = activeUser(passwordHash);
  const findUnique = recorded(async () => user);
  const update = recorded(async () => user);
  const service = authService({ user: { findUnique, update } });

  const result = await service.validateCredentials("  ALUNO@EXAMPLE.COM ", "SenhaSegura123!");

  assert.equal(result.sub, user.id);
  assert.equal(result.ver, 3);
  assert.equal(findUnique.calls[0][0].where.email, "aluno@example.com");
  assert.ok(update.calls[0][0].data.lastLoginAt instanceof Date);
});

test("login negativo rejeita senha incorreta sem atualizar o usuário", async () => {
  const user = activeUser(await hash("SenhaCorreta123!", 4));
  const update = recorded(async () => user);
  const service = authService({ user: { findUnique: async () => user, update } });

  await rejectsWith(service.validateCredentials(user.email, "SenhaErrada123!"), UnauthorizedException, /inválidos/i);
  assert.equal(update.calls.length, 0);
});

test("usuário ativo mantém uma sessão compatível com sessionVersion", async () => {
  const user = activeUser("hash");
  const service = authService({
    user: { findUnique: async () => user },
  });

  const result = await service.validateSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ver: user.sessionVersion,
    onboardingCompleted: true,
  });

  assert.equal(result.sub, user.id);
  assert.equal(result.onboardingCompleted, true);
});

test("sessão em cache compartilhado evita uma consulta de usuário por requisição", async () => {
  const user = activeUser("hash");
  const cached = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ver: user.sessionVersion,
    onboardingCompleted: true,
  };
  const findUnique = recorded(async () => user);
  const get = recorded(async () => cached);
  const service = authService({ user: { findUnique } }, undefined as any, {}, { get, set: async () => undefined });

  const result = await service.validateSession(cached);

  assert.deepEqual(result, cached);
  assert.equal(get.calls.length, 1);
  assert.equal(findUnique.calls.length, 0);
});

test("usuário bloqueado perde acesso mesmo com token anteriormente válido", async () => {
  const user = { ...activeUser("hash"), status: "BLOCKED" as const };
  const service = authService({ user: { findUnique: async () => user } });

  await rejectsWith(service.validateSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ver: user.sessionVersion,
    onboardingCompleted: true,
  }), ForbiddenException, /bloqueada/i);
});

test("logout positivo remove somente o cookie de sessão com o domínio configurado", () => {
  const clearCookie = recorded<void>();
  const controller = new AuthController({} as any, config({ COOKIE_DOMAIN: ".academy.example" }) as any);

  controller.logout({ clearCookie } as any);

  assert.equal(clearCookie.calls.length, 1);
  assert.deepEqual(clearCookie.calls[0], ["academy_session", { path: "/", domain: ".academy.example" }]);
});

test("logout continua idempotente sem sessão e não exige domínio de cookie", () => {
  const clearCookie = recorded<void>();
  const controller = new AuthController({} as any, config({ COOKIE_DOMAIN: "" }) as any);
  const response = { clearCookie } as any;

  controller.logout(response);
  controller.logout(response);

  assert.equal(clearCookie.calls.length, 2);
  assert.equal(clearCookie.calls[0][1].domain, undefined);
});

test("recuperação de senha positiva grava somente o hash do token e envia o link", async () => {
  const user = { id: "user-1", name: "Aluno", email: "aluno@example.com", status: "ACTIVE" };
  const createdTokens: any[] = [];
  const send = recorded(async () => ({ delivered: true }));
  const prisma = {
    user: { findUnique: async () => user },
    accountToken: {
      updateMany: async () => ({ count: 0 }),
      create: async (args: any) => { createdTokens.push(args.data); return args.data; },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const service = authService(prisma, { send });

  const result = await service.requestPasswordReset(" ALUNO@EXAMPLE.COM ");

  assert.equal(result.ok, true);
  assert.ok("devResetUrl" in result);
  const resetUrl = new URL(result.devResetUrl!);
  const rawToken = resetUrl.searchParams.get("token");
  assert.ok(rawToken);
  assert.equal(createdTokens.length, 1);
  assert.equal(createdTokens[0].type, "PASSWORD_RESET");
  assert.equal(createdTokens[0].tokenHash, createHash("sha256").update(rawToken!).digest("hex"));
  assert.notEqual(createdTokens[0].tokenHash, rawToken);
  assert.equal(send.calls.length, 1);
});

test("recuperação negativa não revela se o e-mail não existe e não cria token", async () => {
  const create = recorded(async () => { throw new Error("não deveria criar token"); });
  const send = recorded(async () => ({ delivered: true }));
  const service = authService({
    user: { findUnique: async () => null },
    accountToken: { create },
  }, { send });

  const result = await service.requestPasswordReset("inexistente@example.com");

  assert.deepEqual(result, { ok: true });
  assert.equal(create.calls.length, 0);
  assert.equal(send.calls.length, 0);
});

test("falha no e-mail do convite preserva o token e retorna o link como sucesso parcial", async () => {
  const user = { id: "user-1", name: "Aluno", email: "aluno@example.com", status: "ACTIVE" };
  const createdTokens: any[] = [];
  const send = recorded(async () => { throw new Error("provedor indisponível"); });
  const prisma = {
    user: { findUnique: async () => user },
    accountToken: {
      updateMany: async () => ({ count: 0 }),
      create: async (args: any) => { createdTokens.push(args.data); return args.data; },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const service = authService(prisma, { send });

  const result = await service.sendInvite(user.id);

  assert.equal(result.delivered, false);
  assert.match(result.url, /^http:\/\/localhost:3000\/invite\?token=/);
  assert.equal(createdTokens.length, 1);
  assert.equal(createdTokens[0].type, "INVITE");
  assert.equal(send.calls.length, 1);
});

test("reset de senha rejeita token inválido ou expirado", async () => {
  const service = authService({ accountToken: { findUnique: async () => null } });

  await rejectsWith(service.resetPassword("token-invalido", "NovaSenha123!"), UnauthorizedException, /inválido ou expirado/i);
});
