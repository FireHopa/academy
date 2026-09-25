import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProviderVideo } from "./video-provider.types";

export function parseVimeoUrl(input: string) {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const match = url.hostname === "player.vimeo.com"
      ? url.pathname.match(/^\/video\/([0-9]+)\/?$/)
      : ["vimeo.com", "www.vimeo.com"].includes(url.hostname)
        ? url.pathname.match(/^\/([0-9]+)(?:\/([a-zA-Z0-9]+))?\/?$/) : null;
    if (!match) return null;
    const hash = url.searchParams.get("h") || match[2];
    if (hash && !/^[a-zA-Z0-9]{1,128}$/.test(hash)) return null;
    const embed = new URL(`https://player.vimeo.com/video/${match[1]}`);
    if (hash) embed.searchParams.set("h", hash);
    return { id: match[1], embedUrl: embed.toString(), pageUrl: `https://vimeo.com/${match[1]}${hash ? `/${hash}` : ""}` };
  } catch { return null; }
}

@Injectable()
export class VimeoVideoProvider {
  constructor(private readonly config: ConfigService) {}

  async fromUrl(input: string): Promise<ProviderVideo> {
    const parsed = parseVimeoUrl(input);
    if (!parsed) throw new BadRequestException("Cole o link HTTPS do vídeo Vimeo, incluindo o código de privacidade quando houver.");
    let response: Response;
    try {
      response = await fetch(`https://vimeo.com/api/oembed.json?${new URLSearchParams({ url: parsed.pageUrl })}`, {
        headers: { Accept: "application/json", Referer: this.config.get<string>("WEB_URL") || "" },
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
    } catch { throw new ServiceUnavailableException("O Vimeo não respondeu. Tente novamente."); }
    if (!response.ok) throw new BadRequestException("O Vimeo não disponibilizou este vídeo. Confira o link completo e a permissão de incorporação para este site.");
    let data: { video_id?: number; duration?: number; title?: string; thumbnail_url?: string };
    try { data = await response.json(); } catch { throw new ServiceUnavailableException("Resposta inválida do Vimeo."); }
    const duration = Number(data.duration);
    if (String(data.video_id) !== parsed.id || !Number.isFinite(duration) || duration <= 0) {
      throw new BadRequestException("Não foi possível validar este vídeo no Vimeo. Confira as permissões de incorporação.");
    }
    return { provider: "VIMEO", providerAssetId: parsed.id, providerExternalId: parsed.id,
      playerUrl: parsed.embedUrl, status: "READY", durationSec: Math.ceil(duration),
      thumbnailUrl: typeof data.thumbnail_url === "string" && data.thumbnail_url.startsWith("https://") ? data.thumbnail_url : null,
      metadata: { title: data.title ?? null }, error: null };
  }

  buildPlayback(asset: { playerUrl?: string | null; providerAssetId: string }) {
    const parsed = parseVimeoUrl(asset.playerUrl || "");
    if (!parsed || parsed.id !== asset.providerAssetId) throw new ServiceUnavailableException("Link do Vimeo inválido. Vincule o vídeo novamente.");
    return { provider: "VIMEO" as const, videoId: parsed.id, embedUrl: parsed.embedUrl };
  }
}
