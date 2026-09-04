import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditQueryDto } from "./dto/audit-query.dto";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|private.?key|raw.?body|invite|cpf|phone)/i;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

export function sanitizeAuditValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    const withoutUrlQuery = /^https?:\/\//i.test(value) ? value.split("?")[0] : value;
    return withoutUrlQuery.length > MAX_STRING_LENGTH ? `${withoutUrlQuery.slice(0, MAX_STRING_LENGTH)}…` : withoutUrlQuery;
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return "[BINARY]";
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => sanitizeAuditValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[${value.length - MAX_ARRAY_ITEMS} ITEM(S) OMITTED]`);
    return items;
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeAuditValue(item, depth + 1, seen);
  }
  return output;
}

type AuditRecord = {
  actorUserId?: string;
  actorName: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditRecord) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId || null,
          actorName: entry.actorName.slice(0, 120),
          actorEmail: entry.actorEmail.slice(0, 320),
          action: entry.action.slice(0, 100),
          entityType: entry.entityType.slice(0, 80),
          entityId: entry.entityId?.slice(0, 120) || null,
          ...(entry.before === undefined || entry.before === null ? {} : { before: sanitizeAuditValue(entry.before) as any }),
          ...(entry.after === undefined || entry.after === null ? {} : { after: sanitizeAuditValue(entry.after) as any }),
          ...(entry.metadata === undefined || entry.metadata === null ? {} : { metadata: sanitizeAuditValue(entry.metadata) as any }),
          ipAddress: entry.ipAddress?.slice(0, 80) || null,
          userAgent: entry.userAgent?.slice(0, 500) || null,
          requestId: entry.requestId.slice(0, 120),
        },
      });
      return true;
    } catch {
      this.logger.error(JSON.stringify({ event: "audit_log_write_failed", requestId: entry.requestId, action: entry.action }));
      return false;
    }
  }

  async snapshot(entityType: string, entityId?: string): Promise<unknown> {
    if (!entityId) return undefined;
    try {
      switch (entityType) {
        case "STUDENT":
          return this.prisma.user.findUnique({ where: { id: entityId }, select: { id: true, name: true, email: true, role: true, status: true, blockedAt: true, blockedReason: true, createdAt: true, updatedAt: true } });
        case "ENROLLMENT":
          return this.prisma.enrollment.findUnique({ where: { id: entityId }, select: { id: true, userId: true, courseId: true, status: true, source: true, startsAt: true, expiresAt: true, createdAt: true, updatedAt: true } });
        case "COURSE":
          return this.prisma.course.findUnique({ where: { id: entityId }, select: { id: true, title: true, slug: true, status: true, featured: true, publishedAt: true, heroImageUrl: true, cardImageUrl: true, updatedAt: true, categories: { select: { id: true } } } });
        case "COURSE_MODULE":
          return this.prisma.courseModule.findUnique({ where: { id: entityId }, select: { id: true, courseId: true, title: true, position: true, updatedAt: true } });
        case "COURSE_MODULE_ORDER":
          return this.prisma.courseModule.findMany({ where: { courseId: entityId }, orderBy: { position: "asc" }, select: { id: true, position: true } });
        case "LESSON":
          return this.prisma.lesson.findUnique({ where: { id: entityId }, select: { id: true, moduleId: true, title: true, type: true, position: true, durationSec: true, preview: true, published: true, videoStatus: true, videoResourceId: true, updatedAt: true } });
        case "MODULE_LESSON_ORDER":
          return this.prisma.lesson.findMany({ where: { moduleId: entityId }, orderBy: { position: "asc" }, select: { id: true, position: true } });
        case "LESSON_CONTENT":
          return this.prisma.lesson.findUnique({ where: { id: entityId }, select: { id: true, updatedAt: true, transcript: { select: { language: true, content: true } }, chapters: { orderBy: { position: "asc" }, select: { id: true, title: true, startSec: true, position: true } }, materials: { orderBy: { position: "asc" }, select: { id: true, title: true, type: true, url: true, position: true } } } });
        case "CATEGORY":
          return this.prisma.category.findUnique({ where: { id: entityId }, select: { id: true, name: true, slug: true, createdAt: true } });
        case "LEARNING_PATH":
          return this.prisma.learningPath.findUnique({ where: { id: entityId }, select: { id: true, title: true, slug: true, description: true, heroImageUrl: true, published: true, position: true, updatedAt: true, courses: { orderBy: { position: "asc" }, select: { courseId: true, position: true } } } });
        case "DEVICE":
          return this.prisma.device.findUnique({ where: { id: entityId }, select: { id: true, userId: true, label: true, revokedAt: true, lastSeenAt: true } });
        case "WATCH_SESSION":
          return this.prisma.watchSession.findUnique({ where: { id: entityId }, select: { id: true, userId: true, lessonId: true, deviceId: true, status: true, blockReason: true, startedAt: true, endedAt: true, lastSeenAt: true } });
        case "EXTERNAL_PRODUCT":
          return this.prisma.externalProduct.findUnique({ where: { id: entityId }, select: { id: true, provider: true, externalId: true, title: true, checkoutReferenceId: true, status: true, updatedAt: true, courses: { select: { courseId: true } } } });
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }

  async list(query: AuditQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(10, query.pageSize || 25));
    const q = query.q?.trim();
    const where: Record<string, any> = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      ...(q ? { OR: [
        { actorName: { contains: q, mode: "insensitive" } },
        { actorEmail: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { requestId: { contains: q, mode: "insensitive" } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
