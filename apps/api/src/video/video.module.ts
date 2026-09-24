import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VideoService } from "./video.service";
import { VideoWebhookController } from "./video-webhook.controller";
import { PlaybackController } from "./playback.controller";
import { PlaybackSecurityController } from "./playback-security.controller";
import { PlaybackSessionService } from "./playback-session.service";
import { PandaVideoProvider } from "./providers/panda-video.provider";
import { MuxVideoProvider } from "./providers/mux-video.provider";
import { YoutubeVideoProvider } from "./providers/youtube-video.provider";
import { VideoAssetLifecycleService } from "./video-asset-lifecycle.service";

@Module({
  imports: [AuthModule],
  controllers: [VideoWebhookController, PlaybackController, PlaybackSecurityController],
  providers: [VideoService, PlaybackSessionService, PandaVideoProvider, MuxVideoProvider, YoutubeVideoProvider, VideoAssetLifecycleService],
  exports: [VideoService, PlaybackSessionService, PandaVideoProvider, VideoAssetLifecycleService],
})
export class VideoModule {}
