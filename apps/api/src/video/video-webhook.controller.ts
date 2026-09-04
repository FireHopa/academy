import { Controller, Headers, HttpCode, Param, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { VideoService } from "./video.service";
import { Public } from "../auth/public.decorator";
import { SkipThrottle } from "@nestjs/throttler";

@Public()
@SkipThrottle()
@Controller("webhooks")
export class VideoWebhookController {
  constructor(private readonly video: VideoService) {}

  @Post("mux")
  @HttpCode(200)
  async mux(@Req() req: RawBodyRequest<Request>, @Headers("mux-signature") signature?: string) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new Error("Raw body não disponível para validar o webhook");
    this.video.verifyMuxWebhook(rawBody, signature);
    return this.video.handleMuxWebhook(JSON.parse(rawBody.toString("utf8")));
  }

  @Post("panda/:token")
  @HttpCode(200)
  async panda(@Param("token") token: string, @Req() req: RawBodyRequest<Request>) {
    this.video.verifyPandaWebhookToken(token);
    const rawBody = req.rawBody;
    if (!rawBody) throw new Error("Raw body não disponível para o webhook Panda");
    return this.video.handlePandaWebhook(JSON.parse(rawBody.toString("utf8")));
  }
}
