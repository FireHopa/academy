import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestMethod, ServiceUnavailableException } from "@nestjs/common";
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AdminGuard } from "../src/auth/auth.guard";
import { IntegrationsController } from "../src/integrations/integrations.controller";
import { VideoService } from "../src/video/video.service";
import { config, recorded } from "./helpers";

const safeConfiguration = {
  configured: true,
  folderScoped: true,
  webhookConfigured: true,
  drmConfigured: true,
  drmRequired: true,
};

function diagnosticsHarness(options: {
  configuration?: Partial<typeof safeConfiguration>;
  connectionError?: Error;
  countError?: Error;
} = {}) {
  const count = recorded(async (args: any) => {
    if (options.countError) throw options.countError;
    if (args.where.status === "ERROR") return 1;
    if (args.where.status?.in) return 2;
    return 6;
  });
  const testConnection = recorded(async () => {
    if (options.connectionError) throw options.connectionError;
    return { ok: true, provider: "PANDA", sampleCount: 1, folderScoped: true };
  });
  const panda = {
    configurationStatus: () => ({ ...safeConfiguration, ...options.configuration }),
    testConnection,
  };
  const service = new VideoService(
    { videoAsset: { count } } as any,
    config({ VIDEO_PROVIDER: "panda" }) as any,
    {} as any,
    panda as any,
    { configured: () => false } as any,
  );
  return { service, count, testConnection };
}

test("diagnóstico Panda combina conexão real, segurança e contadores de assets vinculados", async () => {
  const { service, count, testConnection } = diagnosticsHarness();

  const result = await service.pandaDiagnostics();

  assert.deepEqual(result, {
    panda: {
      connected: true,
      drm_enabled: true,
      webhook_configured: true,
      videos_linked: 6,
      processing_videos: 2,
      error_videos: 1,
    },
  });
  assert.equal(testConnection.calls.length, 1);
  assert.equal(count.calls.length, 3);
  assert.deepEqual(count.calls[0][0].where, { provider: "PANDA", lessons: { some: {} } });
  assert.deepEqual(count.calls[1][0].where, { provider: "PANDA", lessons: { some: {} }, status: { in: ["UPLOADING", "PROCESSING"] } });
  assert.deepEqual(count.calls[2][0].where, { provider: "PANDA", lessons: { some: {} }, status: "ERROR" });
});

test("falha externa marca Panda offline sem perder contadores ou expor a mensagem remota", async () => {
  const { service } = diagnosticsHarness({
    connectionError: new ServiceUnavailableException("PANDA_API_KEY=segredo recusada por host.internal"),
  });

  const result = await service.pandaDiagnostics();
  const serialized = JSON.stringify(result);

  assert.equal(result.panda.connected, false);
  assert.equal(result.panda.videos_linked, 6);
  assert.doesNotMatch(serialized, /segredo|host\.internal|PANDA_API_KEY/i);
});

test("diagnóstico não chama a rede quando a API Panda não está configurada", async () => {
  const { service, testConnection } = diagnosticsHarness({ configuration: { configured: false } });

  const result = await service.pandaDiagnostics();

  assert.equal(result.panda.connected, false);
  assert.equal(result.panda.drm_enabled, true);
  assert.equal(testConnection.calls.length, 0);
});

test("botão Testar conexão reutiliza o sucesso e atualiza o diagnóstico sem segunda chamada externa", async () => {
  const { service, testConnection, count } = diagnosticsHarness();

  const result = await service.testPanda();

  assert.equal(result.ok, true);
  assert.equal(result.provider, "PANDA");
  assert.deepEqual(result.diagnostics, {
    connected: true,
    drm_enabled: true,
    webhook_configured: true,
    videos_linked: 6,
    processing_videos: 2,
    error_videos: 1,
  });
  assert.equal(testConnection.calls.length, 1);
  assert.equal(count.calls.length, 3);
});

test("falha do banco não é mascarada como zero ou simples desconexão Panda", async () => {
  const databaseError = new Error("database unavailable");
  const { service } = diagnosticsHarness({ countError: databaseError });

  await assert.rejects(service.pandaDiagnostics(), error => error === databaseError);
});

test("rota de diagnóstico permanece GET, sem cache e protegida pelo AdminGuard", () => {
  const handler = IntegrationsController.prototype.pandaDiagnostics;
  const guards = Reflect.getMetadata(GUARDS_METADATA, IntegrationsController) as unknown[];
  const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as Array<{ name: string; value: string }>;

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), "panda/diagnostics");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
  assert.ok(guards.includes(AdminGuard));
  assert.deepEqual(headers, [{ name: "Cache-Control", value: "no-store, private" }]);
});
