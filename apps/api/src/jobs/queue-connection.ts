import type { ConfigService } from "@nestjs/config";
import type { RedisOptions } from "ioredis";

function numberConfig(config: ConfigService, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(config.get(key) ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

export function bullRedisOptions(config: ConfigService, worker: boolean): RedisOptions {
  const raw = config.get<string>("REDIS_URL")?.trim() || "redis://127.0.0.1:6379";
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("REDIS_URL inválida para o worker de jobs"); }
  if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error("REDIS_URL deve usar redis:// ou rediss://");
  const database = url.pathname.replace(/^\//, "");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database ? Number(database) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    connectTimeout: numberConfig(config, "JOBS_REDIS_CONNECT_TIMEOUT_MS", 1_000, 250, 10_000),
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    lazyConnect: true,
    retryStrategy: worker ? attempts => Math.min(5_000, Math.max(250, attempts * 250)) : () => null,
  };
}

export function queueNumberConfig(config: ConfigService, key: string, fallback: number, min: number, max: number) {
  return numberConfig(config, key, fallback, min, max);
}

export function queueBooleanConfig(config: ConfigService, key: string, fallback: boolean) {
  const raw = config.get<unknown>(key);
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw === "boolean") return raw;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

export function jobRuntimePolicy(config: ConfigService) {
  const production = String(config.get("NODE_ENV") ?? "development").trim().toLowerCase() === "production";
  const runWorkerInApi = queueBooleanConfig(config, "JOBS_RUN_IN_API", false);
  if (production && runWorkerInApi) {
    throw new Error("JOBS_RUN_IN_API não pode ser true em produção; execute o worker em um processo separado");
  }
  return {
    production,
    runWorkerInApi,
    forceQueue: production || queueBooleanConfig(config, "JOBS_FORCE_QUEUE", false),
    inlineFallback: !production && queueBooleanConfig(config, "JOBS_INLINE_FALLBACK", true),
  };
}
