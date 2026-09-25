import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import type { Request } from "express";
import { PlaybackSessionService, type DeviceInput } from "./playback-session.service";
import { PandaVideoProvider } from "./providers/panda-video.provider";
import { MuxVideoProvider } from "./providers/mux-video.provider";
import { VimeoVideoProvider, parseVimeoUrl } from "./providers/vimeo-video.provider";
import { YoutubeVideoProvider } from "./providers/youtube-video.provider";
import type { ProviderVideo } from "./providers/video-provider.types";
import { academyManagedMuxMetadata, VideoAssetLifecycleService } from "./video-asset-lifecycle.service";

type MuxPlaybackId = { id: string; policy: string };
type MuxAssetData = {
  id: string;
  status?: string;
  duration?: number;
  upload_id?: string;
  passthrough?: string;
  playback_ids?: MuxPlaybackId[];
  errors?: { messages?: string[] };
};
type MuxWebhook = { type: string; data: MuxAssetData & { asset_id?: string } };
type PandaWebhook = { action?: string; video_id?: string; folder_id?: string; status?: string; video_external_id?: string };

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: PlaybackSessionService,
    private readonly panda: PandaVideoProvider,
    private readonly mux: MuxVideoProvider,
    @Optional() private readonly lifecycle?: VideoAssetLifecycleService,
    @Optional() private readonly youtube?: YoutubeVideoProvider,
    @Optional() private readonly vimeo?: VimeoVideoProvider,
  ) {}

  configuredProvider() {
    const raw = String(this.config.get("VIDEO_PROVIDER") ?? "panda").trim().toUpperCase();
    return raw === "MUX" ? "MUX" as const : "PANDA" as const;
  }

  async providerStatus() {
    return {
      active: this.configuredProvider(),
      panda: this.panda.configurationStatus(),
      mux: { configured: this.mux.configured() },
      youtube: { enabled: Boolean(this.youtube) },
      vimeo: { enabled: Boolean(this.vimeo) },
    };
  }

  async testPanda() {
    const connection = await this.panda.testConnection();
    const diagnostics = await this.pandaDiagnostics(true);
    return { ...connection, diagnostics: diagnostics.panda };
  }

  async pandaDiagnostics(knownConnected?: boolean) {
    const configuration = this.panda.configurationStatus();
    const linkedPandaVideo = { provider: "PANDA" as const, lessons: { some: {} } };
    const connection = knownConnected === undefined
      ? (configuration.configured ? this.panda.testConnection().then(() => true).catch(() => false) : Promise.resolve(false))
      : Promise.resolve(knownConnected);

    const [connected, videosLinked, processingVideos, errorVideos] = await Promise.all([
      connection,
      this.prisma.videoAsset.count({ where: linkedPandaVideo }),
      this.prisma.videoAsset.count({ where: { ...linkedPandaVideo, status: { in: ["UPLOADING", "PROCESSING"] } } }),
      this.prisma.videoAsset.count({ where: { ...linkedPandaVideo, status: "ERROR" } }),
    ]);

    return {
      panda: {
        connected,
        drm_enabled: configuration.drmRequired && configuration.drmConfigured,
        webhook_configured: configuration.webhookConfigured,
        videos_linked: videosLinked,
        processing_videos: processingVideos,
        error_videos: errorVideos,
      },
    };
  }

  videoAssetLifecycleStatus() {
    if (!this.lifecycle) throw new ServiceUnavailableException("Lifecycle de vídeos indisponível");
    return this.lifecycle.status();
  }

  async listPandaVideos(page = 1, title = "", status = "") {
    const result = await this.panda.listVideos({ page, limit: 24, title, status });
    return {
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
      videos: result.videos.map(video => ({
        providerAssetId: video.providerAssetId,
        thumbnailUrl: video.thumbnailUrl ?? null,
        durationSec: video.durationSec ?? null,
        status: video.status,
        metadata: {
          title: typeof video.metadata?.title === "string" ? video.metadata.title : null,
          pandaStatus: typeof video.metadata?.pandaStatus === "string" ? video.metadata.pandaStatus : null,
        },
      })),
    };
  }

  async attachPandaVideo(lessonId: string, pandaVideoId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true, videoResourceId: true } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    const video = await this.panda.getVideo(pandaVideoId);
    if (video.status === "ERROR") throw new BadRequestException("O vídeo Panda está com erro e não pode ser vinculado");
    const asset = await this.upsertVideoAsset(video);
    await this.lifecycle?.markDetached([lesson.videoResourceId]);
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoResourceId: asset.id,
        videoStatus: video.status,
        videoError: video.error ?? null,
        durationSec: video.durationSec ?? null,
        // Campos legados Mux deixam de ser fonte de verdade quando videoResourceId existe.
        videoUploadId: null,
        videoAssetId: null,
        videoPlaybackId: null,
      },
    });
    return this.getAdminVideoStatus(lessonId);
  }

  async refreshPandaVideo(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { videoResource: true } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    if (!lesson.videoResource || lesson.videoResource.provider !== "PANDA") throw new BadRequestException("A aula não possui vídeo Panda vinculado");
    const video = await this.panda.getVideo(lesson.videoResource.providerAssetId);
    const asset = await this.upsertVideoAsset(video);
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { videoStatus: asset.status, videoError: asset.error, durationSec: asset.durationSec } });
    return this.getAdminVideoStatus(lessonId);
  }

  async attachYoutubeVideo(lessonId: string, url: string, durationSec: number) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true, videoResourceId: true } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    if (!this.youtube) throw new ServiceUnavailableException("Integração YouTube indisponível");
    const video = this.youtube.fromUrl(url, durationSec);
    const asset = await this.upsertVideoAsset(video);
    await this.lifecycle?.markDetached([lesson.videoResourceId]);
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoResourceId: asset.id,
        videoStatus: "READY",
        videoError: null,
        durationSec: asset.durationSec,
        videoUploadId: null,
        videoAssetId: null,
        videoPlaybackId: null,
      },
    });
    return this.getAdminVideoStatus(lessonId);
  }

  async attachVideoUrl(lessonId: string, url: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true, videoResourceId: true } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    let video: ProviderVideo;
    if (parseVimeoUrl(url)) {
      if (!this.vimeo) throw new ServiceUnavailableException("Integração Vimeo indisponível");
      video = await this.vimeo.fromUrl(url);
    } else {
      video = await this.panda.fromUrl(url);
    }
    if (video.status !== "READY") throw new BadRequestException("O vídeo ainda não está pronto no provedor.");
    const asset = await this.upsertVideoAsset(video);
    await this.lifecycle?.markDetached([lesson.videoResourceId]);
    await this.prisma.lesson.update({ where: { id: lessonId }, data: {
      videoResourceId: asset.id, videoStatus: asset.status, videoError: null, durationSec: asset.durationSec,
      videoUploadId: null, videoAssetId: null, videoPlaybackId: null,
    } });
    return this.getAdminVideoStatus(lessonId);
  }

  async createDirectUpload(lessonId: string) {
    if (this.configuredProvider() !== "MUX") {
      throw new BadRequestException("Upload direto pela Casa do Ads está desativado para Panda por segurança. Envie o vídeo ao Panda e vincule pela Biblioteca Panda.");
    }
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    if (lesson.videoStatus === "READY" || lesson.videoStatus === "PROCESSING") throw new BadRequestException("Remova o vídeo atual antes de iniciar outro upload");
    if (lesson.videoStatus === "UPLOADING") throw new BadRequestException("Já existe um upload em andamento para esta aula");
    const response = await this.mux.createDirectUpload(lessonId);
    await this.lifecycle?.markDetached([lesson.videoResourceId]);
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { videoUploadId: response.data.id, videoStatus: "UPLOADING", videoError: null, videoResourceId: null } });
    return { uploadId: response.data.id, endpoint: response.data.url, status: "UPLOADING", provider: "MUX" };
  }

  async getAdminVideoStatus(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { videoResource: true },
    });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    const resource = lesson.videoResource;
    return {
      id: lesson.id,
      title: lesson.title,
      provider: resource?.provider ?? (lesson.videoPlaybackId ? "MUX" : null),
      videoStatus: resource?.status ?? lesson.videoStatus,
      videoError: resource?.error ?? lesson.videoError,
      durationSec: resource?.durationSec ?? lesson.durationSec,
      videoResource: resource ? {
        id: resource.id,
        provider: resource.provider,
        providerAssetId: resource.providerAssetId,
        providerExternalId: resource.providerExternalId,
        thumbnailUrl: resource.thumbnailUrl,
      } : null,
      // legado, mantido para migração/rollback do Mux
      videoUploadId: lesson.videoUploadId,
      videoAssetId: lesson.videoAssetId,
      videoPlaybackId: lesson.videoPlaybackId,
    };
  }

  async removeVideo(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { videoResource: true } });
    if (!lesson) throw new NotFoundException("Aula não encontrada");
    // Panda: desvincula apenas. Não apagamos remotamente por segurança.
    // Mux legado: preservamos a exclusão remota já existente somente se não houver VideoAsset abstrato.
    if (!lesson.videoResource && lesson.videoAssetId && this.mux.configured()) {
      try { await this.mux.deleteAsset(lesson.videoAssetId); }
      catch (error) { throw new ServiceUnavailableException(error instanceof Error ? `Não foi possível remover o vídeo do Mux: ${error.message}` : "Falha ao remover vídeo do Mux"); }
    }
    await this.lifecycle?.markDetached([lesson.videoResource?.id]);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { videoResourceId: null, videoUploadId: null, videoAssetId: null, videoPlaybackId: null, videoStatus: "EMPTY", videoError: null, durationSec: null },
      select: { id: true, videoStatus: true },
    });
  }

  verifyMuxWebhook(rawBody: Buffer, signatureHeader?: string) {
    const secret = this.config.get<string>("MUX_WEBHOOK_SECRET");
    if (!secret) throw new ServiceUnavailableException("MUX_WEBHOOK_SECRET não configurado");
    if (!signatureHeader) throw new UnauthorizedException("Assinatura Mux ausente");
    const pieces = Object.fromEntries(signatureHeader.split(",").map(part => { const [key, value] = part.split("=", 2); return [key?.trim(), value?.trim()]; }));
    const timestamp = pieces.t; const signature = pieces.v1;
    if (!timestamp || !signature) throw new UnauthorizedException("Assinatura Mux inválida");
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) throw new UnauthorizedException("Webhook Mux expirado");
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex"); const actualBuffer = Buffer.from(signature, "hex");
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) throw new UnauthorizedException("Assinatura Mux inválida");
  }

  verifyPandaWebhookToken(token?: string) {
    const expected = this.config.get<string>("PANDA_WEBHOOK_TOKEN")?.trim();
    if (!expected) throw new ServiceUnavailableException("PANDA_WEBHOOK_TOKEN não configurado");
    if (!token) throw new UnauthorizedException("Token de webhook Panda ausente");
    const a = Buffer.from(expected); const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException("Token de webhook Panda inválido");
  }

  async handlePandaWebhook(event: PandaWebhook) {
    if (event.action !== "video.changeStatus" || !event.video_id) return { received: true, ignored: true };
    if (!this.panda.validVideoId(event.video_id)) return { received: true, ignored: true, reason: "invalid_video_id" };
    const asset = await this.prisma.videoAsset.findFirst({
      where: { provider: "PANDA", OR: [{ providerAssetId: event.video_id }, ...(this.panda.validVideoId(event.video_external_id) ? [{ providerExternalId: event.video_external_id }] : [])] },
    });
    if (!asset) return { received: true, ignored: true, reason: "unlinked_video" };
    try {
      const fresh = await this.panda.getVideo(event.video_id);
      const updated = await this.upsertVideoAsset(fresh);
      await this.prisma.lesson.updateMany({ where: { videoResourceId: updated.id }, data: { videoStatus: updated.status, videoError: updated.error, durationSec: updated.durationSec } });
      return { received: true, status: updated.status };
    } catch (error) {
      let mapped = this.panda.mapStatus(event.status);
      if (mapped === "READY" && (!asset.providerExternalId || !asset.playerUrl)) mapped = "PROCESSING";
      await this.prisma.videoAsset.update({ where: { id: asset.id }, data: { status: mapped, error: mapped === "ERROR" ? "Panda informou falha de conversão" : null } });
      await this.prisma.lesson.updateMany({ where: { videoResourceId: asset.id }, data: { videoStatus: mapped, videoError: mapped === "ERROR" ? "Panda informou falha de conversão" : null } });
      return { received: true, status: mapped, hydrated: false };
    }
  }

  async handleMuxWebhook(event: MuxWebhook) {
    switch (event.type) {
      case "video.upload.asset_created": {
        const uploadId = event.data.id; const assetId = event.data.asset_id;
        if (!uploadId || !assetId) return { received: true, ignored: true };
        const lesson = await this.prisma.lesson.findUnique({ where: { videoUploadId: uploadId }, select: { id: true, videoUploadId: true } });
        if (!lesson || lesson.videoUploadId !== uploadId) return { received: true, ignored: true, reason: "stale_upload" };
        await this.prisma.lesson.update({ where: { id: lesson.id }, data: { videoAssetId: assetId, videoStatus: "PROCESSING", videoError: null } });
        return { received: true };
      }
      case "video.asset.ready": {
        const uploadId = event.data.upload_id;
        if (!uploadId) return { received: true, ignored: true };
        const lesson = await this.prisma.lesson.findUnique({ where: { videoUploadId: uploadId }, select: { id: true, videoUploadId: true } });
        if (!lesson || lesson.videoUploadId !== uploadId) return { received: true, ignored: true, reason: "stale_upload" };
        const drmPlayback = event.data.playback_ids?.find(p => p.policy === "drm");
        if (!drmPlayback) {
          await this.prisma.lesson.update({ where: { id: lesson.id }, data: { videoAssetId: event.data.id, videoStatus: "ERROR", videoError: "Asset Mux pronto sem Playback ID DRM." } });
          return { received: true, error: "missing_drm_playback_id" };
        }
        const providerAsset = await this.prisma.videoAsset.upsert({
          where: { provider_providerAssetId: { provider: "MUX", providerAssetId: event.data.id } },
          update: { providerExternalId: drmPlayback.id, status: "READY", durationSec: event.data.duration ? Math.ceil(event.data.duration) : null, error: null, metadata: academyManagedMuxMetadata() as any },
          create: { provider: "MUX", providerAssetId: event.data.id, providerExternalId: drmPlayback.id, status: "READY", durationSec: event.data.duration ? Math.ceil(event.data.duration) : null, metadata: academyManagedMuxMetadata() as any },
        });
        await this.prisma.lesson.update({ where: { id: lesson.id }, data: { videoResourceId: providerAsset.id, videoAssetId: event.data.id, videoPlaybackId: drmPlayback.id, videoStatus: "READY", videoError: null, durationSec: event.data.duration ? Math.ceil(event.data.duration) : undefined } });
        return { received: true };
      }
      case "video.asset.errored": {
        const uploadId = event.data.upload_id;
        if (!uploadId) return { received: true, ignored: true };
        const lesson = await this.prisma.lesson.findUnique({ where: { videoUploadId: uploadId }, select: { id: true, videoUploadId: true } });
        if (!lesson || lesson.videoUploadId !== uploadId) return { received: true, ignored: true, reason: "stale_upload" };
        const message = event.data.errors?.messages?.join(" | ") || "O Mux não conseguiu processar este vídeo.";
        await this.prisma.lesson.update({ where: { id: lesson.id }, data: { videoStatus: "ERROR", videoError: message } });
        return { received: true };
      }
      default: return { received: true, ignored: true };
    }
  }

  async playbackAccess(user: AuthUser, lessonId: string, device: DeviceInput, request: Request, takeover = false) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        description: true,
        published: true,
        preview: true,
        durationSec: true,
        videoStatus: true,
        videoPlaybackId: true,
        videoResource: true,
        module: { select: { course: { select: { id: true, title: true, slug: true, status: true } } } },
      },
    });
    if (!lesson || !lesson.published || lesson.module.course.status !== "PUBLISHED") throw new NotFoundException("Aula não encontrada ou não publicada");
    const effectiveStatus = lesson.videoResource?.status ?? lesson.videoStatus;
    if (effectiveStatus !== "READY") throw new BadRequestException("O vídeo desta aula ainda não está pronto para reprodução");

    const isStaff = user.role === "ADMIN" || user.role === "INSTRUCTOR";
    if (!lesson.preview && !isStaff) {
      const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.sub, courseId: lesson.module.course.id } } });
      const now = new Date(); const expired = enrollment?.expiresAt ? enrollment.expiresAt <= now : false; const notStarted = enrollment?.startsAt ? enrollment.startsAt > now : false;
      if (!enrollment || enrollment.status !== "ACTIVE" || expired || notStarted) throw new ForbiddenException("Você não possui acesso ativo a este curso");
    }

    const [modules, chapters, materials, transcript, progress] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseId: lesson.module.course.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          lessons: {
            where: { published: true },
            orderBy: { position: "asc" },
            select: { id: true, title: true, position: true, durationSec: true, videoStatus: true },
          },
        },
      }),
      this.prisma.lessonChapter.findMany({ where: { lessonId }, orderBy: { position: "asc" } }),
      this.prisma.lessonMaterial.findMany({ where: { lessonId }, orderBy: { position: "asc" } }),
      this.prisma.lessonTranscript.findUnique({ where: { lessonId } }),
      this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.sub, lessonId } } }),
    ]);
    const identity = { id: user.sub, name: user.name, email: user.email };
    const playbackDurationSec = lesson.videoResource?.durationSec ?? lesson.durationSec;
    const initialPositionSec = progress && !progress.completed
      ? Math.max(0, Math.min(progress.positionSec, playbackDurationSec ?? progress.positionSec))
      : 0;
    const playbackSession = await this.sessions.start(user, lesson.id, device, request, takeover, initialPositionSec);

    try {
      let playback;
      if (lesson.videoResource?.provider === "PANDA") {
        playback = this.panda.buildPlayback({
          provider: "PANDA",
          providerAssetId: lesson.videoResource.providerAssetId,
          providerExternalId: lesson.videoResource.providerExternalId,
          providerLibraryId: lesson.videoResource.providerLibraryId,
          playerUrl: lesson.videoResource.playerUrl,
          thumbnailUrl: lesson.videoResource.thumbnailUrl,
          durationSec: lesson.videoResource.durationSec,
          status: lesson.videoResource.status,
          error: lesson.videoResource.error,
          metadata: (lesson.videoResource.metadata as Record<string, unknown> | null) ?? null,
        }, identity, playbackSession.session.id);
      } else if (lesson.videoResource?.provider === "VIMEO") {
        if (!this.vimeo) throw new ServiceUnavailableException("Integração Vimeo indisponível");
        playback = this.vimeo.buildPlayback(lesson.videoResource);
      } else if (lesson.videoResource?.provider === "YOUTUBE") {
        if (!this.youtube) throw new ServiceUnavailableException("Integração YouTube indisponível");
        playback = this.youtube.buildPlayback({
          providerAssetId: lesson.videoResource.providerAssetId,
          providerExternalId: lesson.videoResource.providerExternalId,
        });
      } else {
        const playbackId = lesson.videoResource?.provider === "MUX" ? lesson.videoResource.providerExternalId : lesson.videoPlaybackId;
        if (!playbackId) throw new ServiceUnavailableException("Playback Mux não configurado");
        playback = this.mux.buildPlayback(playbackId, playbackSession.session.id, lesson.durationSec);
      }

      return {
        playback,
        viewer: identity,
        playbackSession: { id: playbackSession.session.id, startedAt: playbackSession.session.startedAt, heartbeatSec: this.sessions.heartbeatSec(), device: playbackSession.device },
        lesson: { id: lesson.id, title: lesson.title, description: lesson.description, durationSec: lesson.videoResource?.durationSec ?? lesson.durationSec },
        course: {
          id: lesson.module.course.id, title: lesson.module.course.title, slug: lesson.module.course.slug,
          modules: modules.map(module => ({
            id: module.id, title: module.title, position: module.position,
            lessons: module.lessons.map(item => ({ id: item.id, title: item.title, position: item.position, durationSec: item.durationSec, videoStatus: item.videoStatus })),
          })),
        },
        resources: {
          lesson: { id: lesson.id, title: lesson.title, description: lesson.description },
          chapters,
          materials,
          transcript: transcript ? { content: transcript.content, language: transcript.language, updatedAt: transcript.updatedAt } : null,
          progress: progress ? { positionSec: progress.positionSec, completed: progress.completed, completedAt: progress.completedAt } : null,
        },
      };
    } catch (error) {
      await this.sessions.end(user, playbackSession.session.id, "provider_playback_failed");
      throw error;
    }
  }

  private async upsertVideoAsset(video: ProviderVideo) {
    return this.prisma.videoAsset.upsert({
      where: { provider_providerAssetId: { provider: video.provider, providerAssetId: video.providerAssetId } },
      update: {
        providerExternalId: video.providerExternalId ?? null,
        providerLibraryId: video.providerLibraryId ?? null,
        playerUrl: video.playerUrl ?? null,
        thumbnailUrl: video.thumbnailUrl ?? null,
        status: video.status,
        durationSec: video.durationSec ?? null,
        error: video.error ?? null,
        metadata: (video.metadata ?? undefined) as any,
      },
      create: {
        provider: video.provider,
        providerAssetId: video.providerAssetId,
        providerExternalId: video.providerExternalId ?? null,
        providerLibraryId: video.providerLibraryId ?? null,
        playerUrl: video.playerUrl ?? null,
        thumbnailUrl: video.thumbnailUrl ?? null,
        status: video.status,
        durationSec: video.durationSec ?? null,
        error: video.error ?? null,
        metadata: (video.metadata ?? undefined) as any,
      },
    });
  }
}
