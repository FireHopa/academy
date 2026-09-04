import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpStatus } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { IS_PUBLIC_KEY } from "../src/auth/public.decorator";
import { HealthController } from "../src/health/health.controller";
import { HealthService, type HealthResult } from "../src/health/health.service";
import { config, recorded } from "./helpers";

const completeConfiguration: Record<string, unknown> = {
  NODE_ENV: "test",
  VIDEO_PROVIDER: "panda",
  PANDA_API_KEY: "panda-api-secret",
  PANDA_WEBHOOK_TOKEN: "panda-webhook-secret",
  PANDA_REQUIRE_DRM: true,
  PANDA_DRM_GROUP_ID: "3761005d-6b2d-4fa0-9789-bb0a0a04b45e",
  PANDA_DRM_GROUP_SECRET: "panda-drm-secret",
  THEMEMBERS_ENABLED: true,
  THEMEMBERS_ACCESS_AUTOMATION: true,
  THEMEMBERS_API_MODE: "legacy",
  THEMEMBERS_DEVELOPER_TOKEN: "themembers-developer-secret",
  THEMEMBERS_PLATFORM_TOKEN: "themembers-platform-secret",
  THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN: "themembers-webhook-secret",
  MAIL_PROVIDER: "resend",
  RESEND_API_KEY: "resend-secret",
  MAIL_FROM: "Academy <academy@example.com>",
};

function healthService(
  values: Record<string, unknown> = {},
  prisma: Record<string, unknown> = {},
  dependencies: {
    redis?: Record<string, unknown>;
    jobs?: Record<string, unknown>;
    images?: Record<string, unknown>;
  } = {},
) {
  return new HealthService({
    pingPostgres: async () => undefined,
    pingPrisma: async () => undefined,
    ...prisma,
  } as any, config({ ...completeConfiguration, ...values }) as any, {
    ping: async () => "PONG",
    ...dependencies.redis,
  } as any, {
    pingQueue: async () => undefined,
    pingWorker: async () => undefined,
    ...dependencies.jobs,
  } as any, {
    assertReady: async () => undefined,
    ...dependencies.images,
  } as any);
}

test("readiness positivo valida banco, Redis, fila, worker, storage e configurações", async () => {
  const pingPostgres = recorded(async () => undefined);
  const pingPrisma = recorded(async () => undefined);
  const pingRedis = recorded(async () => "PONG");
  const pingQueue = recorded(async () => undefined);
  const pingWorker = recorded(async () => undefined);
  const assertStorageReady = recorded(async () => undefined);
  const result = await healthService({}, { pingPostgres, pingPrisma }, {
    redis: { ping: pingRedis },
    jobs: { pingQueue, pingWorker },
    images: { assertReady: assertStorageReady },
  }).ready();

  assert.equal(result.ok, true);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.checks, {
    api: true,
    postgres: true,
    prisma: true,
    redis: true,
    queue: true,
    worker: true,
    storage: true,
    panda_configuration: true,
    themembers_configuration: true,
    email_configuration: true,
  });
  assert.equal(pingPostgres.calls.length, 1);
  assert.equal(pingPrisma.calls.length, 1);
  assert.equal(pingRedis.calls.length, 1);
  assert.equal(pingQueue.calls.length, 1);
  assert.equal(pingWorker.calls.length, 1);
  assert.equal(assertStorageReady.calls.length, 1);
  assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(Number.isInteger(result.uptime_seconds));
});

test("liveness confirma somente o processo e não consulta dependências", () => {
  const service = healthService({}, {
    pingPostgres: () => { throw new Error("não deveria executar"); },
    pingPrisma: () => { throw new Error("não deveria executar"); },
  }, {
    redis: { ping: () => { throw new Error("não deveria executar"); } },
    jobs: {
      pingQueue: () => { throw new Error("não deveria executar"); },
      pingWorker: () => { throw new Error("não deveria executar"); },
    },
    images: { assertReady: () => { throw new Error("não deveria executar"); } },
  });

  assert.deepEqual(service.live().checks, { api: true });
  assert.equal(service.live().ok, true);
});

