import { Injectable, Logger, OnApplicationShutdown, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Queue, type JobsOptions } from "bullmq";
import { PerformanceMetricsService } from "../observability/performance-metrics.service";
import { RedisService } from "../redis/redis.service";
import { JobProcessorService } from "./job-processor.service";
import {
  ACADEMY_QUEUE,
  WORKER_HEARTBEAT_KEY,
  type AcademyJobName,
  type AcademyJobPayloads,
  type DispatchOptions,
  type DispatchResult,
  type JobDispatcher,
} from "./jobs.types";
import { bullRedisOptions, jobRuntimePolicy, queueNumberConfig } from "./queue-connection";

@Injectable()
export class JobQueueService implements JobDispatcher, OnApplicationShutdown {
  private readonly logger = new Logger(JobQueueService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly processor: JobProcessorService,
    private readonly metrics: PerformanceMetricsService,
  ) {}

  async dispatch<N extends AcademyJobName>(
    name: N,
    payload: AcademyJobPayloads[N],
    options: DispatchOptions = {},
  ): Promise<DispatchResult> {
    const jobId = this.safeJobId(options.jobId || `${name.replaceAll(".", "-")}-${randomUUID()}`);
    const policy = jobRuntimePolicy(this.config);

    if (!policy.forceQueue) {
      const heartbeat = await this.redis.get(WORKER_HEARTBEAT_KEY);
      if (!heartbeat) {
        if (policy.inlineFallback) return this.inline(name, payload, jobId);
        throw new ServiceUnavailableException("Worker de processamento temporariamente indisponível");
      }
    }

    try {
      const queue = this.queueClient();
      const job = await this.withTimeout(queue.add(name, payload, {
        jobId,
        attempts: Math.min(10, Math.max(1, options.attempts ?? 5)),
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
      }), this.operationTimeoutMs());
      this.metrics.recordJobQueued(name, "queue");
      return { mode: "queued", queue: ACADEMY_QUEUE, jobId: job.id || jobId, state: "waiting" };
    } catch (error) {
      this.logger.warn(`Fila indisponível para ${name}; execução recusada para evitar processamento duplicado na API`);
      throw new ServiceUnavailableException("Fila de processamento temporariamente indisponível");
    }
  }

  async status(jobId: string) {
    const safeId = this.safeJobId(jobId);
    try {
      const queue = this.queueClient();
      const job = await this.withTimeout(queue.getJob(safeId), this.operationTimeoutMs());
      if (!job) return { found: false, jobId: safeId };
      const state = await this.withTimeout(job.getState(), this.operationTimeoutMs());
      return {
        found: true,
        jobId: job.id,
        name: job.name,
        state,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        result: state === "completed" ? job.returnvalue : undefined,
        failedReason: state === "failed" ? job.failedReason : undefined,
        createdAt: new Date(job.timestamp).toISOString(),
        processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      };
    } catch {
      throw new ServiceUnavailableException("Não foi possível consultar a fila de jobs");
    }
  }

  async overview() {
    const policy = jobRuntimePolicy(this.config);
    const heartbeat = await this.redis.get(WORKER_HEARTBEAT_KEY);
    if (!heartbeat) {
      return {
        queue: ACADEMY_QUEUE,
        worker: { online: false },
        counts: null,
        fallback: policy.inlineFallback ? "inline" : "disabled",
        dispatchMode: policy.forceQueue ? "queue_only" : "worker_required",
      };
    }
    let details: unknown = null;
    try { details = JSON.parse(heartbeat); } catch { details = null; }
    try {
      const counts = await this.withTimeout(
        this.queueClient().getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
        this.operationTimeoutMs(),
      );
      return { queue: ACADEMY_QUEUE, worker: { online: true, details }, counts, fallback: "queue", dispatchMode: "queue" };
    } catch {
      return { queue: ACADEMY_QUEUE, worker: { online: true, details }, counts: null, fallback: "queue", dispatchMode: "queue" };
    }
  }

  async pingQueue() {
    await this.withTimeout(
      this.queueClient().getJobCounts("waiting", "active", "delayed", "paused"),
      this.operationTimeoutMs(),
    );
  }

  async pingWorker() {
    const heartbeat = await this.redis.get(WORKER_HEARTBEAT_KEY);
    if (!heartbeat) throw new Error("worker_heartbeat_missing");
  }

  async scheduleRecurring(name: AcademyJobName, everyMs: number, jobId: string) {
    const options: JobsOptions = {
      jobId: this.safeJobId(jobId),
      repeat: { every: everyMs },
      removeOnComplete: { age: 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 },
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
    };
    return this.withTimeout(this.queueClient().add(name, {}, options), this.operationTimeoutMs());
  }

  queueName() {
    return ACADEMY_QUEUE;
  }

  async onApplicationShutdown() {
    const queue = this.queue;
    this.queue = null;
    if (queue) await queue.close().catch(() => undefined);
  }

  private async inline<N extends AcademyJobName>(name: N, payload: AcademyJobPayloads[N], jobId: string): Promise<DispatchResult> {
    this.metrics.recordJobQueued(name, "inline");
    const result = await this.processor.execute(name, payload);
    return { mode: "inline", queue: ACADEMY_QUEUE, jobId, result };
  }

  private queueClient() {
    if (!this.queue) {
      this.queue = new Queue(ACADEMY_QUEUE, {
        connection: bullRedisOptions(this.config, false),
        defaultJobOptions: { removeOnComplete: true },
      });
      this.queue.on("error", () => undefined);
    }
    return this.queue;
  }

  private operationTimeoutMs() {
    return queueNumberConfig(this.config, "JOBS_QUEUE_OPERATION_TIMEOUT_MS", 2_000, 500, 15_000);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("queue_operation_timeout")), timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private safeJobId(value: string) {
    const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 180);
    if (!normalized) throw new Error("Job ID inválido");
    return normalized;
  }
}
