import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/auth.types";
import { RedisService } from "./redis.service";

@Injectable()
export class SessionCacheService {
  constructor(private readonly redis: RedisService, private readonly config: ConfigService) {}

  async get(userId: string): Promise<AuthUser | null> {
    const raw = await this.redis.get(this.key(userId));
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<AuthUser>;
      if (
        value.sub !== userId || typeof value.email !== "string" || typeof value.name !== "string" ||
        !["STUDENT", "INSTRUCTOR", "ADMIN"].includes(String(value.role)) ||
        !Number.isInteger(value.ver) || typeof value.onboardingCompleted !== "boolean"
      ) return null;
      return value as AuthUser;
    } catch {
      await this.invalidate(userId);
      return null;
    }
  }

  async set(user: AuthUser) {
    await this.redis.setEx(this.key(user.sub), this.ttlSeconds(), JSON.stringify(user));
  }

  async invalidate(userId: string) {
    await this.redis.del(this.key(userId));
  }

  private key(userId: string) {
    return `academy:session:${userId}`;
  }

  private ttlSeconds() {
    const parsed = Number(this.config.get("SESSION_CACHE_TTL_SEC") ?? 30);
    return Number.isFinite(parsed) ? Math.min(300, Math.max(5, Math.floor(parsed))) : 30;
  }
}
