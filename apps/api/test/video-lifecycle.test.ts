import assert from "node:assert/strict";
import test from "node:test";
import { MuxVideoProvider } from "../src/video/providers/mux-video.provider";
import { academyManagedMuxMetadata, VideoAssetLifecycleService } from "../src/video/video-asset-lifecycle.service";
import { VideoService } from "../src/video/video.service";
import { config, recorded } from "./helpers";

const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1_000);

function lifecycle(
  assets: Array<Record<string, any>>,
  overrides: Record<string, any> = {},
  muxOverrides: Record<string, any> = {},
  values: Record<string, unknown> = {},
) {
  const deleteMany = recorded(async () => ({ count: 1 }));
  const prisma = {
    videoAsset: {
      findMany: async () => assets,
      findUnique: async ({ where }: any) => {
        const asset = assets.find(item => item.id === where.id);
        return asset ? { providerAssetId: asset.providerAssetId, updatedAt: asset.updatedAt, _count: { lessons: 0 } } : null;
      },
      deleteMany,
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
      ...overrides,
    },
  };
  const mux = {
    configured: () => true,
    deleteAsset: async () => undefined,
    ...muxOverrides,
  };
  return {
    service: new VideoAssetLifecycleService(prisma as any, config(values) as any, mux as any),
    deleteMany,
  };
}

test("Panda órfão remove somente o registro local e preserva a mídia remota", async () => {
  const deleteAsset = recorded(async () => undefined);
  const { service, deleteMany } = lifecycle([{
    id: "panda-1",
    provider: "PANDA",
    providerAssetId: "panda-video-1",
    metadata: null,
    updatedAt: oldDate,
  }], {}, { deleteAsset });

  const result = await service.cleanupOrphans();

  assert.equal(result.deletedLocal, 1);
  assert.equal(result.preservedPandaRemote, 1);
  assert.equal(result.deletedRemote, 0);
  assert.equal(deleteAsset.calls.length, 0);
  assert.equal(deleteMany.calls.length, 1);
});


test("YouTube órfão remove somente o registro local e nunca tenta excluir mídia remota", async () => {
  const deleteAsset = recorded(async () => undefined);
  const { service, deleteMany } = lifecycle([{
    id: "youtube-1",
    provider: "YOUTUBE",
    providerAssetId: "dQw4w9WgXcQ",
    metadata: { lifecycle: { remoteOwned: false, source: "youtube-url" } },
    updatedAt: oldDate,
  }], {}, { deleteAsset });

  const result = await service.cleanupOrphans();

  assert.equal(result.deletedLocal, 1);
  assert.equal(result.preservedYoutubeRemote, 1);
  assert.equal(result.deletedRemote, 0);
  assert.equal(deleteAsset.calls.length, 0);
  assert.equal(deleteMany.calls.length, 1);
});

test("Mux pertencente ao Academy é removido remotamente antes do registro local", async () => {
  const deleteAsset = recorded(async () => undefined);
  const asset = {
    id: "mux-1",
    provider: "MUX",
    providerAssetId: "mux-asset-1",
    metadata: academyManagedMuxMetadata(),
    updatedAt: oldDate,
  };
  const { service, deleteMany } = lifecycle([asset], {}, { deleteAsset });

  const result = await service.cleanupOrphans();

  assert.deepEqual(deleteAsset.calls[0], ["mux-asset-1"]);
  assert.equal(result.deletedRemote, 1);
  assert.equal(result.deletedLocal, 1);
  assert.equal(deleteMany.calls.length, 1);
});

test("Mux antigo sem marca de propriedade fica pendente para revisão manual", async () => {
  const deleteAsset = recorded(async () => undefined);
  const { service, deleteMany } = lifecycle([{
    id: "mux-old",
    provider: "MUX",
    providerAssetId: "mux-old-asset",
    metadata: null,
    updatedAt: oldDate,
  }], {}, { deleteAsset });

  const result = await service.cleanupOrphans();

  assert.equal(result.manualReview, 1);
  assert.equal(result.deletedRemote, 0);
  assert.equal(deleteAsset.calls.length, 0);
  assert.equal(deleteMany.calls.length, 0);
});

test("falha remota do Mux preserva o registro para nova tentativa", async () => {
  const deleteMany = recorded(async () => ({ count: 1 }));
  const { service } = lifecycle([{
    id: "mux-failed",
    provider: "MUX",
    providerAssetId: "mux-failed-asset",
    metadata: academyManagedMuxMetadata(),
    updatedAt: oldDate,
  }], { deleteMany }, {
    deleteAsset: async () => { throw new Error("remote secret diagnostic"); },
  });

  const result = await service.cleanupOrphans();

  assert.equal(result.failed, 1);
  assert.equal(result.deletedLocal, 0);
  assert.equal(deleteMany.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /secret|diagnostic/i);
});

