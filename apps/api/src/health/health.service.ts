import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JobQueueService } from "../jobs/job-queue.service";
import { ImageStorageService } from "../media/image-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { pandaDrmCredentials, parsePandaBoolean } from "../video/panda-drm.config";
import { mailConfigurationReady } from "../common/mail-config";

const HEALTHCHECK_TIMEOUT_MS = 2_000;

export type HealthChecks = {
  api: boolean;
  postgres: boolean;
  prisma: boolean;
  redis: boolean;
  queue: boolean;
  worker: boolean;
  storage: boolean;
  panda_configuration: boolean;
  themembers_configuration: boolean;
  email_configuration: boolean;
};

export type HealthResult = {
  ok: boolean;
  status: "ok" | "unhealthy";
  service: "academy-api";
  timestamp: string;
  uptime_seconds: number;
  checks: HealthChecks;
};

export type LivenessResult = {
  ok: true;
  status: "ok";
  service: "academy-api";
  timestamp: string;
  uptime_seconds: number;
  checks: { api: true };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly jobs: JobQueueService,
    private readonly images: ImageStorageService,
  ) {}

  live(): LivenessResult {
    return {
      ok: true,
      status: "ok",
      service: "academy-api",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      checks: { api: true },
    };
  }

  async ready(): Promise<HealthResult> {
    const [postgres, prisma, redis, queue, worker, storage] = await Promise.all([
      this.runCheck(() => this.prisma.pingPostgres()),
      this.runCheck(() => this.prisma.pingPrisma()),
      this.runCheck(async () => {
        if (await this.redis.ping() !== "PONG") throw new Error("redis_ping_failed");
      }),
      this.runCheck(() => this.jobs.pingQueue()),
      this.runCheck(() => this.jobs.pingWorker()),
      this.runCheck(() => this.images.assertReady()),
    ]);
    const checks: HealthChecks = {
      api: true,
      postgres,
      prisma,
      redis,
      queue,
      worker,
      storage,
      panda_configuration: this.pandaConfigurationReady(),
      themembers_configuration: this.theMembersConfigurationReady(),
      email_configuration: this.emailConfigurationReady(),
    };
    const ok = Object.values(checks).every(Boolean);

    return {
      ok,
      status: ok ? "ok" : "unhealthy",
      service: "academy-api",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      checks,
    };
  }

  async check(): Promise<HealthResult> {
    return this.ready();
  }

  private pandaConfigurationReady() {
    const provider = this.value("VIDEO_PROVIDER", "panda").toLowerCase();
    if (provider !== "panda") return provider === "mux";
    if (!this.present("PANDA_API_KEY") || !this.present("PANDA_WEBHOOK_TOKEN")) return false;

    const requireDrm = parsePandaBoolean(this.config.get<unknown>("PANDA_REQUIRE_DRM"));
    const drm = pandaDrmCredentials(this.config);
    return requireDrm === true && drm.configured;
  }

  private theMembersConfigurationReady() {
    if (!this.enabled("THEMEMBERS_ENABLED")) return true;
    if (!this.present("THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN")) return false;
    if (!this.enabled("THEMEMBERS_ACCESS_AUTOMATION")) return true;

    const mode = this.value("THEMEMBERS_API_MODE", "legacy").toLowerCase();
    if (mode === "legacy") {
      return this.present("THEMEMBERS_DEVELOPER_TOKEN") && this.present("THEMEMBERS_PLATFORM_TOKEN");
    }
    if (mode === "v1") {
      return this.present("THEMEMBERS_API_TOKEN") && this.present("THEMEMBERS_PRODUCTS_ENDPOINT");
    }
    return false;
  }

  private emailConfigurationReady() {
    return mailConfigurationReady(this.config, this.isProduction());
  }

  private async runCheck(check: () => Promise<unknown>) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("healthcheck_timeout")), HEALTHCHECK_TIMEOUT_MS);
          timeout.unref?.();
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private isProduction() {
    return this.value("NODE_ENV").toLowerCase() === "production";
  }

  private enabled(key: string, fallback = false) {
    const raw = this.config.get<unknown>(key);
    if (raw === undefined || raw === null || raw === "") return fallback;
    if (typeof raw === "boolean") return raw;
    return ["true", "1", "yes", "on"].includes(String(raw).trim().toLowerCase());
  }

  private present(key: string) {
    const raw = this.config.get<unknown>(key);
    if (raw === undefined || raw === null) return false;
    return typeof raw === "string" ? raw.trim().length > 0 : true;
  }

  private value(key: string, fallback = "") {
    const raw = this.config.get<unknown>(key);
    return raw === undefined || raw === null ? fallback : String(raw).trim();
  }
}
