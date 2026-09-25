export type VideoProviderName = "PANDA" | "MUX" | "YOUTUBE" | "VIMEO";

export type ProviderVideoStatus = "EMPTY" | "UPLOADING" | "PROCESSING" | "READY" | "ERROR";

export type ProviderVideo = {
  provider: VideoProviderName;
  providerAssetId: string;
  providerExternalId?: string | null;
  providerLibraryId?: string | null;
  playerUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  status: ProviderVideoStatus;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ViewerIdentity = {
  id: string;
  name: string;
  email: string;
};

export type ProviderPlayback =
  | {
      provider: "PANDA";
      playerUrl: string;
      videoExternalId: string;
    }
  | {
      provider: "MUX";
      playbackId: string;
      tokens: { playback: string; drm: string };
    }
  | {
      provider: "YOUTUBE" | "VIMEO";
      videoId: string;
      embedUrl: string;
    };
