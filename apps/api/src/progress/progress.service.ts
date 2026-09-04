import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, role: string, lessonId: string, positionSec: number, completed: boolean) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } }, videoResource: { select: { durationSec: true } } },
    });
    if (!lesson || !lesson.published || lesson.module.course.status !== "PUBLISHED") throw new NotFoundException("Aula não encontrada");

    if (role !== "ADMIN" && role !== "INSTRUCTOR" && !lesson.preview) {
      const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: lesson.module.courseId } } });
      const now = new Date();
      const active = enrollment?.status === "ACTIVE" && enrollment.startsAt <= now && (!enrollment.expiresAt || enrollment.expiresAt > now);
      if (!active) throw new ForbiddenException("Você não possui acesso a esta aula");
    }

    const durationSec = lesson.videoResource?.durationSec ?? lesson.durationSec;
    const normalizedPosition = durationSec ? Math.min(positionSec, durationSec) : positionSec;
    let serverCompleted = completed;
    if (lesson.type === "VIDEO" && durationSec) {
      // O cliente apenas sinaliza intenção de concluir. A decisão final é do servidor.
      const positionQualified = normalizedPosition >= Math.floor(durationSec * 0.92);
      let watchQualified = role === "ADMIN" || role === "INSTRUCTOR";
      if (role === "STUDENT" && completed && positionQualified) {
        const watch = await this.prisma.watchSession.aggregate({
          where: { userId, lessonId },
          _sum: { watchedSec: true },
          _max: { maxCreditedPositionSec: true },
        });
        // A posição final e o tempo creditado precisam ter sido confirmados pelos heartbeats do servidor.
        const heartbeatPositionQualified = (watch._max.maxCreditedPositionSec ?? 0) >= Math.floor(durationSec * 0.92);
        watchQualified = heartbeatPositionQualified
          && (watch._sum.watchedSec ?? 0) >= Math.floor(durationSec * 0.45);
      }
      serverCompleted = Boolean(completed && positionQualified && watchQualified);
    }

    const existingProgress = await this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
    const progress = existingProgress
      ? await this.prisma.lessonProgress.update({
          where: { userId_lessonId: { userId, lessonId } },
          data: {
            positionSec: normalizedPosition,
            ...(serverCompleted && !existingProgress.completed ? { completed: true, completedAt: new Date() } : {}),
          },
        })
      : await this.prisma.lessonProgress.create({
          data: { userId, lessonId, positionSec: normalizedPosition, completed: serverCompleted, completedAt: serverCompleted ? new Date() : null },
        });

    let certificate = null;
    if (serverCompleted && role === "STUDENT" && lesson.module.course.certificateEnabled) {
      certificate = await this.issueCertificateIfEligible(userId, lesson.module.courseId);
    }
    return { progress, certificate };
  }

  private async issueCertificateIfEligible(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    const now = new Date();
    const active = enrollment?.status === "ACTIVE" && enrollment.startsAt <= now && (!enrollment.expiresAt || enrollment.expiresAt > now);
    if (!active) return null;

    const publishedLessons = await this.prisma.lesson.findMany({
      where: { published: true, module: { courseId } },
      select: { id: true },
    });
    if (!publishedLessons.length) return null;
    const completedCount = await this.prisma.lessonProgress.count({
      where: { userId, completed: true, lessonId: { in: publishedLessons.map(item => item.id) } },
    });
    if (completedCount !== publishedLessons.length) return null;

    const code = `CERT-${new Date().getFullYear()}-${randomBytes(8).toString("hex").toUpperCase()}`;
    return this.prisma.certificate.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: { userId, courseId, code },
    });
  }
}
