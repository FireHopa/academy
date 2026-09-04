import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1_000;

type RetentionPolicy = {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  maxBatchesPerRun: number;
  accountTokenDays: number;
  watchSessionDays: number;
  notificationReadDays: number;
  notificationUnreadDays: number;
  webhookEventDays: number;
  webhookFailedDays: number;
  integrationLogDays: number;
  auditLogDays: number;
  externalRawDays: number;
};

type Id = { id: string };

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async status() {
    const policy = this.policy();
    const cutoffs = this.cutoffs(policy);
    const [
      accountTokens,
      watchSessions,
      notificationsRead,
      notificationsUnread,
      webhookEvents,
      webhookEventsFailed,
      integrationLogs,
      auditLogs,
      externalCustomerRaw,
      externalSubscriptionRaw,
      protectedWebhookEvents,
      protectedWatchSessions,
    ] = await Promise.all([
      this.prisma.accountToken.count({ where: this.accountTokenWhere(cutoffs.accountToken) }),
      this.prisma.watchSession.count({ where: this.watchSessionWhere(cutoffs.watchSession) }),
      this.prisma.notification.count({ where: this.notificationReadWhere(cutoffs.notificationRead) }),
      this.prisma.notification.count({ where: this.notificationUnreadWhere(cutoffs.notificationUnread) }),
      this.prisma.webhookEvent.count({ where: this.webhookEventWhere(cutoffs.webhookEvent, ["PROCESSED", "IGNORED"]) }),
      this.prisma.webhookEvent.count({ where: this.webhookEventWhere(cutoffs.webhookFailed, ["FAILED"]) }),
      this.prisma.integrationLog.count({ where: { createdAt: { lte: cutoffs.integrationLog } } }),
      this.prisma.auditLog.count({ where: { createdAt: { lte: cutoffs.auditLog } } }),
      this.prisma.externalCustomer.count({ where: this.externalRawWhere(cutoffs.externalRaw) }),
      this.prisma.externalSubscription.count({ where: this.externalRawWhere(cutoffs.externalRaw) }),
      this.prisma.webhookEvent.count({ where: { status: "RECEIVED" } }),
      this.prisma.watchSession.count({ where: { status: "ACTIVE" } }),
    ]);

    return {
      enabled: policy.enabled,
      intervalMs: policy.intervalMs,
      batchSize: policy.batchSize,
      maxBatchesPerRun: policy.maxBatchesPerRun,
      policyDays: {
        accountTokens: policy.accountTokenDays,
        watchSessions: policy.watchSessionDays,
        notificationsRead: policy.notificationReadDays,
        notificationsUnread: policy.notificationUnreadDays,
        webhookEvents: policy.webhookEventDays,
        webhookEventsFailed: policy.webhookFailedDays,
        integrationLogs: policy.integrationLogDays,
        auditLogs: policy.auditLogDays,
        externalRaw: policy.externalRawDays,
      },
      eligible: {
        accountTokens,
        watchSessions,
        notificationsRead,
        notificationsUnread,
        webhookEvents,
        webhookEventsFailed,
        integrationLogs,
        auditLogs,
        externalCustomerRaw,
        externalSubscriptionRaw,
      },
      protected: {
        webhookEventsReceived: protectedWebhookEvents,
        watchSessionsActive: protectedWatchSessions,
      },
    };
  }

  async cleanup() {
    const startedAt = new Date();
    const policy = this.policy();
    const cutoffs = this.cutoffs(policy);

    const deleted = {
      accountTokens: await this.deleteBatches(
        () => this.prisma.accountToken.findMany({ where: this.accountTokenWhere(cutoffs.accountToken), orderBy: { expiresAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.accountToken.deleteMany({ where: { id: { in: ids }, ...this.accountTokenWhere(cutoffs.accountToken) } }),
        policy,
      ),
      watchSessions: await this.deleteBatches(
        () => this.prisma.watchSession.findMany({ where: this.watchSessionWhere(cutoffs.watchSession), orderBy: { lastSeenAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.watchSession.deleteMany({ where: { id: { in: ids }, ...this.watchSessionWhere(cutoffs.watchSession) } }),
        policy,
      ),
      notificationsRead: await this.deleteBatches(
        () => this.prisma.notification.findMany({ where: this.notificationReadWhere(cutoffs.notificationRead), orderBy: { createdAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.notification.deleteMany({ where: { id: { in: ids }, ...this.notificationReadWhere(cutoffs.notificationRead) } }),
        policy,
      ),
      notificationsUnread: await this.deleteBatches(
        () => this.prisma.notification.findMany({ where: this.notificationUnreadWhere(cutoffs.notificationUnread), orderBy: { createdAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.notification.deleteMany({ where: { id: { in: ids }, ...this.notificationUnreadWhere(cutoffs.notificationUnread) } }),
        policy,
      ),
      webhookEvents: await this.deleteBatches(
        () => this.prisma.webhookEvent.findMany({ where: this.webhookEventWhere(cutoffs.webhookEvent, ["PROCESSED", "IGNORED"]), orderBy: { processedAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.webhookEvent.deleteMany({ where: { id: { in: ids }, ...this.webhookEventWhere(cutoffs.webhookEvent, ["PROCESSED", "IGNORED"]) } }),
        policy,
      ),
      webhookEventsFailed: await this.deleteBatches(
        () => this.prisma.webhookEvent.findMany({ where: this.webhookEventWhere(cutoffs.webhookFailed, ["FAILED"]), orderBy: { processedAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.webhookEvent.deleteMany({ where: { id: { in: ids }, ...this.webhookEventWhere(cutoffs.webhookFailed, ["FAILED"]) } }),
        policy,
      ),
      integrationLogs: await this.deleteBatches(
        () => this.prisma.integrationLog.findMany({ where: { createdAt: { lte: cutoffs.integrationLog } }, orderBy: { createdAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.integrationLog.deleteMany({ where: { id: { in: ids }, createdAt: { lte: cutoffs.integrationLog } } }),
        policy,
      ),
      auditLogs: await this.deleteBatches(
        () => this.prisma.auditLog.findMany({ where: { createdAt: { lte: cutoffs.auditLog } }, orderBy: { createdAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.auditLog.deleteMany({ where: { id: { in: ids }, createdAt: { lte: cutoffs.auditLog } } }),
        policy,
      ),
    };

    const rawCleared = {
      externalCustomers: await this.clearRawBatches(
        () => this.prisma.externalCustomer.findMany({ where: this.externalRawWhere(cutoffs.externalRaw), orderBy: { updatedAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.externalCustomer.updateMany({ where: { id: { in: ids }, ...this.externalRawWhere(cutoffs.externalRaw) }, data: { raw: Prisma.DbNull } }),
        policy,
      ),
      externalSubscriptions: await this.clearRawBatches(
        () => this.prisma.externalSubscription.findMany({ where: this.externalRawWhere(cutoffs.externalRaw), orderBy: { updatedAt: "asc" }, take: policy.batchSize, select: { id: true } }),
        ids => this.prisma.externalSubscription.updateMany({ where: { id: { in: ids }, ...this.externalRawWhere(cutoffs.externalRaw) }, data: { raw: Prisma.DbNull } }),
        policy,
      ),
    };

    const finishedAt = new Date();
    const result = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      deleted,
      rawCleared,
    };
    this.logger.log(JSON.stringify({ event: "data_retention_cleanup", ...result }));
    return result;
  }

  private async deleteBatches(
    find: () => Promise<Id[]>,
    remove: (ids: string[]) => Promise<{ count: number }>,
    policy: RetentionPolicy,
  ) {
    let affected = 0;
    for (let batch = 0; batch < policy.maxBatchesPerRun; batch += 1) {
      const rows = await find();
      if (!rows.length) break;
      affected += (await remove(rows.map(row => row.id))).count;
      if (rows.length < policy.batchSize) break;
    }
    return affected;
  }

  private clearRawBatches(
    find: () => Promise<Id[]>,
    update: (ids: string[]) => Promise<{ count: number }>,
    policy: RetentionPolicy,
  ) {
    return this.deleteBatches(find, update, policy);
  }

  private accountTokenWhere(cutoff: Date): Prisma.AccountTokenWhereInput {
    return { OR: [{ expiresAt: { lte: cutoff } }, { usedAt: { lte: cutoff } }] };
  }

  private watchSessionWhere(cutoff: Date): Prisma.WatchSessionWhereInput {
    return {
      status: { not: "ACTIVE" },
      OR: [
        { endedAt: { lte: cutoff } },
        { endedAt: null, lastSeenAt: { lte: cutoff } },
      ],
    };
  }

  private notificationReadWhere(cutoff: Date): Prisma.NotificationWhereInput {
    return { readAt: { not: null }, createdAt: { lte: cutoff } };
  }

  private notificationUnreadWhere(cutoff: Date): Prisma.NotificationWhereInput {
    return { readAt: null, createdAt: { lte: cutoff } };
  }

  private webhookEventWhere(
    cutoff: Date,
    statuses: Array<"PROCESSED" | "IGNORED" | "FAILED">,
  ): Prisma.WebhookEventWhereInput {
    return { status: { in: statuses }, processedAt: { lte: cutoff } };
  }

  private externalRawWhere(cutoff: Date): Prisma.ExternalCustomerWhereInput & Prisma.ExternalSubscriptionWhereInput {
    return { raw: { not: Prisma.AnyNull }, updatedAt: { lte: cutoff } };
  }

  private cutoffs(policy: RetentionPolicy) {
    const before = (days: number) => new Date(Date.now() - days * DAY_MS);
    return {
      accountToken: before(policy.accountTokenDays),
      watchSession: before(policy.watchSessionDays),
      notificationRead: before(policy.notificationReadDays),
      notificationUnread: before(policy.notificationUnreadDays),
      webhookEvent: before(policy.webhookEventDays),
      webhookFailed: before(policy.webhookFailedDays),
      integrationLog: before(policy.integrationLogDays),
      auditLog: before(policy.auditLogDays),
      externalRaw: before(policy.externalRawDays),
    };
  }

  private policy(): RetentionPolicy {
    return {
      enabled: this.booleanConfig("DATA_RETENTION_ENABLED", true),
      intervalMs: this.numberConfig("DATA_RETENTION_INTERVAL_MS", 24 * 60 * 60_000, 60 * 60_000, 30 * 24 * 60 * 60_000),
      batchSize: this.numberConfig("DATA_RETENTION_BATCH_SIZE", 500, 10, 5_000),
      maxBatchesPerRun: this.numberConfig("DATA_RETENTION_MAX_BATCHES_PER_RUN", 10, 1, 100),
      accountTokenDays: this.numberConfig("ACCOUNT_TOKEN_RETENTION_DAYS", 7, 1, 365),
      watchSessionDays: this.numberConfig("WATCH_SESSION_RETENTION_DAYS", 90, 7, 730),
      notificationReadDays: this.numberConfig("NOTIFICATION_READ_RETENTION_DAYS", 180, 7, 1_825),
      notificationUnreadDays: this.numberConfig("NOTIFICATION_UNREAD_RETENTION_DAYS", 365, 30, 1_825),
      webhookEventDays: this.numberConfig("WEBHOOK_EVENT_RETENTION_DAYS", 90, 7, 730),
      webhookFailedDays: this.numberConfig("WEBHOOK_FAILED_RETENTION_DAYS", 180, 30, 1_825),
      integrationLogDays: this.numberConfig("INTEGRATION_LOG_RETENTION_DAYS", 180, 7, 1_825),
      auditLogDays: this.numberConfig("AUDIT_LOG_RETENTION_DAYS", 365, 30, 3_650),
      externalRawDays: this.numberConfig("EXTERNAL_RAW_RETENTION_DAYS", 30, 1, 365),
    };
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