test("falhas de Redis, fila, worker e storage são isoladas no readiness", async () => {
  const result = await healthService({}, {}, {
    redis: { ping: async () => null },
    jobs: {
      pingQueue: async () => { throw new Error("queue unavailable"); },
      pingWorker: async () => { throw new Error("worker unavailable"); },
    },
    images: { assertReady: async () => { throw new Error("storage unavailable"); } },
  }).ready();

  assert.equal(result.ok, false);
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.postgres, true);
  assert.equal(result.checks.redis, false);
  assert.equal(result.checks.queue, false);
  assert.equal(result.checks.worker, false);
  assert.equal(result.checks.storage, false);
  assert.doesNotMatch(JSON.stringify(result), /unavailable/i);
});

test("falhas do PostgreSQL e Prisma são isoladas sem revelar mensagens internas", async () => {
  const result = await healthService({}, {
    pingPostgres: async () => { throw new Error("postgresql://academy:senha@database.internal:5432/academy"); },
    pingPrisma: async () => { throw new Error("Prisma secret diagnostic"); },
  }).check();
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.api, true);
  assert.equal(result.checks.postgres, false);
  assert.equal(result.checks.prisma, false);
  assert.doesNotMatch(serialized, /senha|database\.internal|secret diagnostic/i);
});

test("PostgreSQL e Prisma possuem checks independentes", async () => {
  const result = await healthService({}, {
    pingPostgres: async () => undefined,
    pingPrisma: async () => { throw new Error("client unavailable"); },
  }).check();

  assert.equal(result.checks.postgres, true);
  assert.equal(result.checks.prisma, false);
});

test("configuração Panda exige API, webhook, DRM ativo e credenciais válidas", async () => {
  const missingApi = await healthService({ PANDA_API_KEY: " " }).check();
  const missingWebhook = await healthService({ PANDA_WEBHOOK_TOKEN: undefined }).check();
  const missingDrmPair = await healthService({ PANDA_DRM_GROUP_SECRET: "" }).check();
  const drmDisabled = await healthService({ PANDA_REQUIRE_DRM: false, PANDA_DRM_GROUP_ID: "", PANDA_DRM_GROUP_SECRET: "" }).check();
  const invalidGroup = await healthService({ PANDA_DRM_GROUP_ID: "grupo-invalido" }).check();

  assert.equal(missingApi.checks.panda_configuration, false);
  assert.equal(missingWebhook.checks.panda_configuration, false);
  assert.equal(missingDrmPair.checks.panda_configuration, false);
  assert.equal(drmDisabled.checks.panda_configuration, false);
  assert.equal(invalidGroup.checks.panda_configuration, false);
});

test("Panda não gera falso negativo quando o fallback Mux é o provedor ativo", async () => {
  const result = await healthService({
    VIDEO_PROVIDER: "mux",
    PANDA_API_KEY: undefined,
    PANDA_WEBHOOK_TOKEN: undefined,
  }).check();

  assert.equal(result.checks.panda_configuration, true);
});

test("TheMembers aceita integração desativada e reprova automação incompleta ou modo inválido", async () => {
  const disabled = await healthService({ THEMEMBERS_ENABLED: false, THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN: "" }).check();
  const incomplete = await healthService({ THEMEMBERS_DEVELOPER_TOKEN: "" }).check();
  const invalidMode = await healthService({ THEMEMBERS_API_MODE: "unknown" }).check();

  assert.equal(disabled.checks.themembers_configuration, true);
  assert.equal(incomplete.checks.themembers_configuration, false);
  assert.equal(invalidMode.checks.themembers_configuration, false);
});

