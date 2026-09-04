import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { decode, verify } from "jsonwebtoken";
import { validatePandaDrmProductionConfig } from "../src/video/panda-drm.config";
import { PandaVideoProvider } from "../src/video/providers/panda-video.provider";
import { VideoService } from "../src/video/video.service";
import { config, recorded, rejectsWith, request, student } from "./helpers";

const drmSecret = "panda-drm-secret-used-only-by-the-test-suite";
const drmGroupId = "3761005d-6b2d-4fa0-9789-bb0a0a04b45e";
const internalVideoId = "11111111-2222-4333-8444-555555555555";
const externalVideoId = "9988aabb-ccdd-4eff-9122-334455667788";

function pandaAsset() {
  return {
    provider: "PANDA" as const,
    providerAssetId: internalVideoId,
    providerExternalId: externalVideoId,
    providerLibraryId: "library-1",
    playerUrl: "https://player-vz-82493b0a-26d.tv.pandavideo.com.br/embed/",
    thumbnailUrl: "https://cdn.example.com/thumb.jpg",
    durationSec: 600,
    status: "READY" as const,
    error: null,
    metadata: null,
  };
}

test("Panda playback positivo cria URL por sessão com watermark do aluno", () => {
  const provider = new PandaVideoProvider(config({
    PANDA_API_KEY: "backend-only-key",
    PANDA_DRM_GROUP_ID: drmGroupId,
    PANDA_DRM_GROUP_SECRET: drmSecret,
    PANDA_REQUIRE_DRM: true,
    PANDA_WATERMARK_TTL_SEC: 3600,
  }) as any);

  const result = provider.buildPlayback(pandaAsset(), {
    id: student.sub,
    name: student.name,
    email: student.email,
  }, "session-1");

  const url = new URL(result.playerUrl);
  assert.equal(url.searchParams.get("v"), externalVideoId);
  assert.equal(url.searchParams.get("customName"), "session-1");
  assert.equal(url.searchParams.get("saveProgress"), "false");
  assert.equal(url.searchParams.has("drm_group_id"), false);
  assert.equal(result.playerUrl.includes("backend-only-key"), false);
  assert.equal("drmGroupId" in result, false);
  const token = url.searchParams.get("watermark")!;
  const claims = verify(token, drmSecret, { algorithms: ["HS256"] }) as Record<string, unknown>;
  const decoded = decode(token, { complete: true });
  assert.equal(decoded?.header.alg, "HS256");
  assert.equal(claims.drm_group_id, drmGroupId);
  assert.equal(claims.string1, `Nome: ${student.name}`);
  assert.equal(claims.string2, `E-mail: ${student.email}`);
  assert.equal(claims.string3, `ID: ${student.sub}`);
  assert.equal(Number(claims.exp) - Number(claims.iat), 3600);
});

test("Panda playback negativo falha fechado quando DRM é obrigatório e não está configurado", () => {
  const provider = new PandaVideoProvider(config({ PANDA_REQUIRE_DRM: true }) as any);

  assert.throws(() => provider.buildPlayback(pandaAsset(), {
    id: student.sub,
    name: student.name,
    email: student.email,
  }, "session-1"), ServiceUnavailableException);
});

test("Panda DRM é obrigatório por padrão e configuração parcial também falha fechado", () => {
  const missing = new PandaVideoProvider(config() as any);
  const partial = new PandaVideoProvider(config({ PANDA_DRM_GROUP_ID: drmGroupId }) as any);
  const viewer = { id: student.sub, name: student.name, email: student.email };

  assert.equal(missing.configurationStatus().drmRequired, true);
  assert.throws(() => missing.buildPlayback(pandaAsset(), viewer, "session-1"), ServiceUnavailableException);
  assert.throws(() => partial.buildPlayback(pandaAsset(), viewer, "session-1"), ServiceUnavailableException);
});

test("Panda DRM sanitiza campos visíveis e preserva o ID completo do aluno", () => {
  const provider = new PandaVideoProvider(config({
    PANDA_DRM_GROUP_ID: drmGroupId,
    PANDA_DRM_GROUP_SECRET: drmSecret,
    PANDA_REQUIRE_DRM: " true ",
  }) as any);

  const result = provider.buildPlayback(pandaAsset(), {
    id: " aluno-id-completo-123 \n",
    name: " Matheus\n  Bottaro ",
    email: " matheus@example.com\t",
  }, "session-2");
  const token = new URL(result.playerUrl).searchParams.get("watermark")!;
  const claims = verify(token, drmSecret, { algorithms: ["HS256"] }) as Record<string, unknown>;

  assert.equal(claims.string1, "Nome: Matheus Bottaro");
  assert.equal(claims.string2, "E-mail: matheus@example.com");
  assert.equal(claims.string3, "ID: aluno-id-completo-123");
});

test("Panda DRM nunca envia watermark para host HTTPS não oficial ou ID externo inválido", () => {
  const provider = new PandaVideoProvider(config({
    PANDA_DRM_GROUP_ID: drmGroupId,
    PANDA_DRM_GROUP_SECRET: drmSecret,
    PANDA_REQUIRE_DRM: true,
  }) as any);
  const viewer = { id: student.sub, name: student.name, email: student.email };

  assert.throws(() => provider.buildPlayback({ ...pandaAsset(), playerUrl: "https://player.attacker.example/embed/" }, viewer, "session-1"), ServiceUnavailableException);
  assert.throws(() => provider.buildPlayback({ ...pandaAsset(), providerExternalId: "external-invalido" }, viewer, "session-1"), ServiceUnavailableException);
});