test("asset religado durante a limpeza nunca é removido pelo banco", async () => {
  const deleteAsset = recorded(async () => undefined);
  const deleteMany = recorded(async () => ({ count: 1 }));
  const { service } = lifecycle([{
    id: "mux-linked",
    provider: "MUX",
    providerAssetId: "mux-linked-asset",
    metadata: academyManagedMuxMetadata(),
    updatedAt: oldDate,
  }], {
    findUnique: async () => ({ providerAssetId: "mux-linked-asset", updatedAt: oldDate, _count: { lessons: 1 } }),
    deleteMany,
  }, { deleteAsset });

  const result = await service.cleanupOrphans();

  assert.equal(result.skippedRelinked, 1);
  assert.equal(deleteAsset.calls.length, 0);
  assert.equal(deleteMany.calls.length, 0);
});

test("desvinculação reinicia o período de segurança sem IDs duplicados", async () => {
  const updateMany = recorded(async () => ({ count: 2 }));
  const { service } = lifecycle([], { updateMany });

  const result = await service.markDetached(["asset-1", "asset-1", null, "asset-2"]);

  assert.deepEqual(result, { touched: 2 });
  assert.deepEqual(updateMany.calls[0][0].where.id.in, ["asset-1", "asset-2"]);
  assert.ok(updateMany.calls[0][0].data.updatedAt instanceof Date);
});

test("status separa órfãos Mux administrados dos que exigem revisão", async () => {
  const values = [7, 4, 2, 5, 1, 3];
  const count = recorded(async () => values.shift());
  const { service } = lifecycle([], { count });

  const result = await service.status();

  assert.deepEqual(result, {
    orphaned: 7,
    eligible: 4,
    panda: 2,
    mux: 5,
    youtube: 1,
    muxManaged: 3,
    muxManualReview: 2,
    graceHours: 24,
    deleteUnmarkedMux: false,
  });
});

test("exclusão Mux trata 404 remoto como asset já removido", async t => {
  t.mock.method(globalThis, "fetch", (async () => new Response(null, { status: 404 })) as typeof fetch);
  const mux = new MuxVideoProvider(config({ MUX_TOKEN_ID: "mux-id", MUX_TOKEN_SECRET: "mux-secret" }) as any);

  await assert.doesNotReject(mux.deleteAsset("asset-ausente"));
});

test("remoção de vídeo marca o asset antes de desfazer o vínculo", async () => {
  const order: string[] = [];
  const markDetached = recorded(async () => { order.push("mark"); });
  const update = recorded(async () => { order.push("detach"); return { id: "lesson-1", videoStatus: "EMPTY" }; });
  const service = new VideoService(
    { lesson: { findUnique: async () => ({ id: "lesson-1", videoAssetId: null, videoResource: { id: "asset-1", provider: "PANDA" } }), update } } as any,
    config({ VIDEO_PROVIDER: "panda" }) as any,
    {} as any,
    {} as any,
    { configured: () => false } as any,
    { markDetached } as any,
  );

  await service.removeVideo("lesson-1");

  assert.deepEqual(order, ["mark", "detach"]);
  assert.deepEqual(markDetached.calls[0][0], ["asset-1"]);
});

test("webhook Mux marca novos assets como propriedade remota do Academy", async () => {
  const upsert = recorded(async () => ({ id: "resource-1" }));
  const update = recorded(async () => ({}));
  const service = new VideoService(
    { lesson: { findUnique: async () => ({ id: "lesson-1", videoUploadId: "upload-1" }), update }, videoAsset: { upsert } } as any,
    config({ VIDEO_PROVIDER: "mux" }) as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await service.handleMuxWebhook({
    type: "video.asset.ready",
    data: {
      id: "mux-asset-1",
      upload_id: "upload-1",
      duration: 90,
      playback_ids: [{ id: "playback-drm-1", policy: "drm" }],
    },
  });

  assert.equal(upsert.calls[0][0].create.metadata.lifecycle.remoteOwned, true);
  assert.equal(upsert.calls[0][0].create.metadata.lifecycle.source, "academy-direct-upload");
  assert.equal(upsert.calls[0][0].update.metadata.lifecycle.remoteOwned, true);
});
