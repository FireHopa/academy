import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { VideoService } from "../src/video/video.service";
import { config, recorded } from "./helpers";

test("interface administrativa orienta o fluxo Panda sem textos visuais antigos do Mux", () => {
  const courseEditor = readFileSync(resolve(process.cwd(), "apps/web/app/admin/courses/[id]/page.tsx"), "utf8");

  assert.match(courseEditor, /Biblioteca Panda/);
  assert.match(courseEditor, /Panda Video \+ DRM\/Watermark \+ autorização por sessão/);
  assert.doesNotMatch(courseEditor, /envie os vídeos protegidos pelo Mux/i);
  assert.doesNotMatch(courseEditor, /upload direto para o Mux/i);
  assert.doesNotMatch(courseEditor, /Direct Upload \+ DRM/i);
});

test("fallback Mux continua funcional no backend após a atualização visual", async () => {
  const update = recorded(async () => ({ id: "lesson-1" }));
  const createDirectUpload = recorded(async () => ({
    data: { id: "upload-1", url: "https://upload.example.test/direct" },
  }));
  const service = new VideoService(
    {
      lesson: {
        findUnique: async () => ({ id: "lesson-1", videoStatus: "EMPTY" }),
        update,
      },
    } as any,
    config({ VIDEO_PROVIDER: "mux" }) as any,
    {} as any,
    {} as any,
    { createDirectUpload } as any,
  );

  assert.equal(service.configuredProvider(), "MUX");
  assert.deepEqual(await service.createDirectUpload("lesson-1"), {
    uploadId: "upload-1",
    endpoint: "https://upload.example.test/direct",
    status: "UPLOADING",
    provider: "MUX",
  });
  assert.equal(createDirectUpload.calls.length, 1);
  assert.deepEqual(update.calls[0][0], {
    where: { id: "lesson-1" },
    data: {
      videoUploadId: "upload-1",
      videoStatus: "UPLOADING",
      videoError: null,
      videoResourceId: null,
    },
  });
});