test("rollback explícito fora de produção permite player sem DRM e sem parâmetros sensíveis", () => {
  const provider = new PandaVideoProvider(config({ PANDA_REQUIRE_DRM: false }) as any);
  const result = provider.buildPlayback(pandaAsset(), {
    id: student.sub,
    name: student.name,
    email: student.email,
  }, "session-rollback");
  const url = new URL(result.playerUrl);

  assert.equal(url.searchParams.has("watermark"), false);
  assert.equal(url.searchParams.has("drm_group_id"), false);
  assert.equal(url.searchParams.get("customName"), "session-rollback");
});

test("produção exige flag DRM explícita, credenciais completas e group ID válido", () => {
  assert.throws(() => validatePandaDrmProductionConfig(config({ PANDA_REQUIRE_DRM: false }) as any), /deve ser true/i);
  assert.throws(() => validatePandaDrmProductionConfig(config({ PANDA_REQUIRE_DRM: true }) as any), /incompleta/i);
  assert.throws(() => validatePandaDrmProductionConfig(config({
    PANDA_REQUIRE_DRM: true,
    PANDA_DRM_GROUP_ID: "grupo-invalido",
    PANDA_DRM_GROUP_SECRET: drmSecret,
  }) as any), /UUID válido/i);
  assert.doesNotThrow(() => validatePandaDrmProductionConfig(config({
    PANDA_REQUIRE_DRM: true,
    PANDA_DRM_GROUP_ID: drmGroupId,
    PANDA_DRM_GROUP_SECRET: drmSecret,
  }) as any));
});

function playbackLesson() {
  const videoResource = {
    id: "asset-1",
    ...pandaAsset(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    id: "lesson-1",
    title: "Aula Panda",
    description: "Descrição",
    published: true,
    preview: false,
    durationSec: 600,
    videoStatus: "READY",
    videoPlaybackId: null,
    videoResource,
    module: {
      course: {
        id: "course-1",
        title: "Curso",
        slug: "curso",
        status: "PUBLISHED",
        modules: [{
          id: "module-1",
          title: "Módulo",
          position: 1,
          lessons: [{ id: "lesson-1", title: "Aula Panda", position: 1, durationSec: 600, videoStatus: "READY", videoResource }],
        }],
      },
    },
  };
}

function videoHarness(buildPlayback: (...args: any[]) => any) {
  const start = recorded(async () => ({
    device: { id: "device-1", label: "Notebook" },
    session: { id: "session-1", nonce: "nonce", startedAt: new Date("2026-08-18T12:00:00Z") },
  }));
  const end = recorded(async () => ({ ended: true }));
  const sessions = { start, end, heartbeatSec: () => 20 };
  const lesson = playbackLesson();
  const userLookup = recorded(async () => ({ id: student.sub, name: student.name, email: student.email }));
  const prisma = {
    lesson: { findUnique: async () => lesson },
    enrollment: { findUnique: async () => ({ status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), expiresAt: null }) },
    user: { findUnique: userLookup },
    courseModule: { findMany: async () => lesson.module.course.modules },
    lessonChapter: { findMany: async () => [] },
    lessonMaterial: { findMany: async () => [] },
    lessonTranscript: { findUnique: async () => null },
    lessonProgress: { findUnique: async () => ({ positionSec: 42, completed: false, completedAt: null }) },
  };
  const panda = { buildPlayback, configured: () => true };
  const mux = { configured: () => false };
  const service = new VideoService(prisma as any, config({ VIDEO_PROVIDER: "panda" }) as any, sessions as any, panda as any, mux as any);
  return { service, start, end, userLookup };
}

test("Panda playback integrado devolve apenas a reprodução autorizada após matrícula e sessão", async () => {
  const buildPlayback = recorded(() => ({ provider: "PANDA", playerUrl: "https://player.example/authorized", videoExternalId: "external-video-1" }));
  const { service, start, end, userLookup } = videoHarness(buildPlayback);

  const result = await service.playbackAccess(student, "lesson-1", { deviceFingerprint: "browser-1" }, request());

  assert.equal(result.playback.provider, "PANDA");
  assert.equal(result.playbackSession.id, "session-1");
  assert.equal(start.calls.length, 1);
  assert.equal(start.calls[0][5], 42);
  assert.equal(buildPlayback.calls[0][2], "session-1");
  assert.equal(end.calls.length, 0);
  assert.equal(userLookup.calls.length, 0);
  assert.equal(result.resources.progress?.positionSec, 42);
});

test("Panda playback integrado encerra a sessão quando o provider não consegue autorizar", async () => {
  const { service, end } = videoHarness(() => { throw new ServiceUnavailableException("DRM indisponível"); });

  await rejectsWith(service.playbackAccess(student, "lesson-1", { deviceFingerprint: "browser-1" }, request()), ServiceUnavailableException, /DRM indisponível/i);

  assert.equal(end.calls.length, 1);
  assert.equal(end.calls[0][2], "provider_playback_failed");
});
