import assert from "node:assert/strict";
import test from "node:test";
import { YoutubeVideoProvider, parseYouTubeVideoId } from "../src/video/providers/youtube-video.provider";

test("parser aceita formatos comuns de URL do YouTube", () => {
  const id = "dQw4w9WgXcQ";
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(parseYouTubeVideoId(`https://youtu.be/${id}?si=abc`), id);
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/live/${id}`), id);
  assert.equal(parseYouTubeVideoId(id), id);
});

test("parser rejeita hosts e IDs inválidos", () => {
  assert.equal(parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/watch?v=curto"), null);
  assert.equal(parseYouTubeVideoId("não é url"), null);
});

test("provider normaliza asset do YouTube e cria playback incorporado", () => {
  const provider = new YoutubeVideoProvider();
  const video = provider.fromUrl("https://youtu.be/dQw4w9WgXcQ", 213);
  assert.equal(video.provider, "YOUTUBE");
  assert.equal(video.providerAssetId, "dQw4w9WgXcQ");
  assert.equal(video.durationSec, 213);
  assert.equal(video.status, "READY");
  assert.match(video.thumbnailUrl || "", /dQw4w9WgXcQ/);

  const playback = provider.buildPlayback({ providerAssetId: "dQw4w9WgXcQ" });
  assert.equal(playback.provider, "YOUTUBE");
  if (playback.provider === "YOUTUBE") assert.equal(playback.videoId, "dQw4w9WgXcQ");
});
