import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";

export type DeviceInput = {
  deviceFingerprint: string;
  deviceLabel?: string;
};

type HeartbeatOutcome =
  | { ok: true; active: true; nextHeartbeatSec: number }
  | { ok: false; code: "PLAYBACK_SESSION_ENDED" | "PLAYBACK_AUTHORIZATION_REVOKED"; reason: string };

@Injectable()
export class PlaybackSessionService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async start(user: AuthUser, lessonId: string, input: DeviceInput, request: Request, takeover = false, initialPositionSec = 0) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.staleSec() * 1000);
    const isStaff = user.role === "ADMIN" || user.role === "INSTRUCTOR";
    const bypassLimits = isStaff && this.staffBypass();

    return this.prisma.$transaction(async (tx) => {
      // Serializa alterações de limite por usuário para evitar duas abas/aparelhos furarem o limite em corrida.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.sub}))`;

      await tx.watchSession.updateMany({
        where: { userId: user.sub, status: "ACTIVE", lastSeenAt: { lt: staleBefore } },
        data: { status: "ENDED", endedAt: now, blockReason: "heartbeat_timeout" },
      });

      const existingDevice = await tx.device.findUnique({
        where: { userId_fingerprint: { userId: user.sub, fingerprint: input.deviceFingerprint } },
      });

      let device = existingDevice;
      if (!device || device.revokedAt) {
        if (!bypassLimits) {
          const activeDevices = await tx.device.count({ where: { userId: user.sub, revokedAt: null } });
          if (activeDevices >= this.maxDevices()) {
            throw new ForbiddenException({
              code: "DEVICE_LIMIT",
              message: `Sua conta atingiu o limite de ${this.maxDevices()} dispositivos autorizados.`,
              maxDevices: this.maxDevices(),
            });
          }
        }

        device = existingDevice
          ? await tx.device.update({
              where: { id: existingDevice.id },
              data: {
                revokedAt: null,
                label: input.deviceLabel || existingDevice.label,
                userAgent: request.get("user-agent") || existingDevice.userAgent,
                lastIp: this.requestIp(request),
                lastSeenAt: now,
              },
            })
          : await tx.device.create({
              data: {
                userId: user.sub,
                fingerprint: input.deviceFingerprint,
                label: input.deviceLabel || "Navegador",
                userAgent: request.get("user-agent") || undefined,
                lastIp: this.requestIp(request),
                lastSeenAt: now,
              },
            });
      } else {
        device = await tx.device.update({
          where: { id: device.id },
          data: {
            label: input.deviceLabel || device.label,
            userAgent: request.get("user-agent") || device.userAgent,
            lastIp: this.requestIp(request),
            lastSeenAt: now,
          },
        });
      }

      // Uma troca de aula no mesmo aparelho não deve consumir uma segunda reprodução simultânea.
      await tx.watchSession.updateMany({
        where: { userId: user.sub, deviceId: device.id, status: "ACTIVE" },
        data: { status: "ENDED", endedAt: now, blockReason: "same_device_new_playback" },
      });

      const activeElsewhere = await tx.watchSession.findMany({
        where: { userId: user.sub, status: "ACTIVE", deviceId: { not: device.id } },
        include: { device: { select: { label: true } }, lesson: { select: { title: true } } },
        orderBy: { startedAt: "desc" },
      });

      if (!bypassLimits && activeElsewhere.length >= this.maxConcurrent()) {
        if (!takeover) {
          throw new ConflictException({
            code: "CONCURRENT_STREAM_LIMIT",
            message: `Sua conta já está reproduzindo em ${this.maxConcurrent()} aparelho${this.maxConcurrent() > 1 ? "s" : ""}.`,
            maxConcurrent: this.maxConcurrent(),
            activeSessions: activeElsewhere.slice(0, 3).map((session) => ({
              id: session.id,
              deviceLabel: session.device?.label || "Outro dispositivo",
              lessonTitle: session.lesson.title,
              startedAt: session.startedAt,
              lastSeenAt: session.lastSeenAt,
            })),
          });
        }

        await tx.watchSession.updateMany({
          where: { userId: user.sub, status: "ACTIVE", deviceId: { not: device.id } },
          data: { status: "BLOCKED", endedAt: now, blockReason: "taken_over_by_user" },
        });
      }

      const session = await tx.watchSession.create({
        data: {
          userId: user.sub,
          lessonId,
          deviceId: device.id,
          playbackNonce: randomUUID(),
          ipAddress: this.requestIp(request),
          lastSeenAt: now,
          lastPositionSec: Math.max(0, Math.floor(initialPositionSec)),
        },
      });

      return {
        device: { id: device.id, label: device.label },
        session: { id: session.id, nonce: session.playbackNonce, startedAt: session.startedAt },
      };
    });
  }

  async heartbeat(user: AuthUser, sessionId: string, positionSec?: number) {
    const now = new Date();
    const outcome: HeartbeatOutcome = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`playback-heartbeat:${sessionId}`}))`;
      const session = await tx.watchSession.findFirst({
        where: { id: sessionId, userId: user.sub },
        include: {
          device: { select: { revokedAt: true } },
          lesson: {
            select: {
              published: true,
              preview: true,
              durationSec: true,
              videoResource: { select: { durationSec: true } },
              module: { select: { course: { select: { id: true, status: true } } } },
            },
          },
        },
      });
      if (!session) throw new NotFoundException("Sessão de reprodução não encontrada");
      if (session.status !== "ACTIVE" || session.device?.revokedAt) {
        return {
          ok: false as const,
          code: "PLAYBACK_SESSION_ENDED" as const,
          reason: session.blockReason || (session.device?.revokedAt ? "device_revoked" : "session_inactive"),
        };
      }

      const course = session.lesson.module.course;
      if (!session.lesson.published || course.status !== "PUBLISHED") {
        const reason = course.status !== "PUBLISHED" ? "course_unpublished" : "lesson_unpublished";
        await this.blockSession(tx, session.id, reason, now);
        return { ok: false as const, code: "PLAYBACK_AUTHORIZATION_REVOKED" as const, reason };
      }

      const isStaff = user.role === "ADMIN" || user.role === "INSTRUCTOR";
      if (!isStaff && !session.lesson.preview) {
        const enrollment = await tx.enrollment.findUnique({
          where: { userId_courseId: { userId: user.sub, courseId: course.id } },
          select: { status: true, startsAt: true, expiresAt: true },
        });
        const active = enrollment?.status === "ACTIVE"
          && enrollment.startsAt <= now
          && (!enrollment.expiresAt || enrollment.expiresAt > now);
        if (!active) {
          await this.blockSession(tx, session.id, "course_access_inactive", now);
          return { ok: false as const, code: "PLAYBACK_AUTHORIZATION_REVOKED" as const, reason: "course_access_inactive" };
        }
      }

      const elapsedSec = Math.max(0, Math.min(this.heartbeatSec() * 2, Math.floor((now.getTime() - session.lastSeenAt.getTime()) / 1000)));
      const durationSec = session.lesson.videoResource?.durationSec ?? session.lesson.durationSec;
      const normalizedPosition = positionSec === undefined
        ? undefined
        : Math.max(0, Math.min(Math.floor(positionSec), durationSec ?? positionSec));
      const creditedSec = normalizedPosition === undefined
        ? 0
        : this.watchedCredit(elapsedSec, session.lastPositionSec, normalizedPosition);

      await tx.watchSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          ...(creditedSec > 0 ? {
            watchedSec: { increment: creditedSec },
            maxCreditedPositionSec: Math.max(session.maxCreditedPositionSec, normalizedPosition ?? 0),
          } : {}),
          ...(normalizedPosition === undefined ? {} : { lastPositionSec: normalizedPosition }),
        },
      });
      if (session.deviceId) await tx.device.update({ where: { id: session.deviceId }, data: { lastSeenAt: now } });

      return { ok: true as const, active: true as const, nextHeartbeatSec: this.heartbeatSec() };
    });

    if (!outcome.ok) {
      throw new ForbiddenException({
        code: outcome.code,
        message: outcome.code === "PLAYBACK_SESSION_ENDED"
          ? "Esta reprodução foi encerrada ou perdeu a autorização."
          : "Esta reprodução perdeu a autorização.",
        reason: outcome.reason,
      });
    }
    return { active: outcome.active, nextHeartbeatSec: outcome.nextHeartbeatSec };
  }

  async end(user: AuthUser, sessionId: string, reason = "client_ended") {
    const session = await this.prisma.watchSession.findFirst({ where: { id: sessionId, userId: user.sub } });
    if (!session) return { ended: true };
    if (session.status === "ACTIVE") {
      await this.prisma.watchSession.update({
        where: { id: session.id },
        data: { status: "ENDED", endedAt: new Date(), blockReason: reason },
      });
    }
    return { ended: true };
  }

  async listDevices(user: AuthUser) {
    const staleBefore = new Date(Date.now() - this.staleSec() * 1000);
    await this.prisma.watchSession.updateMany({
      where: { userId: user.sub, status: "ACTIVE", lastSeenAt: { lt: staleBefore } },
      data: { status: "ENDED", endedAt: new Date(), blockReason: "heartbeat_timeout" },
    });
    const devices = await this.prisma.device.findMany({
      where: { userId: user.sub, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      include: {
        watchSessions: {
          where: { status: "ACTIVE" },
          select: { id: true, lessonId: true, startedAt: true, lastSeenAt: true },
        },
      },
    });
    return {
      maxDevices: this.maxDevices(),
      maxConcurrentStreams: this.maxConcurrent(),
      devices: devices.map((device) => ({
        id: device.id,
        fingerprint: device.fingerprint,
        label: device.label,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
        activeSessions: device.watchSessions,
      })),
    };
  }

  async revokeDevice(user: AuthUser, deviceId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, userId: user.sub, revokedAt: null } });
    if (!device) throw new NotFoundException("Dispositivo não encontrado");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: device.id }, data: { revokedAt: now } }),
      this.prisma.watchSession.updateMany({
        where: { userId: user.sub, deviceId: device.id, status: "ACTIVE" },
        data: { status: "BLOCKED", endedAt: now, blockReason: "device_revoked" },
      }),
    ]);
    return { revoked: true };
  }

  async listSessions(user: AuthUser) {
    const staleBefore = new Date(Date.now() - this.staleSec() * 1000);
    await this.prisma.watchSession.updateMany({
      where: { userId: user.sub, status: "ACTIVE", lastSeenAt: { lt: staleBefore } },
      data: { status: "ENDED", endedAt: new Date(), blockReason: "heartbeat_timeout" },
    });
    const sessions = await this.prisma.watchSession.findMany({
      where: { userId: user.sub, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      include: { device: { select: { id: true, label: true } }, lesson: { select: { id: true, title: true } } },
    });
    return { sessions };
  }

  async endSessionByUser(user: AuthUser, sessionId: string) {
    return this.end(user, sessionId, "ended_from_security_page");
  }

  heartbeatSec() {
    return this.numberConfig("WATCH_SESSION_HEARTBEAT_SEC", 20, 10, 60);
  }

  staleSec() {
    return this.numberConfig("WATCH_SESSION_STALE_SEC", 75, this.heartbeatSec() * 2, 300);
  }

  private maxDevices() {
    return this.numberConfig("MAX_DEVICES_PER_USER", 2, 1, 20);
  }

  private maxConcurrent() {
    return this.numberConfig("MAX_CONCURRENT_STREAMS_PER_USER", 1, 1, 10);
  }

  private staffBypass() {
    return String(this.config.get("STAFF_PLAYBACK_LIMIT_BYPASS") ?? "true").toLowerCase() !== "false";
  }

  private async blockSession(tx: Pick<PrismaService, "watchSession">, sessionId: string, reason: string, endedAt: Date) {
    await tx.watchSession.updateMany({
      where: { id: sessionId, status: "ACTIVE" },
      data: { status: "BLOCKED", blockReason: reason, endedAt },
    });
  }

  private watchedCredit(elapsedSec: number, previousPositionSec: number, positionSec: number) {
    const advancedSec = positionSec - previousPositionSec;
    if (elapsedSec <= 0 || advancedSec <= 0) return 0;
    const plausibleAdvance = elapsedSec * this.maxPlaybackRate() + this.seekToleranceSec();
    if (advancedSec > plausibleAdvance) return 0;
    return Math.min(elapsedSec, advancedSec);
  }

  private maxPlaybackRate() {
    return this.numberConfig("WATCH_PROGRESS_MAX_PLAYBACK_RATE", 2, 1, 4);
  }

  private seekToleranceSec() {
    return this.numberConfig("WATCH_PROGRESS_SEEK_TOLERANCE_SEC", 5, 0, 30);
  }

  private numberConfig(name: string, fallback: number, min: number, max: number) {
    const parsed = Number(this.config.get(name) ?? fallback);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  }

  private requestIp(request: Request) {
    return request.ip || request.socket?.remoteAddress || undefined;
  }
}
