import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ListPandaVideosDto } from "../src/video/dto/panda-video.dto";
import { AdminService } from "../src/admin/admin.service";
import { PandaVideoProvider } from "../src/video/providers/panda-video.provider";
import type { ProviderVideo } from "../src/video/providers/video-provider.types";
import { VideoService } from "../src/video/video.service";
import { config, recorded, rejectsWith, student } from "./helpers";

const internalVideoId = "11111111-2222-4333-8444-555555555555";
const externalVideoId = "9988aabb-ccdd-4eff-9122-334455667788";
const folderId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const backendApiKey = "panda-backend-secret-key";

function rawPandaVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: internalVideoId,
    title: "Aula de aquisição",
    description: "Descrição",
    status: "CONVERTED",
    folder_id: folderId,
    library_id: "ffffffff-1111-4222-8333-444444444444",
    video_external_id: externalVideoId,
    length: 120.4,
    video_player: `https://player.pandavideo.com.br/embed/?v=${externalVideoId}`,
    video_hls: "https://private-cdn.example.com/playlist.m3u8",
    thumbnail: "https://cdn.pandavideo.com.br/thumbnail.jpg",
    ...overrides,
  };
}

function provider(values: Record<string, unknown> = {}) {
  return new PandaVideoProvider(config({ PANDA_API_KEY: backendApiKey, ...values }) as any);
}

function normalizedVideo(overrides: Partial<ProviderVideo> = {}): ProviderVideo {
  return {
    provider: "PANDA",
    providerAssetId: internalVideoId,
    providerExternalId: externalVideoId,
    providerLibraryId: "library-1",
    playerUrl: `https://player.pandavideo.com.br/embed/?v=${externalVideoId}`,
    thumbnailUrl: "https://cdn.pandavideo.com.br/thumbnail.jpg",
    durationSec: 121,
    status: "READY",
    error: null,
    metadata: { title: "Aula de aquisição", pandaStatus: "CONVERTED" },
    ...overrides,
  };
}

function videoService(
  prisma: Record<string, any> = {},
  pandaOverrides: Record<string, any> = {},
  configuration: Record<string, unknown> = {},
) {
  const utility = provider();
  const panda = {
    configured: () => true,
    configurationStatus: () => ({ configured: true, folderScoped: true, webhookConfigured: true, drmConfigured: false, drmRequired: false }),
    validVideoId: (value?: string | null) => utility.validVideoId(value),
    mapStatus: (status?: string) => utility.mapStatus(status),
    ...pandaOverrides,
  };
  return new VideoService(
    prisma as any,
    config({ VIDEO_PROVIDER: "panda", ...configuration }) as any,
    {} as any,
    panda as any,
    { configured: () => false } as any,
  );
}

test("configuração Panda considera somente valores preenchidos e não expõe credenciais", () => {
  const incomplete = provider({ PANDA_API_KEY: "   ", PANDA_DRM_GROUP_ID: "group", PANDA_DRM_GROUP_SECRET: "" });
  const complete = provider({
    PANDA_FOLDER_ID: folderId,
    PANDA_WEBHOOK_TOKEN: "webhook-secret",
    PANDA_DRM_GROUP_ID: "3761005d-6b2d-4fa0-9789-bb0a0a04b45e",
    PANDA_DRM_GROUP_SECRET: "drm-secret",
    PANDA_REQUIRE_DRM: "true",
  });

  assert.equal(incomplete.configured(), false);
  assert.deepEqual(complete.configurationStatus(), {
    configured: true,
    folderScoped: true,
    webhookConfigured: true,
    drmConfigured: true,
    drmRequired: true,
  });
  assert.doesNotMatch(JSON.stringify(complete.configurationStatus()), /backend-secret|webhook-secret|drm-secret/);
});

