import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { PerformanceMetricsService } from "../observability/performance-metrics.service";

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private readonly slowQueryMs: number;

  constructor(config: ConfigService, @Optional() metrics?: PerformanceMetricsService) {
    const slowQueryMs = boundedNumber(config.get("PRISMA_SLOW_QUERY_MS"), 250, 25, 60_000);
    const pool = new Pool({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      max: boundedNumber(config.get("PG_POOL_MAX"), 10, 1, 100),
      min: boundedNumber(config.get("PG_POOL_MIN"), 0, 0, 20),
      idleTimeoutMillis: boundedNumber(config.get("PG_POOL_IDLE_TIMEOUT_MS"), 30_000, 1_000, 10 * 60_000),
      connectionTimeoutMillis: boundedNumber(config.get("PG_POOL_CONNECT_TIMEOUT_MS"), 5_000, 500, 60_000),
      application_name: String(config.get("PG_APPLICATION_NAME") ?? "academy-api").slice(0, 63),
    });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: [{ emit: "event", level: "query" }] });
    this.pool = pool;
    this.slowQueryMs = slowQueryMs;
    (this as any).$on("query", (event: { duration: number; query: string }) => {
      metrics?.recordPrismaQuery(event.duration, event.query, this.slowQueryMs);
      if (event.duration >= this.slowQueryMs) {
        this.logger.warn(JSON.stringify({
          event: "prisma_slow_query",
          durationMs: event.duration,
          thresholdMs: this.slowQueryMs,
          query: event.query.replace(/\s+/g, " ").trim().slice(0, 320),
        }));
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  async pingPostgres() {
    await this.pool.query("SELECT 1");
  }

  async pingPrisma() {
    await this.$queryRaw`SELECT 1`;
  }
}
