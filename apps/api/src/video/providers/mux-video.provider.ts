import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sign } from "jsonwebtoken";

const MUX_API_TIMEOUT_MS = 10_000;

@Injectable()
export class MuxVideoProvider {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return Boolean(this.config.get<string>("MUX_TOKEN_ID") && this.config.get<string>("MUX_TOKEN_SECRET"));
  }

  buildPlayback(playbackId: string, sessionId: string, durationSec?: number | null) {
    const configuredTtl = Number(this.config.get("PLAYBACK_TOKEN_TTL_SEC") ?? 28800);
    const baseTtl = Number.isFinite(configuredTtl) ? Math.max(1800, Math.min(86400, Math.floor(configuredTtl))) : 28800;
    const tokenTtl = Math.max(baseTtl, (durationSec ?? 0) + 1800);
    const restrictionId = this.config.get<string>("MUX_PLAYBACK_RESTRICTION_ID") || undefined;
    const params = { ...(restrictionId ? { playback_restriction_id: restrictionId } : {}), custom: { session_id: sessionId } };
    return {
      provider: "MUX" as const,
      playbackId,
      tokens: {
        playback: this.signMuxToken(playbackId, "v", tokenTtl, params),
        drm: this.signMuxToken(playbackId, "d", tokenTtl, params),
      },
    };
  }

  async createDirectUpload(lessonId: string) {
    this.assertUploadConfig();
    const drmConfigurationId = this.config.getOrThrow<string>("MUX_DRM_CONFIGURATION_ID");
    const corsOrigin = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    return this.fetch<{ data: { id: string; url: string; timeout?: number } }>("/video/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        cors_origin: corsOrigin,
        new_asset_settings: {
          passthrough: lessonId,
          advanced_playback_policies: [{ policy: "drm", drm_configuration_id: drmConfigurationId }],
          video_quality: "plus",
        },
      }),
    });
  }

  async deleteAsset(assetId: string) {
    await this.fetch(`/video/v1/assets/${assetId}`, { method: "DELETE" }, [404]);
  }

  private signMuxToken(subject: string, audience: "v" | "d", ttlSec: number, params?: Record<string, unknown>) {
    const keyId = this.config.get<string>("MUX_SIGNING_KEY_ID");
    const encodedPrivateKey = this.config.get<string>("MUX_PRIVATE_KEY");
    if (!keyId || !encodedPrivateKey) throw new ServiceUnavailableException("Chaves de assinatura do Mux não configuradas");
    let privateKey: string;
    try {
      privateKey = Buffer.from(encodedPrivateKey, "base64").toString("utf8");
      if (!privateKey.includes("PRIVATE KEY")) throw new Error("invalid key");
    } catch {
      throw new ServiceUnavailableException("MUX_PRIVATE_KEY deve ser a chave PEM privada codificada em base64");
    }
    const now = Math.floor(Date.now() / 1000);
    return sign({ sub: subject, aud: audience, exp: now + ttlSec, kid: keyId, ...(params ?? {}) }, privateKey, { algorithm: "RS256", noTimestamp: false });
  }

  private assertUploadConfig() {
    if (!this.configured()) throw new ServiceUnavailableException("MUX_TOKEN_ID/MUX_TOKEN_SECRET não configurados");
    if (!this.config.get<string>("MUX_DRM_CONFIGURATION_ID")) throw new ServiceUnavailableException("MUX_DRM_CONFIGURATION_ID não configurado");
  }

  private async fetch<T = unknown>(path: string, init: RequestInit, acceptedStatuses: number[] = []): Promise<T> {
    const id = this.config.get<string>("MUX_TOKEN_ID");
    const secret = this.config.get<string>("MUX_TOKEN_SECRET");
    if (!id || !secret) throw new ServiceUnavailableException("Credenciais Mux não configuradas");
    let response: Response;
    try {
      response = await fetch(`https://api.mux.com${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, ...(init.headers ?? {}) },
        signal: init.signal ?? AbortSignal.timeout(MUX_API_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException("Mux indisponível ou fora do tempo limite");
    }
    if (response.status === 204 || acceptedStatuses.includes(response.status)) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (body as any)?.error?.messages?.[0] || (body as any)?.error?.message || `Mux respondeu HTTP ${response.status}`;
      throw new ServiceUnavailableException(message);
    }
    return body as T;
  }
}
