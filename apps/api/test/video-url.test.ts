import assert from "node:assert/strict";
import test from "node:test";
import { PandaVideoProvider } from "../src/video/providers/panda-video.provider";
import { VimeoVideoProvider, parseVimeoUrl } from "../src/video/providers/vimeo-video.provider";
import { VideoService } from "../src/video/video.service";
import { VideoProvider } from "../src/generated/prisma/enums";

const externalId = "43aed6b6-209f-4762-b1f0-795b3e91f715";
const internalId = "fb626f9e-e9cb-4e43-8157-fefee93f09ae";
const pandaUrl = `https://player-vz-bbff009e-ada.tv.pandavideo.com.br/embed/?v=${externalId}`;
const config = { get: (key: string) => key === "PANDA_API_KEY" ? "test-key" : "https://academy.example" };

test("Panda URL resolves external ID to internal ID using authenticated API", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, `https://api-v2.pandavideo.com.br/videos/${externalId}?external_id`);
    assert.equal(new Headers(options.headers).get("Authorization"), "test-key");
    return Response.json({ id: internalId, video_external_id: externalId, video_player: pandaUrl, status: "CONVERTED", length: 94 });
  });
  const video = await new PandaVideoProvider(config as any).fromUrl(pandaUrl);
  assert.equal(video.providerAssetId, internalId);
  assert.equal(video.providerExternalId, externalId);
  assert.equal(video.durationSec, 94);
});

test("Panda URL rejects foreign hosts, credentials, ports and missing video IDs before fetching", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw Error("unexpected fetch"); });
  const panda = new PandaVideoProvider(config as any);
  for (const url of [pandaUrl.replace(".com.br", ".com.br.evil.test"), pandaUrl.replace("https:", "http:"), pandaUrl.replace("https://", "https://user:pass@"), pandaUrl.replace("/embed", ":444/embed"), pandaUrl.split("?")[0]]) {
    await assert.rejects(panda.fromUrl(url), /URL/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("Vimeo preserves unlisted hash and canonicalizes player links", () => {
  assert.equal(parseVimeoUrl("https://vimeo.com/123456/abcdef1234")?.embedUrl, "https://player.vimeo.com/video/123456?h=abcdef1234");
  assert.equal(parseVimeoUrl("https://player.vimeo.com/video/123456?h=abcdef1234&autoplay=1")?.pageUrl, "https://vimeo.com/123456/abcdef1234");
  for (const url of ["https://vimeo.com.evil.test/123", "https://user:pass@vimeo.com/123", "http://vimeo.com/123", "https://vimeo.com:444/123", "https://vimeo.com/123?h=%3Cscript%3E"]) assert.equal(parseVimeoUrl(url), null);
  assert.equal(VideoProvider.VIMEO, "VIMEO");
});

test("Vimeo validates metadata and uses canonical player URL without remote HTML", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(new URL(url).origin, "https://vimeo.com");
    assert.equal(new URL(url).searchParams.get("url"), "https://vimeo.com/123456/abcdef1234");
    return Response.json({ video_id: 123456, duration: 95.2, title: "Aula", html: "<script>untrusted</script>" });
  });
  const provider = new VimeoVideoProvider(config as any);
  const video = await provider.fromUrl("https://vimeo.com/123456/abcdef1234");
  assert.equal(video.durationSec, 96);
  assert.equal(provider.buildPlayback(video).embedUrl, "https://player.vimeo.com/video/123456?h=abcdef1234");
});

test("Vimeo refuses unavailable videos", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));
  await assert.rejects(new VimeoVideoProvider(config as any).fromUrl("https://vimeo.com/123456"), /não disponibilizou/);
});

test("URL attachment validates provider before modifying the lesson", async () => {
  let writes = 0;
  const prisma = { lesson: { findUnique: async () => ({ id: "lesson" }), update: async () => { writes++; } } };
  const panda = { fromUrl: async () => { throw Error("Vídeo não encontrado"); } };
  const service = new VideoService(prisma as any, config as any, {} as any, panda as any, {} as any);
  await assert.rejects(service.attachVideoUrl("lesson", pandaUrl), /não encontrado/);
  assert.equal(writes, 0);
});
