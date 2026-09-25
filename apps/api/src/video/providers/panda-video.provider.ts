import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sign } from "jsonwebtoken";
import { PANDA_UUID_PATTERN, pandaDrmCredentials, pandaDrmRequired } from "../panda-drm.config";
import type { ProviderVideo, ViewerIdentity } from "./video-provider.types";

const PANDA_API_BASE_URL = "https://api-v2.pandavideo.com.br";
const PANDA_API_TIMEOUT_MS = 10_000;
const PANDA_PLAYER_HOST = "player.pandavideo.com.br";
const PANDA_PLAYER_SUFFIX = ".tv.pandavideo.com.br";

export const PANDA_VIDEO_STATUSES = ["DRAFT", "CONVERTING", "CONVERTED", "FAILED", "BLOCKED", "DELETING"] as const;
export type PandaVideoStatus = typeof PANDA_VIDEO_STATUSES[number];

type PandaVideo = {
  id: string;
  title?: string;
  description?: string | null;
  status?: "DRAFT" | "CONVERTING" | "CONVERTED" | "FAILED" | "BLOCKED" | "DELETING" | string;
  folder_id?: string | null;
  library_id?: string | null;
  pullzone_name?: string | null;
  video_external_id?: string | null;
  video_player?: string | null;
  thumbnail?: string | null;
  length?: number | null;
  [key: string]: unknown;
};

type PandaListResponse = { videos?: PandaVideo[] } | PandaVideo[];

