import assert from "node:assert/strict";
import test from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { AcademyJob } from "../src/jobs/jobs.types";
import { JobProcessorService } from "../src/jobs/job-processor.service";
import { JobQueueService } from "../src/jobs/job-queue.service";
import { jobRuntimePolicy } from "../src/jobs/queue-connection";
import { ImageStorageService } from "../src/media/image-storage.service";
import { normalizeMetricRoute, PerformanceMetricsService } from "../src/observability/performance-metrics.service";
import { TheMembersService } from "../src/integrations/themembers.service";
import { config, recorded, rejectsWith } from "./helpers";

test("observabilidade calcula p50, p95 e p99 por rota em uma janela limitada", () => {
  const metrics = new PerformanceMetricsService();
  [1, 2, 3, 100].forEach(duration => metrics.recordApi("GET", "/api/courses/ckx12345678901234567890?draft=1", 200, duration));
  metrics.recordApi("GET", "/api/courses/ckx12345678901234567890", 503, 7);
  metrics.recordWebVitals([
    { name: "LCP", value: 900, rating: "good", route: "/course/curso-a" },
    { name: "LCP", value: 2_900, rating: "poor", route: "/course/curso-a" },
  ]);
  metrics.recordPrismaQuery(310, "SELECT * FROM users WHERE email = $1", 250);

  const snapshot = metrics.snapshot();
  const api = snapshot.api[0];
  assert.equal(api.route, "/api/courses/:id");
  assert.equal(api.count, 5);
  assert.equal(api.errors, 1);
  assert.equal(api.p50Ms, 3);
  assert.equal(api.p95Ms, 100);
  assert.equal(api.p99Ms, 100);
  assert.equal(snapshot.webVitals[0].p75, 2_900);
  assert.equal(snapshot.prisma.slowCount, 1);
  assert.equal(snapshot.prisma.slowQueries[0].query.includes("$1"), true);
});

test("normalização remove query string e IDs sem gerar cardinalidade ilimitada", () => {
  assert.equal(normalizeMetricRoute("/api/students/123/devices/550e8400-e29b-41d4-a716-446655440000?q=x"), "/api/students/:id/devices/:id");
});

test("fila executa inline e preserva o contrato quando não existe heartbeat do worker", async () => {
  const execute = recorded(async () => ({ imported: 2, skipped: 0 }));
  const metrics = new PerformanceMetricsService();
  const queue = new JobQueueService(
    config({ JOBS_INLINE_FALLBACK: true }) as any,
    { get: async () => null } as any,
    { execute } as any,
    metrics,
  );

  const result = await queue.dispatch(AcademyJob.STUDENTS_IMPORT, {
    rows: [{ name: "Aluno A", email: "a@example.com" }, { name: "Aluno B", email: "b@example.com" }],
  }, { jobId: "importacao-teste" });

  assert.equal(result.mode, "inline");
  assert.deepEqual(result.mode === "inline" ? result.result : null, { imported: 2, skipped: 0 });
  assert.equal(execute.calls[0][0], AcademyJob.STUDENTS_IMPORT);
  assert.equal(metrics.snapshot().jobs[0].inline, 1);
  await queue.onApplicationShutdown();
});

test("produção força fila e desativa fallback inline mesmo quando o env tenta habilitá-lo", () => {
  const policy = jobRuntimePolicy(config({
    NODE_ENV: "production",
    JOBS_FORCE_QUEUE: false,
    JOBS_INLINE_FALLBACK: true,
  }) as any);

  assert.equal(policy.production, true);
  assert.equal(policy.forceQueue, true);
  assert.equal(policy.inlineFallback, false);
});

test("produção rejeita worker executado dentro do processo da API", () => {
  assert.throws(
    () => jobRuntimePolicy(config({ NODE_ENV: "production", JOBS_RUN_IN_API: true }) as any),
    /processo separado/i,
  );
});

