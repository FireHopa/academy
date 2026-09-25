import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MuxVideoProvider } from "./providers/mux-video.provider";

type AssetMetadata = Record<string, unknown>;

export function academyManagedMuxMetadata(metadata?: unknown): AssetMetadata {
  const current = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as AssetMetadata
    : {};
  const currentLifecycle = current.lifecycle && typeof current.lifecycle === "object" && !Array.isArray(current.lifecycle)
    ? current.lifecycle as AssetMetadata
    : {};
  return {
    ...current,
    lifecycle: {
      ...currentLifecycle,
      remoteOwned: true,
      source: "academy-direct-upload",
    },
  };
}

@Injectable()
export class VideoAssetLifecycleService {
  private readonly logger = new Logger(VideoAssetLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mux: MuxVideoProvider,
  ) {}

  async markDetached(assetIds: Array<string | null | undefined>) {
    const ids = [...new Set(assetIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return { touched: 0 };
    const result = await this.prisma.videoAsset.updateMany({
      where: { id: { in: ids } },
      data: { updatedAt: new Date() },
    });
    return { touched: result.count };
  }

  async status() {
    const cutoff = this.cutoff();
    const base = { lessons: { none: {} } } as const;
    const [orphaned, eligible, panda, mux, youtube, managedMux] = await Promise.all([
      this.prisma.videoAsset.count({ where: base }),
      this.prisma.videoAsset.count({ where: { ...base, updatedAt: { lte: cutoff } } }),
      this.prisma.videoAsset.count({ where: { ...base, provider: "PANDA" } }),
      this.prisma.videoAsset.count({ where: { ...base, provider: "MUX" } }),
      this.prisma.videoAsset.count({ where: { ...base, provider: "YOUTUBE" } }),
      this.prisma.videoAsset.count({
        where: {
          ...base,
          provider: "MUX",
          metadata: { path: ["lifecycle", "remoteOwned"], equals: true },
        },
      }),
    ]);
    return {
      orphaned,
      eligible,
      panda,
      mux,
      youtube,
      muxManaged: managedMux,
      muxManualReview: Math.max(0, mux - managedMux),
      graceHours: this.graceHours(),
      deleteUnmarkedMux: this.booleanConfig("VIDEO_ASSET_CLEANUP_DELETE_UNMARKED_MUX", false),
    };
  }

  async cleanupOrphans() {
    const cutoff = this.cutoff();
    const limit = this.numberConfig("VIDEO_ASSET_CLEANUP_BATCH_SIZE", 100, 1, 500);
    const deleteUnmarkedMux = this.booleanConfig("VIDEO_ASSET_CLEANUP_DELETE_UNMARKED_MUX", false);
    const assets = await this.prisma.videoAsset.findMany({
      where: { lessons: { none: {} }, updatedAt: { lte: cutoff } },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true, provider: true, providerAssetId: true, metadata: true, updatedAt: true },
    });
    const result = {
      scanned: assets.length,
      deletedLocal: 0,
      deletedRemote: 0,
      preservedPandaRemote: 0,
      preservedYoutubeRemote: 0,
      preservedVimeoRemote: 0,
      manualReview: 0,
      deferred: 0,
      failed: 0,
      skippedRelinked: 0,
    };

    for (const asset of assets) {
      if (asset.provider === "PANDA" || asset.provider === "YOUTUBE" || asset.provider === "VIMEO") {
        const deleted = await this.deleteLocalIfStillOrphan(asset.id, cutoff);
        if (deleted) {
          result.deletedLocal += 1;
          if (asset.provider === "PANDA") result.preservedPandaRemote += 1;
          else if (asset.provider === "YOUTUBE") result.preservedYoutubeRemote += 1;
          else result.preservedVimeoRemote += 1;
        } else {
          result.skippedRelinked += 1;
        }
        continue;
      }

      const remoteOwned = this.remoteOwned(asset.metadata);
      if (!remoteOwned && !deleteUnmarkedMux) {
        result.manualReview += 1;
        continue;
      }
      if (!this.mux.configured()) {
        result.deferred += 1;
        continue;
      }

      const current = await this.prisma.videoAsset.findUnique({
        where: { id: asset.id },
        select: { providerAssetId: true, updatedAt: true, _count: { select: { lessons: true } } },
      });
      if (!current || current._count.lessons > 0 || current.updatedAt > cutoff) {
        result.skippedRelinked += 1;
        continue;
      }

      try {
        await this.mux.deleteAsset(current.providerAssetId);
        result.deletedRemote += 1;
        const deleted = await this.deleteLocalIfStillOrphan(asset.id, cutoff);
        if (deleted) result.deletedLocal += 1;
        else result.skippedRelinked += 1;
      } catch {
        result.failed += 1;
        this.logger.warn(`Não foi possível concluir a limpeza do VideoAsset ${asset.id}; o registro foi preservado para nova tentativa`);
      }
    }

    return result;
  }

  private async deleteLocalIfStillOrphan(id: string, cutoff: Date) {
    const deleted = await this.prisma.videoAsset.deleteMany({
      where: { id, lessons: { none: {} }, updatedAt: { lte: cutoff } },
    });
    return deleted.count === 1;
  }

  private remoteOwned(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const lifecycle = (metadata as AssetMetadata).lifecycle;
    return Boolean(lifecycle && typeof lifecycle === "object" && !Array.isArray(lifecycle) && (lifecycle as AssetMetadata).remoteOwned === true);
  }

  private cutoff() {
    return new Date(Date.now() - this.graceHours() * 60 * 60 * 1_000);
  }

  private graceHours() {
    return this.numberConfig("VIDEO_ASSET_ORPHAN_GRACE_HOURS", 24, 1, 24 * 30);
  }

  private booleanConfig(key: string, fallback: boolean) {
    const value = this.config.get(key);
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "sim", "on"].includes(String(value).trim().toLowerCase());
  }

  private numberConfig(key: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(this.config.get(key) ?? fallback);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
  }
}
