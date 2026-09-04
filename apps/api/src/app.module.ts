import { Module } from "@nestjs/common";
import { resolve } from "node:path";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthModule } from "./health/health.module";
import { CoursesModule } from "./courses/courses.module";
import { ProgressModule } from "./progress/progress.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { AuthGuard } from "./auth/auth.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { AdminModule } from "./admin/admin.module";
import { VideoModule } from "./video/video.module";
import { ExperienceModule } from "./experience/experience.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { RedisModule } from "./redis/redis.module";
import { RedisThrottlerStorage } from "./redis/redis-throttler.storage";
import { ObservabilityModule } from "./observability/observability.module";
import { JobsModule } from "./jobs/jobs.module";
import { AuditModule } from "./audit/audit.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] }),
    RedisModule,
    ObservabilityModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [{ ttl: 60_000, limit: 60 }],
        getTracker: (request: Record<string, any>) => request.user?.sub
          ? `user:${request.user.sub}`
          : `ip:${request.ip || request.socket?.remoteAddress || "unknown"}`,
      }),
    }),
    PrismaModule, AuditModule, HealthModule, UsersModule, AuthModule, CoursesModule, ProgressModule, AdminModule, VideoModule, ExperienceModule, IntegrationsModule, JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
