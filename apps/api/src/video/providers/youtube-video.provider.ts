import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { ProviderPlayback, ProviderVideo } from "./video-provider.types";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function parseYouTubeVideoId(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (YOUTUBE_ID_PATTERN.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let candidate = "";

  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v") ?? "";
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0] ?? "")) candidate = parts[1] ?? "";
    }
  }

  return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}

@Injectable()
export class YoutubeVideoProvider {
  fromUrl(url: string, durationSec: number): ProviderVideo {
    const videoId = parseYouTubeVideoId(url);
    if (!videoId) {
      throw new BadRequestException("URL do YouTube inválida. Use um link youtube.com, youtu.be, Shorts ou Live.");
    }
    if (!Number.isInteger(durationSec) || durationSec <= 0) {
      throw new BadRequestException("Não foi possível identificar a duração do vídeo do YouTube.");
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return {
      provider: "YOUTUBE",
      providerAssetId: videoId,
      providerExternalId: videoId,
      playerUrl: `https://www.youtube.com/embed/${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSec,
      status: "READY",
      error: null,
      metadata: {
        sourceUrl: canonicalUrl,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        lifecycle: { remoteOwned: false, source: "youtube-url" },
      },
    };
  }

  buildPlayback(asset: { providerAssetId: string; providerExternalId?: string | null }): ProviderPlayback {
    const videoId = parseYouTubeVideoId(asset.providerExternalId || asset.providerAssetId);
    if (!videoId) throw new ServiceUnavailableException("Vídeo do YouTube inválido ou incompleto");
    return {
      provider: "YOUTUBE",
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  }
}
