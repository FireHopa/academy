import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import { SessionCacheService } from "./session-cache.service";

@Global()
@Module({
  providers: [RedisService, RedisThrottlerStorage, SessionCacheService],
  exports: [RedisService, RedisThrottlerStorage, SessionCacheService],
})
export class RedisModule {}
