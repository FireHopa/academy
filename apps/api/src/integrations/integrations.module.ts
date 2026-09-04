import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VideoModule } from "../video/video.module";
import { IntegrationsController } from "./integrations.controller";
import { TheMembersWebhookController } from "./themembers-webhook.controller";
import { TheMembersService } from "./themembers.service";
import { DataRetentionService } from "./data-retention.service";

@Module({
  imports: [AuthModule, VideoModule],
  controllers: [IntegrationsController, TheMembersWebhookController],
  providers: [TheMembersService, DataRetentionService],
  exports: [TheMembersService, DataRetentionService],
})
export class IntegrationsModule {}
