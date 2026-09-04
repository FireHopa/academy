import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { RedisService } from "../redis/redis.service";
import { JobProcessorService } from "./job-processor.service";
import { JobQueueService } from "./job-queue.service";
import { AcademyJob, WORKER_HEARTBEAT_KEY, type AcademyJobName } from "./jobs.types";
import { bullRedisOptions, queueBooleanConfig, queueNumberConfig } from "./queue-connection";

@Injectable()
export class JobWorkerService implements OnApplicationShutdown {
  private readonly logger = new Logger(JobWorkerService.name);
  private worker: Worker | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly processor: JobProcessorService,
    private readonly jobs: JobQueueService,
  ) {}

  async start() {
    if (this.worker) return;
    const concurrency = queueNumberConfig(this.config, "JOBS_WORKER_CONCURRENCY", 5, 1, 50);
    const worker = new Worker(
      this.jobs.queueName(),
      job => this.processor.execute(job.name as AcademyJobName, job.data),
      {
        connection: bullRedisOptions(this.config, true),
        concurrency,
        lockDuration: queueNumberConfig(this.config, "JOBS_LOCK_DURATION_MS", 120_000, 30_000, 15 * 60_000),
      },
    );
    worker.on("completed", job => this.logger.debug(`Job ${job.name}/${job.id} concluído`));
    worker.on("failed", (job, error) => this.logger.warn(`Job ${job?.name ?? "unknown"}/${job?.id ?? "unknown"} falhou: ${error.message}`));
    worker.on("error", error => this.logger.error(`Worker BullMQ: ${error.message}`));
    await worker.waitUntilReady();
    this.worker = worker;
    await this.writeHeartbeat();
    const heartbeatMs = queueNumberConfig(this.config, "JOBS_WORKER_HEARTBEAT_MS", 5_000, 1_000, 30_000);
    this.heartbeatTimer = setInterval(() => void this.writeHeartbeat(), heartbeatMs);
    this.heartbeatTimer.unref?.();

    if (queueBooleanConfig(this.config, "THEMEMBERS_BACKGROUND_SYNC", false)) {
      const everyMs = queueNumberConfig(this.config, "THEMEMBERS_RECONCILE_INTERVAL_MS", 15 * 60_000, 60_000, 24 * 60 * 60_000);
      await this.jobs.scheduleRecurring(AcademyJob.THEMEMBERS_RECONCILE, everyMs, "themembers-reconcile-scheduler");
    }
    if (queueBooleanConfig(this.config, "VIDEO_ASSET_CLEANUP_ENABLED", true)) {
      const everyMs = queueNumberConfig(this.config, "VIDEO_ASSET_CLEANUP_INTERVAL_MS", 24 * 60 * 60_000, 60 * 60_000, 30 * 24 * 60 * 60_000);
      await this.jobs.scheduleRecurring(AcademyJob.VIDEO_ASSET_CLEANUP, everyMs, "video-assets-cleanup-scheduler");
    }
    if (queueBooleanConfig(this.config, "DATA_RETENTION_ENABLED", true)) {
      const everyMs = queueNumberConfig(this.config, "DATA_RETENTION_INTERVAL_MS", 24 * 60 * 60_000, 60 * 60_000, 30 * 24 * 60 * 60_000);
      await this.jobs.scheduleRecurring(AcademyJob.DATA_RETENTION_CLEANUP, everyMs, "data-retention-cleanup-scheduler");
    }
    this.logger.log(`Worker BullMQ pronto com concorrência ${concurrency}`);
  }

  async onApplicationShutdown() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    await this.redis.del(WORKER_HEARTBEAT_KEY);
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.close().catch(() => undefined);
  }

  private async writeHeartbeat() {
    const ttl = queueNumberConfig(this.config, "JOBS_WORKER_HEARTBEAT_TTL_SEC", 15, 5, 120);
    await this.redis.setEx(WORKER_HEARTBEAT_KEY, ttl, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  }
}