test("biblioteca Panda autentica somente no backend, aplica filtros e normaliza metadados", async t => {
  let requestedUrl = "";
  let requestedHeaders = new Headers();
  let requestedRedirect: RequestRedirect | undefined;
  t.mock.method(globalThis, "fetch", (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedHeaders = new Headers(init?.headers);
    requestedRedirect = init?.redirect;
    return new Response(JSON.stringify({ videos: [rawPandaVideo(), rawPandaVideo({ id: "22222222-3333-4444-8555-666666666666", status: "FAILED" })] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch);

  const result = await provider({ PANDA_FOLDER_ID: folderId }).listVideos({ page: 2, limit: 2, title: " aquisição ", status: "converted" });

  const url = new URL(requestedUrl);
  assert.equal(url.origin, "https://api-v2.pandavideo.com.br");
  assert.equal(url.pathname, "/videos");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("limit"), "2");
  assert.equal(url.searchParams.get("title"), "aquisição");
  assert.equal(url.searchParams.get("status"), "CONVERTED");
  assert.equal(url.searchParams.get("folder_id"), folderId);
  assert.equal(requestedHeaders.get("Authorization"), backendApiKey);
  assert.equal(requestedRedirect, "error");
  assert.equal(result.page, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.videos[0].status, "READY");
  assert.equal(result.videos[0].durationSec, 121);
  assert.equal(result.videos[0].thumbnailUrl, "https://cdn.pandavideo.com.br/thumbnail.jpg");
  assert.equal(result.videos[1].status, "ERROR");
  assert.doesNotMatch(JSON.stringify(result), /panda-backend-secret-key|private-cdn/);
});

test("resposta da biblioteca para o navegador remove player, HLS e IDs externos", async () => {
  const service = videoService({}, {
    listVideos: async () => ({ videos: [normalizedVideo()], page: 1, limit: 24, hasMore: false }),
  });

  const result = await service.listPandaVideos(1, "aquisição", "CONVERTED");
  const serialized = JSON.stringify(result);

  assert.equal(result.videos[0].providerAssetId, internalVideoId);
  assert.equal(result.videos[0].metadata.title, "Aula de aquisição");
  assert.doesNotMatch(serialized, /playerUrl|providerExternalId|providerLibraryId|playlist\.m3u8|panda-backend-secret-key/);
});

test("editor administrativo seleciona somente metadados Panda necessários", async () => {
  const findUnique = recorded(async () => ({ id: "course-1", modules: [] }));
  const service = new AdminService({ course: { findUnique } } as any, {} as any);

  await service.getCourse("course-1");

  const selection = findUnique.calls[0][0].include.modules.include.lessons.include.videoResource.select;
  assert.deepEqual(selection, {
    id: true,
    provider: true,
    providerAssetId: true,
    thumbnailUrl: true,
    status: true,
    durationSec: true,
    error: true,
  });
  assert.equal("playerUrl" in selection, false);
  assert.equal("providerExternalId" in selection, false);
  assert.equal("providerLibraryId" in selection, false);
});

test("filtros e escopo inválidos são rejeitados antes da chamada externa", async () => {
  await rejectsWith(provider().listVideos({ status: "READY_NOW" }), BadRequestException, /status/i);
  await rejectsWith(provider({ PANDA_FOLDER_ID: "folder-invalida" }).listVideos(), ServiceUnavailableException, /PANDA_FOLDER_ID inválido/i);
});

test("erros da API Panda são traduzidos sem reproduzir a resposta remota", async t => {
  t.mock.method(globalThis, "fetch", (async () => new Response(JSON.stringify({ message: "token panda-backend-secret-key recusado pelo host interno" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch);

  await assert.rejects(provider().listVideos(), error => {
    assert.ok(error instanceof ServiceUnavailableException);
    assert.match(error.message, /PANDA_API_KEY inválida/i);
    assert.doesNotMatch(error.message, /backend-secret|host interno/i);
    return true;
  });
});

test("falha de rede ou redirecionamento retorna erro genérico sem credencial", async t => {
  t.mock.method(globalThis, "fetch", (async () => { throw new Error(`redirect contendo ${backendApiKey}`); }) as typeof fetch);

  await assert.rejects(provider().listVideos(), error => {
    assert.ok(error instanceof ServiceUnavailableException);
    assert.match(error.message, /indisponível|tempo limite/i);
    assert.doesNotMatch(error.message, /panda-backend-secret-key/i);
    return true;
  });
});

test("vídeo convertido sem player completo permanece em processamento", async t => {
  t.mock.method(globalThis, "fetch", (async () => new Response(JSON.stringify(rawPandaVideo({ video_player: null })), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch);

  const video = await provider().getVideo(internalVideoId);

  assert.equal(video.status, "PROCESSING");
  assert.equal(video.playerUrl, null);
});

test("busca por ID externo usa o endpoint oficial somente após 404 do ID interno", async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", (async (input: string | URL | Request) => {
    urls.push(String(input));
    if (urls.length === 1) return new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify(rawPandaVideo()), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch);

  const video = await provider().refreshByExternalOrInternal(externalVideoId);

  assert.equal(video.providerAssetId, internalVideoId);
  assert.equal(urls.length, 2);
  assert.match(urls[1], new RegExp(`/videos/${externalVideoId}\\?external_id$`));
});

test("DTO da biblioteca transforma página e status e rejeita entradas inválidas", async () => {
  const valid = plainToInstance(ListPandaVideosDto, { page: "3", title: "Curso", status: "converted" });
  const invalid = plainToInstance(ListPandaVideosDto, { page: "0", title: "x".repeat(121), status: "desconhecido" });

  assert.equal((await validate(valid)).length, 0);
  assert.equal(valid.page, 3);
  assert.equal(valid.status, "CONVERTED");
  assert.ok((await validate(invalid)).length >= 3);
});

test("vinculação Panda persiste thumbnail, duração e status e remove referências Mux", async () => {
  const video = normalizedVideo();
  const asset = { id: "asset-1", ...video };
  const findUnique = recorded(async (args: any) => args.select
    ? { id: "lesson-1" }
    : { id: "lesson-1", title: "Aula", videoStatus: "READY", durationSec: 121, videoError: null, videoUploadId: null, videoAssetId: null, videoPlaybackId: null, videoResource: asset });
  const upsert = recorded(async () => asset);
  const update = recorded(async () => ({ id: "lesson-1" }));
  const service = videoService({ lesson: { findUnique, update }, videoAsset: { upsert } }, { getVideo: async () => video });

  const result = await service.attachPandaVideo("lesson-1", internalVideoId);

  assert.equal(result.videoStatus, "READY");
  assert.equal(result.durationSec, 121);
  assert.ok(result.videoResource);
  assert.equal(result.videoResource.thumbnailUrl, video.thumbnailUrl);
  assert.equal("playerUrl" in result.videoResource, false);
  assert.equal(upsert.calls[0][0].create.thumbnailUrl, video.thumbnailUrl);
  assert.equal(upsert.calls[0][0].create.durationSec, 121);
  assert.deepEqual(update.calls[0][0].data, {
    videoResourceId: "asset-1",
    videoStatus: "READY",
    videoError: null,
    durationSec: 121,
    videoUploadId: null,
    videoAssetId: null,
    videoPlaybackId: null,
  });
});

test("vinculação rejeita vídeo Panda bloqueado ou com falha", async () => {
  const upsert = recorded(async () => normalizedVideo());
  const update = recorded(async () => ({}));
  const service = videoService({ lesson: { findUnique: async () => ({ id: "lesson-1" }), update }, videoAsset: { upsert } }, {
    getVideo: async () => normalizedVideo({ status: "ERROR", error: "Panda retornou status BLOCKED" }),
  });

  await rejectsWith(service.attachPandaVideo("lesson-1", internalVideoId), BadRequestException, /com erro/i);
  assert.equal(upsert.calls.length, 0);
  assert.equal(update.calls.length, 0);
});

test("webhook Panda exige token em todos os ambientes e compara em tempo constante", () => {
  const missing = videoService();
  const configured = videoService({}, {}, { PANDA_WEBHOOK_TOKEN: "webhook-secret" });

  assert.throws(() => missing.verifyPandaWebhookToken("qualquer"), ServiceUnavailableException);
  assert.throws(() => configured.verifyPandaWebhookToken("incorreto"), UnauthorizedException);
  assert.doesNotThrow(() => configured.verifyPandaWebhookToken("webhook-secret"));
});

test("webhook ignora ID inválido sem consultar o banco", async () => {
  const findFirst = recorded(async () => { throw new Error("não deveria consultar"); });
  const service = videoService({ videoAsset: { findFirst } });

  const result = await service.handlePandaWebhook({ action: "video.changeStatus", video_id: "id-invalido", status: "CONVERTED" });

  assert.deepEqual(result, { received: true, ignored: true, reason: "invalid_video_id" });
  assert.equal(findFirst.calls.length, 0);
});

test("webhook atualiza asset e aulas vinculadas com metadados frescos", async () => {
  const fresh = normalizedVideo();
  const asset = { id: "asset-1", ...fresh };
  const upsert = recorded(async () => asset);
  const updateMany = recorded(async () => ({ count: 2 }));
  const service = videoService({
    videoAsset: { findFirst: async () => asset, upsert },
    lesson: { updateMany },
  }, { getVideo: async () => fresh });

  const result = await service.handlePandaWebhook({ action: "video.changeStatus", video_id: internalVideoId, video_external_id: externalVideoId, status: "CONVERTED" });

  assert.deepEqual(result, { received: true, status: "READY" });
  assert.equal(upsert.calls[0][0].update.thumbnailUrl, fresh.thumbnailUrl);
  assert.deepEqual(updateMany.calls[0][0].data, { videoStatus: "READY", videoError: null, durationSec: 121 });
});

test("fallback do webhook mapeia BLOCKED para erro e não marca READY sem player", async () => {
  const update = recorded(async (args: any) => args.data);
  const updateMany = recorded(async (args: any) => args.data);
  const baseAsset = { id: "asset-1", providerAssetId: internalVideoId, providerExternalId: null, playerUrl: null };
  const service = videoService({
    videoAsset: { findFirst: async () => baseAsset, update },
    lesson: { updateMany },
  }, { getVideo: async () => { throw new ServiceUnavailableException("Panda indisponível"); } });

  const blocked = await service.handlePandaWebhook({ action: "video.changeStatus", video_id: internalVideoId, status: "BLOCKED" });
  const converted = await service.handlePandaWebhook({ action: "video.changeStatus", video_id: internalVideoId, status: "CONVERTED" });

  assert.equal(blocked.status, "ERROR");
  assert.deepEqual(update.calls[0][0].data, { status: "ERROR", error: "Panda informou falha de conversão" });
  assert.equal(converted.status, "PROCESSING");
  assert.deepEqual(update.calls[1][0].data, { status: "PROCESSING", error: null });
});

test("playback Panda rejeita URL não HTTPS antes de criar sessão de player", () => {
  const panda = provider({ PANDA_REQUIRE_DRM: false });

  assert.throws(() => panda.buildPlayback(normalizedVideo({ playerUrl: `http://player.pandavideo.com.br/embed/?v=${externalVideoId}` }), {
    id: student.sub,
    name: student.name,
    email: student.email,
  }, "session-1"), ServiceUnavailableException);
});
