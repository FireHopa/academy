import { Injectable } from "@nestjs/common";
import { ThrottlerStorageService, type ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { RedisService } from "./redis.service";

const INCREMENT_SCRIPT = `
local nowParts = redis.call('TIME')
local now = (tonumber(nowParts[1]) * 1000) + math.floor(tonumber(nowParts[2]) / 1000)
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local state = redis.call('HMGET', KEYS[1], 'hits', 'windowEnds', 'blockedUntil')
local hits = tonumber(state[1]) or 0
local windowEnds = tonumber(state[2]) or 0
local blockedUntil = tonumber(state[3]) or 0

if blockedUntil > now then
  local expiresIn = math.max(0, windowEnds - now)
  return { hits, math.ceil(expiresIn / 1000), 1, math.ceil((blockedUntil - now) / 1000) }
end

if blockedUntil > 0 or windowEnds <= now then
  hits = 0
  windowEnds = now + ttl
  blockedUntil = 0
end

hits = hits + 1
if hits > limit then
  blockedUntil = now + blockDuration
end

redis.call('HSET', KEYS[1], 'hits', hits, 'windowEnds', windowEnds, 'blockedUntil', blockedUntil)
redis.call('PEXPIRE', KEYS[1], math.max(windowEnds, blockedUntil) - now)
return {
  hits,
  math.ceil(math.max(0, windowEnds - now) / 1000),
  blockedUntil > now and 1 or 0,
  blockedUntil > now and math.ceil((blockedUntil - now) / 1000) or 0
}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();

  constructor(private readonly redis: RedisService) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const redisKey = `academy:throttle:${throttlerName}:${key}`;
    const reply = await this.redis.eval(INCREMENT_SCRIPT, [redisKey], [String(ttl), String(limit), String(blockDuration)]);
    if (!Array.isArray(reply) || reply.length !== 4) {
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    const values = reply.map(Number);
    if (values.some(value => !Number.isFinite(value))) {
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    return {
      totalHits: values[0],
      timeToExpire: values[1],
      isBlocked: values[2] === 1,
      timeToBlockExpire: values[3],
    };
  }
}
