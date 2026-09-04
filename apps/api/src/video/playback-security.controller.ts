import { Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { PlaybackSessionService } from "./playback-session.service";

@Controller("security")
export class PlaybackSecurityController {
  constructor(private readonly sessions: PlaybackSessionService) {}

  @Get("devices")
  devices(@Req() req: AuthenticatedRequest) {
    return this.sessions.listDevices(req.user);
  }

  @Delete("devices/:id")
  revoke(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sessions.revokeDevice(req.user, id);
  }

  @Get("playback-sessions")
  playbackSessions(@Req() req: AuthenticatedRequest) {
    return this.sessions.listSessions(req.user);
  }

  @Post("playback-sessions/:id/end")
  endSession(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sessions.endSessionByUser(req.user, id);
  }
}