test("produção enfileira mesmo sem heartbeat e nunca executa o processador inline", async () => {
  const execute = recorded(async () => ({ shouldNotRun: true }));
  const add = recorded(async (_name: string, _payload: unknown, options: any) => ({ id: options.jobId }));
  const close = recorded(async () => undefined);
  const queue = new JobQueueService(
    config({ NODE_ENV: "production", JOBS_INLINE_FALLBACK: true }) as any,
    { get: async () => null } as any,
    { execute } as any,
    new PerformanceMetricsService(),
  );
  (queue as any).queue = { add, close };

  const result = await queue.dispatch(AcademyJob.STUDENTS_IMPORT, {
    rows: [{ name: "Aluno A", email: "a@example.com" }],
  }, { jobId: "production-import" });

  assert.equal(result.mode, "queued");
  assert.equal(execute.calls.length, 0);
  assert.equal(add.calls.length, 1);
  await queue.onApplicationShutdown();
});

test("painel de jobs informa fallback desativado quando o worker está offline em produção", async () => {
  const queue = new JobQueueService(
    config({ NODE_ENV: "production", JOBS_INLINE_FALLBACK: true }) as any,
    { get: async () => null } as any,
    { execute: async () => ({}) } as any,
    new PerformanceMetricsService(),
  );

  const overview = await queue.overview();

  assert.equal(overview.worker.online, false);
  assert.equal(overview.fallback, "disabled");
  assert.equal(overview.dispatchMode, "queue_only");
});

test("falha após tentativa de fila não dispara fallback e evita job duplicado", async () => {
  const execute = recorded(async () => ({ shouldNotRun: true }));
  const close = recorded(async () => undefined);
  const queue = new JobQueueService(
    config({ NODE_ENV: "development", JOBS_FORCE_QUEUE: true, JOBS_INLINE_FALLBACK: true }) as any,
    { get: async () => "worker-online" } as any,
    { execute } as any,
    new PerformanceMetricsService(),
  );
  (queue as any).queue = {
    add: async () => { throw new Error("redis_unavailable"); },
    close,
  };

  await rejectsWith(
    queue.dispatch(AcademyJob.STUDENTS_IMPORT, {
      rows: [{ name: "Aluno A", email: "a@example.com" }],
    }, { jobId: "uncertain-import" }),
    ServiceUnavailableException,
    /Fila de processamento/i,
  );

  assert.equal(execute.calls.length, 0);
  await queue.onApplicationShutdown();
});

test("webhook reservado retorna imediatamente quando o dispatcher confirma enfileiramento", async () => {
  const dispatch = recorded(async () => ({ mode: "queued", queue: "academy-background", jobId: "event-1", state: "waiting" }));
  const event = {
    id: "event-1",
    provider: "THEMEMBERS",
    eventKey: "CHECKOUT:release.access:order-1",
    eventType: "release.access",
    payloadHash: "hash",
    payload: {},
    status: "RECEIVED",
    receivedAt: new Date(),
  };
  const prisma = {
    $transaction: async (callback: (tx: any) => unknown) => callback({
      $executeRaw: async () => 1,
      webhookEvent: { findUnique: async () => null, create: async () => event },
    }),
  };
  const service = new TheMembersService(prisma as any, config() as any, {} as any, { dispatch } as any);

  const result = await service.receiveWebhook(Buffer.from(JSON.stringify({ id: "order-1", event: "release.access" })));

  assert.equal(result.queued, true);
  assert.equal(result.status, "RECEIVED");
  assert.equal(dispatch.calls[0][0], AcademyJob.THEMEMBERS_ENROLLMENT_SYNC);
  assert.equal(dispatch.calls[0][1].eventId, event.id);
});

test("armazenamento local anuncia fallback sem tentar gerar URL pré-assinada", async () => {
  const images = new ImageStorageService(config({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }) as any);
  assert.deepEqual(await images.createDirectUpload("course-card", 1_024), { direct: false });
  assert.deepEqual(images.storageStatus(), {
    driver: "local",
    directUpload: false,
    publicBase: "http://localhost:4000/uploads",
  });
});

test("processor encaminha o job periódico para o lifecycle de vídeos", async () => {
  const cleanupOrphans = recorded(async () => ({ scanned: 3, deletedLocal: 2 }));
  const moduleRef = { get: recorded(() => ({ cleanupOrphans })) };
  const processor = new JobProcessorService(moduleRef as any, new PerformanceMetricsService());

  const result = await processor.execute(AcademyJob.VIDEO_ASSET_CLEANUP, {});

  assert.deepEqual(result, { scanned: 3, deletedLocal: 2 });
  assert.equal(cleanupOrphans.calls.length, 1);
  assert.equal(moduleRef.get.calls[0][1].strict, false);
});
