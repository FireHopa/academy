import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import type { ConfigService } from "@nestjs/config";
import { ImageStorageService } from "../src/media/image-storage.service";

function configFor(uploadDir: string) {
  return {
    get(key: string) {
      if (key === "UPLOAD_DIR") return uploadDir;
      if (key === "NEXT_PUBLIC_API_URL") return "http://localhost:4000";
      return undefined;
    },
  } as ConfigService;
}

test("otimiza, publica e remove uma imagem administrada", async t => {
  const uploadDir = await mkdtemp(join(tmpdir(), "academy-image-test-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  const service = new ImageStorageService(configFor(uploadDir));
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

  const stored = await service.store({ buffer, size: buffer.length, mimetype: "image/png", originalname: "capa.png" }, "course-card");
  const localPath = join(uploadDir, "images", basename(new URL(stored.url).pathname));

  assert.match(stored.url, /^http:\/\/localhost:4000\/uploads\/images\/[a-f0-9-]+\.webp$/);
  assert.equal(existsSync(localPath), true);
  assert.equal(stored.width, 1);
  assert.equal(stored.height, 1);

  await service.removeManaged(stored.url);
  assert.equal(existsSync(localPath), false);
});

test("recusa arquivo que não é uma imagem válida", async t => {
  const uploadDir = await mkdtemp(join(tmpdir(), "academy-image-test-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  const service = new ImageStorageService(configFor(uploadDir));
  const buffer = Buffer.from("arquivo inválido");

  await assert.rejects(
    service.store({ buffer, size: buffer.length, mimetype: "image/png", originalname: "falso.png" }, "course-card"),
    /Não foi possível processar a imagem/,
  );
});

test("readiness do storage local cria e valida o diretório gravável", async t => {
  const uploadDir = await mkdtemp(join(tmpdir(), "academy-image-health-"));
  t.after(() => rm(uploadDir, { recursive: true, force: true }));
  const service = new ImageStorageService(configFor(join(uploadDir, "uploads")));

  await service.assertReady();

  assert.equal(existsSync(join(uploadDir, "uploads", "images")), true);
});