test("TheMembers valida também a configuração completa do modo v1", async () => {
  const result = await healthService({
    THEMEMBERS_API_MODE: "v1",
    THEMEMBERS_DEVELOPER_TOKEN: undefined,
    THEMEMBERS_PLATFORM_TOKEN: undefined,
    THEMEMBERS_API_TOKEN: "v1-secret",
    THEMEMBERS_PRODUCTS_ENDPOINT: "https://tenant.example.com/products",
  }).check();

  assert.equal(result.checks.themembers_configuration, true);
});

test("e-mail desativado em produção exige confirmação explícita", async () => {
  const development = await healthService({ MAIL_PROVIDER: "disabled", RESEND_API_KEY: "", MAIL_FROM: "" }).check();
  const production = await healthService({ NODE_ENV: "production", MAIL_PROVIDER: "disabled" }).check();
  const explicitlyAllowed = await healthService({
    NODE_ENV: "production",
    MAIL_PROVIDER: "disabled",
    ALLOW_DISABLED_MAIL_IN_PRODUCTION: true,
    RESEND_API_KEY: "",
    MAIL_FROM: "",
  }).check();
  const incompleteResend = await healthService({ NODE_ENV: "production", RESEND_API_KEY: "" }).check();

  assert.equal(development.checks.email_configuration, true);
  assert.equal(production.checks.email_configuration, false);
  assert.equal(explicitlyAllowed.checks.email_configuration, true);
  assert.equal(incompleteResend.checks.email_configuration, false);
});

test("resposta pública não contém nenhum valor de segredo configurado", async () => {
  const result = await healthService().check();
  const serialized = JSON.stringify(result);

  for (const value of Object.values(completeConfiguration)) {
    if (typeof value === "string" && /secret|token|group/.test(value)) {
      assert.equal(serialized.includes(value), false, `A resposta expôs o valor ${value}`);
    }
  }
});

test("controller responde 200 ou 503 no readiness e preserva o alias legado", async () => {
  const healthy = await healthService().check();
  const unhealthy: HealthResult = { ...healthy, ok: false, status: "unhealthy", checks: { ...healthy.checks, postgres: false } };

  for (const [result, expectedStatus] of [[healthy, HttpStatus.OK], [unhealthy, HttpStatus.SERVICE_UNAVAILABLE]] as const) {
    const response: Record<string, any> = {};
    response.status = recorded(() => response);
    response.setHeader = recorded(() => response);
    const controller = new HealthController({ check: async () => result, ready: async () => result } as any);

    assert.equal(await controller.check(response as any), result);
    assert.deepEqual(response.status.calls[0], [expectedStatus]);
    assert.deepEqual(response.setHeader.calls[0], ["Cache-Control", "no-store"]);

    response.status.calls.length = 0;
    response.setHeader.calls.length = 0;
    assert.equal(await controller.ready(response as any), result);
    assert.deepEqual(response.status.calls[0], [expectedStatus]);
    assert.deepEqual(response.setHeader.calls[0], ["Cache-Control", "no-store"]);
  }
});

test("controller de liveness sempre responde 200 e impede cache", () => {
  const live = healthService().live();
  const response: Record<string, any> = {};
  response.status = recorded(() => response);
  response.setHeader = recorded(() => response);
  const controller = new HealthController({ live: () => live } as any);

  assert.equal(controller.live(response as any), live);
  assert.deepEqual(response.status.calls[0], [HttpStatus.OK]);
  assert.deepEqual(response.setHeader.calls[0], ["Cache-Control", "no-store"]);
});

test("rotas live, ready e o alias de health permanecem explicitamente públicos", () => {
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController), true);
  assert.deepEqual(Reflect.getMetadata(PATH_METADATA, HealthController.prototype.live), ["health/live", "api/health/live"]);
  assert.deepEqual(Reflect.getMetadata(PATH_METADATA, HealthController.prototype.ready), ["health/ready", "api/health/ready"]);
  assert.deepEqual(Reflect.getMetadata(PATH_METADATA, HealthController.prototype.check), ["health", "api/health"]);
});
