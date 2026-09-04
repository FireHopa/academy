import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient | null = null;
  private connecting: Promise<RedisClient | null> | null = null;
  private retryAfter = 0;

  constructor(private readonly config: ConfigService) {}

  async get(key: string) {
    return this.run(client => client.get(key));
  }

  async setEx(key: string, ttlSeconds: number, value: string) {
    return this.run(client => client.setEx(key, ttlSeconds, value));
  }

  async del(key: string) {
    return this.run(client => client.del(key));
  }

  async eval(script: string, keys: string[], args: string[]) {
    return this.run(client => client.eval(script, { keys, arguments: args }));
  }

  async ping() {
    return this.run(client => client.ping());
  }

  async onApplicationShutdown() {
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      if (client.isOpen) await client.close();
    } catch {
      client.destroy();
    }
  }

  private async run<T>(operation: (client: RedisClient) => Promise<T>): Promise<T | null> {
    const client = await this.connection();
    if (!client) return null;
    try {
      return await operation(client);
    } catch (error) {
      this.markUnavailable(client, error);
      return null;
    }
  }

  private async connection(): Promise<RedisClient | null> {
    if (this.client?.isReady) return this.client;
    if (this.connecting) return this.connecting;
    if (Date.now() < this.retryAfter) return null;

    const url = this.config.get<string>("REDIS_URL")?.trim() || "redis://127.0.0.1:6379";
    const client = createClient({
      url,
      socket: {
        connectTimeout: this.numberConfig("REDIS_CONNECT_TIMEOUT_MS", 350, 100, 5_000),
        reconnectStrategy: false,
      },
    });
    client.on("error", () => undefined);
    this.client = client;
    this.connecting = client.connect()
      .then(() => client)
      .catch(error => {
        this.markUnavailable(client, error);
        return null;
      })
      .finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private markUnavailable(client: RedisClient, error: unknown) {
    if (this.client === client) this.client = null;
    this.retryAfter = Date.now() + this.numberConfig("REDIS_RETRY_DELAY_MS", 10_000, 1_000, 60_000);
    try { client.destroy(); } catch {}
    void error;
    this.logger.warn("Redis indisponível; usando fallback local temporário");
  }

  private numberConfig(name: string, fallback: number, min: number, max: number) {
    const parsed = Number(this.config.get(name) ?? fallback);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  }
}