@Injectable()
export class PandaVideoProvider {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return Boolean(this.config.get<string>("PANDA_API_KEY")?.trim());
  }

  configurationStatus() {
    const drm = pandaDrmCredentials(this.config);
    return {
      configured: this.configured(),
      folderScoped: Boolean(this.config.get<string>("PANDA_FOLDER_ID")?.trim()),
      webhookConfigured: Boolean(this.config.get<string>("PANDA_WEBHOOK_TOKEN")?.trim()),
      drmConfigured: drm.configured,
      drmRequired: pandaDrmRequired(this.config),
    };
  }

  async testConnection() {
    const result = await this.listVideos({ page: 1, limit: 1 });
    return { ok: true, provider: "PANDA", sampleCount: result.videos.length, folderScoped: this.configurationStatus().folderScoped };
  }

  async listVideos(input: { page?: number; limit?: number; title?: string; status?: string } = {}) {
    const page = this.safeInteger(input.page, 1, 1, 100_000);
    const limit = this.safeInteger(input.limit, 24, 1, 100);
    const title = String(input.title ?? "").trim().slice(0, 120);
    const status = String(input.status ?? "").trim().toUpperCase();
    if (status && !PANDA_VIDEO_STATUSES.includes(status as PandaVideoStatus)) {
      throw new BadRequestException("Status de vídeo Panda inválido");
    }

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (title) params.set("title", title);
    if (status) params.set("status", status);
    const folder = this.config.get<string>("PANDA_FOLDER_ID")?.trim();
    if (folder) {
      if (!this.validVideoId(folder)) throw new ServiceUnavailableException("PANDA_FOLDER_ID inválido");
      params.set("folder_id", folder);
    }
    const body = await this.fetch<PandaListResponse>(`/videos?${params.toString()}`);
    const videos = Array.isArray(body) ? body : body.videos ?? [];
    return { videos: videos.map(video => this.normalize(video)), page, limit, hasMore: videos.length === limit };
  }

  async getVideo(videoId: string) {
    const normalizedId = videoId.trim();
    if (!this.validVideoId(normalizedId)) throw new BadRequestException("ID de vídeo Panda inválido");
    const body = await this.fetch<PandaVideo>(`/videos/${encodeURIComponent(normalizedId)}`);
    return this.normalize(body);
  }

  async fromUrl(input: string) {
    const safe = this.safePandaPlayerUrl(input.trim());
    const externalId = safe ? new URL(safe).searchParams.get("v") : null;
    if (!safe || !this.validVideoId(externalId)) throw new BadRequestException("Cole uma URL de incorporação válida do Panda Video.");
    // Player URLs carry the public external ID, not the API/library ID.
    const body = await this.fetch<PandaVideo>(`/videos/${encodeURIComponent(externalId!)}?external_id`);
    const video = this.normalize(body);
    if (video.providerExternalId !== externalId) throw new BadRequestException("O Panda retornou um vídeo diferente do link informado.");
    return video;
  }

  async refreshByExternalOrInternal(id: string) {
    const normalizedId = id.trim();
    if (!this.validVideoId(normalizedId)) throw new BadRequestException("ID de vídeo Panda inválido");
    try {
      return await this.getVideo(normalizedId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    const body = await this.fetch<PandaVideo>(`/videos/${encodeURIComponent(normalizedId)}?external_id`);
    return this.normalize(body);
  }

  buildPlayback(asset: ProviderVideo, viewer: ViewerIdentity, sessionId: string) {
    const playerUrl = this.safePandaPlayerUrl(asset.playerUrl);
    if (!playerUrl || !this.validVideoId(asset.providerExternalId)) {
      throw new ServiceUnavailableException("Vídeo Panda sem player oficial ou ID externo válido");
    }
    const url = new URL(playerUrl);
    url.searchParams.set("v", asset.providerExternalId!);
    url.searchParams.set("saveProgress", "false");
    url.searchParams.set("customName", sessionId);

    const drm = pandaDrmCredentials(this.config);
    const requireDrm = pandaDrmRequired(this.config);
    if (drm.partial || (drm.groupId && !drm.groupIdValid)) {
      throw new ServiceUnavailableException("Configuração DRM Panda inválida");
    }
    if (drm.configured) {
      const name = this.watermarkValue(viewer.name, 74);
      const email = this.watermarkValue(viewer.email, 112);
      const viewerId = this.watermarkValue(viewer.id, 76);
      if (!name || !email || !viewerId) throw new ServiceUnavailableException("Identificação do aluno incompleta para watermark");
      const ttl = Math.min(86400, Math.max(1800, Number(this.config.get("PANDA_WATERMARK_TTL_SEC") ?? 28800) || 28800));
      let token: string;
      try {
        token = sign({
          drm_group_id: drm.groupId,
          string1: `Nome: ${name}`,
          string2: `E-mail: ${email}`,
          string3: `ID: ${viewerId}`,
        }, drm.secret, { expiresIn: ttl, algorithm: "HS256" });
      } catch {
        throw new ServiceUnavailableException("Não foi possível autorizar o DRM Panda");
      }
      url.searchParams.set("watermark", token);
    } else if (requireDrm) {
      throw new ServiceUnavailableException("PANDA_DRM_GROUP_ID/PANDA_DRM_GROUP_SECRET não configurados");
    }

    return { provider: "PANDA" as const, playerUrl: url.toString(), videoExternalId: asset.providerExternalId! };
  }

  mapStatus(status?: string): ProviderVideo["status"] {
    const normalized = String(status ?? "").trim().toUpperCase();
    if (normalized === "CONVERTED") return "READY";
    if (normalized === "FAILED" || normalized === "BLOCKED") return "ERROR";
    if (normalized === "DRAFT") return "UPLOADING";
    return "PROCESSING";
  }

  validVideoId(value?: string | null) {
    return Boolean(value && PANDA_UUID_PATTERN.test(value));
  }

  private normalize(video: PandaVideo): ProviderVideo {
    const providerAssetId = String(video.id ?? "").trim();
    if (!this.validVideoId(providerAssetId)) throw new ServiceUnavailableException("Panda retornou um vídeo sem ID válido");
    const providerExternalId = this.validVideoId(video.video_external_id) ? video.video_external_id! : null;
    const playerUrl = this.safePandaPlayerUrl(video.video_player);
    const thumbnailUrl = this.safeHttpsUrl(video.thumbnail);
    const duration = Number(video.length);
    let status = this.mapStatus(video.status);
    if (status === "READY" && (!providerExternalId || !playerUrl)) status = "PROCESSING";
    return {
      provider: "PANDA",
      providerAssetId,
      providerExternalId,
      providerLibraryId: (video.pullzone_name as string | undefined) ?? video.library_id ?? null,
      playerUrl,
      thumbnailUrl,
      durationSec: Number.isFinite(duration) && duration >= 0 ? Math.ceil(duration) : null,
      status,
      error: status === "ERROR" ? `Panda retornou status ${video.status ?? "FAILED"}` : null,
      metadata: {
        title: video.title ?? null,
        folderId: video.folder_id ?? null,
        pandaStatus: video.status ?? null,
        libraryId: video.library_id ?? null,
        pullzoneName: video.pullzone_name ?? null,
      },
    };
  }

  private async fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const key = this.config.get<string>("PANDA_API_KEY")?.trim();
    if (!key) throw new ServiceUnavailableException("PANDA_API_KEY não configurada");
    if (!path.startsWith("/")) throw new ServiceUnavailableException("Rota Panda inválida");
    const headers = new Headers(init.headers);
    headers.set("Authorization", key);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetch(`${PANDA_API_BASE_URL}${path}`, {
        ...init,
        headers,
        redirect: "error",
        signal: init.signal ?? AbortSignal.timeout(PANDA_API_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException("Panda Video indisponível ou fora do tempo limite");
    }
    if (!response.ok) {
      if (response.status === 400 || response.status === 422) throw new BadRequestException("Panda rejeitou os parâmetros da solicitação");
      if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException("PANDA_API_KEY inválida ou sem permissão");
      if (response.status === 404) throw new NotFoundException("Vídeo Panda não encontrado");
      if (response.status === 429) throw new ServiceUnavailableException("Limite de requisições da Panda atingido");
      throw new ServiceUnavailableException(`Panda Video respondeu HTTP ${response.status}`);
    }
    try {
      return await response.json() as T;
    } catch {
      throw new ServiceUnavailableException("Panda Video retornou uma resposta inválida");
    }
  }

  private safeInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
  }

  private safeHttpsUrl(value?: string | null) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  private safePandaPlayerUrl(value?: string | null) {
    const safe = this.safeHttpsUrl(value);
    if (!safe) return null;
    const url = new URL(safe);
    const host = url.hostname.toLowerCase();
    const officialHost = host === PANDA_PLAYER_HOST || host.endsWith(PANDA_PLAYER_SUFFIX);
    if (!officialHost || url.port || !/^\/embed\/?$/i.test(url.pathname)) return null;
    return url.toString();
  }

  private watermarkValue(value: string, maximumLength: number) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximumLength);
  }
}
