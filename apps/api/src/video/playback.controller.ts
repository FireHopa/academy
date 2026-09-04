import { Body, Controller, Get, Header, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { HeartbeatDto, PlaybackDeviceDto } from "./dto/playback-session.dto";
import { PlaybackSessionService } from "./playback-session.service";
import { VideoService } from "./video.service";

@Controller("playback")
export class PlaybackController {
  constructor(private readonly video: VideoService, private readonly sessions: PlaybackSessionService) {}

  @Post("lessons/:id/access")
  @Header("Cache-Control", "no-store, private")
  access(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: PlaybackDeviceDto,
  ) {
    return this.video.playbackAccess(req.user, id, body, req, false);
  }

  @Post("lessons/:id/bootstrap")
  @Header("Cache-Control", "no-store, private")
  bootstrap(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: PlaybackDeviceDto,
  ) {
    return this.video.playbackAccess(req.user, id, body, req, false);
  }

  @Post("lessons/:id/takeover")
  @Header("Cache-Control", "no-store, private")
  takeover(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: PlaybackDeviceDto,
  ) {
    return this.video.playbackAccess(req.user, id, body, req, true);
  }

  @Post("lessons/:id/bootstrap/takeover")
  @Header("Cache-Control", "no-store, private")
  bootstrapTakeover(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: PlaybackDeviceDto,
  ) {
    return this.video.playbackAccess(req.user, id, body, req, true);
  }

  @Post("sessions/:id/heartbeat")
  heartbeat(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: HeartbeatDto) {
    return this.sessions.heartbeat(req.user, id, body.positionSec);
  }

  @Post("sessions/:id/end")
  @HttpCode(200)
  end(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sessions.end(req.user, id);
  }

  @Get("sessions")
  listSessions(@Req() req: AuthenticatedRequest) {
    return this.sessions.listSessions(req.user);
  }
}
