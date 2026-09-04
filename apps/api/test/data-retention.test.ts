import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AUDIT_ACTION_KEY } from "../src/audit/audit.decorator";
import { AdminGuard } from "../src/auth/auth.guard";
import { Prisma } from "../src/generated/prisma/client";
import { DataRetentionService } from "../src/integrations/data-retention.service";
import { IntegrationsController } from "../src/integrations/integrations.controller";
import { JobProcessorService } from "../src/jobs/job-processor.service";
import { AcademyJob } from "../src/jobs/jobs.types";
import { PerformanceMetricsService } from "../src/observability/performance-metrics.service";
import { config, recorded } from "./helpers";

function model() {
  return {
    count: recorded(async () => 0),
    findMany: recorded(async () => [] as Array<{ id: string }>),
    deleteMany: recorded(async (options: any) => ({ count: options.where.id.in.length })),
    updateMany: recorded(async (options: any) => ({ count: options.where.id.in.length })),
  };
}

function prismaDouble() {
  return {
    accountToken: model(),
    watchSession: model(),
    notification: model(),
    webhookEvent: model(),
    integrationLog: model(),
    auditLog: model(),
    externalCustomer: model(),
    externalSubscription: model(),
  };
}

test("limpeza preserva sessões ACTIVE e webhooks RECEIVED e remove somente registros elegíveis", async () => {
  const prisma = prismaDouble();
  prisma.watchSession.findMany = recorded(async () => [{ id: "watch-ended" }]);
  prisma.webhookEvent.findMany = recorded(async options => options.where.status.in.includes("FAILED")
    ? [{ id: "webhook-failed" }]
    : [{ id: "webhook-processed" }]);
  prisma.externalCustomer.findMany = recorded(async () => [{ id: "customer-1" }]);
  prisma.externalSubscription.findMany = recorded(async () => [{ id: "subscription-1" }]);
  const service = new DataRetentionService(prisma as any, config({ DATA_RETENTION_BATCH_SIZE: 10 }) as any);

  const result = await service.cleanup();

  assert.equal(result.deleted.watchSessions, 1);
  assert.equal(result.deleted.webhookEvents, 1);
  assert.equal(result.deleted.webhookEventsFailed, 1);
  assert.equal(result.rawCleared.externalCustomers, 1);
  assert.equal(result.rawCleared.externalSubscriptions, 1);
  assert.equal(prisma.watchSession.deleteMany.calls[0][0].where.status.not, "ACTIVE");
  for (const call of prisma.webhookEvent.deleteMany.calls) {
    assert.equal(call[0].where.status.in.includes("RECEIVED"), false);
    assert.ok(call[0].where.processedAt.lte instanceof Date);
  }
  assert.equal(prisma.externalCustomer.updateMany.calls[0][0].data.raw, Prisma.DbNull);
  assert.equal(prisma.externalSubscription.updateMany.calls[0][0].data.raw, Prisma.DbNull);
});

test("limpeza respeita o limite de lotes por execução", async () => {
  const prisma = prismaDouble();
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: `log-${index}` }));
  prisma.integrationLog.findMany = recorded(async () => rows);
  const service = new DataRetentionService(prisma as any, config({
    DATA_RETENTION_BATCH_SIZE: 10,
    DATA_RETENTION_MAX_BATCHES_PER_RUN: 2,
  }) as any);

  const result = await service.cleanup();

  assert.equal(result.deleted.integrationLogs, 20);
  assert.equal(prisma.integrationLog.findMany.calls.length, 2);
  assert.equal(prisma.integrationLog.deleteMany.calls.length, 2);
});

test("status expõe políticas conservadoras e totais protegidos", async () => {
  const prisma = prismaDouble();
  prisma.webhookEvent.count = recorded(async options => options.where.status === "RECEIVED" ? 7 : 2);
  prisma.watchSession.count = recorded(async options => options.where.status === "ACTIVE" ? 5 : 3);
  const service = new DataRetentionService(prisma as any, config() as any);

  const status = await service.status();

  assert.equal(status.enabled, true);
  assert.equal(status.intervalMs, 86_400_000);
  assert.equal(status.batchSize, 500);
  assert.equal(status.maxBatchesPerRun, 10);
  assert.equal(status.policyDays.externalRaw, 30);
  assert.equal(status.policyDays.auditLogs, 365);
  assert.equal(status.protected.webhookEventsReceived, 7);
  assert.equal(status.protected.watchSessionsActive, 5);
});

test("processor encaminha o job periódico para a retenção de dados", async () => {
  const cleanup = recorded(async () => ({ deleted: { accountTokens: 4 } }));
  const moduleRef = { get: recorded(() => ({ cleanup })) };
  const processor = new JobProcessorService(moduleRef as any, new PerformanceMetricsService());

  const result = await processor.execute(AcademyJob.DATA_RETENTION_CLEANUP, {});

  assert.deepEqual(result, { deleted: { accountTokens: 4 } });
  assert.equal(cleanup.calls.length, 1);
  assert.equal(moduleRef.get.calls[0][0], DataRetentionService);
  assert.equal(moduleRef.get.calls[0][1].strict, false);
});

test("rotas de retenção são administrativas, sem cache e o gatilho é auditado", async () => {
  const dispatch = recorded(async () => ({ mode: "queued", queue: "academy-background", jobId: "retention-1", state: "waiting" }));
  const status = recorded(async () => ({ enabled: true }));
  const controller = new IntegrationsController({} as any, {} as any, { dispatch } as any, { status } as any);

  assert.deepEqual(await controller.dataRetentionStatus(), { enabled: true });
  assert.deepEqual(await controller.cleanupRetainedData(), {
    ok: true,
    queued: true,
    queue: "academy-background",
    jobId: "retention-1",
    status: "waiting",
  });
  assert.equal(dispatch.calls[0][0], AcademyJob.DATA_RETENTION_CLEANUP);

  const statusHandler = IntegrationsController.prototype.dataRetentionStatus;
  const cleanupHandler = IntegrationsController.prototype.cleanupRetainedData;
  const guards = Reflect.getMetadata(GUARDS_METADATA, IntegrationsController) as unknown[];
  const headers = Reflect.getMetadata(HEADERS_METADATA, statusHandler) as Array<{ name: string; value: string }>;
  const audit = Reflect.getMetadata(AUDIT_ACTION_KEY, cleanupHandler);
  assert.equal(Reflect.getMetadata(PATH_METADATA, statusHandler), "data-retention");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, statusHandler), RequestMethod.GET);
  assert.equal(Reflect.getMetadata(PATH_METADATA, cleanupHandler), "data-retention/cleanup");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, cleanupHandler), RequestMethod.POST);
  assert.ok(guards.includes(AdminGuard));
  assert.deepEqual(headers, [{ name: "Cache-Control", value: "no-store, private" }]);
  assert.equal(audit.action, "data-retention.cleanup.requested");
});
