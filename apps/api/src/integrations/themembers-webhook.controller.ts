import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { SkipThrottle } from "@nestjs/throttler";
import { TheMembersService } from "./themembers.service";

@Public()
@SkipThrottle()
@Controller("webhooks/themembers")
export class TheMembersWebhookController {
  constructor(private readonly themembers: TheMembersService) {}

  /** Checkout: use os eventos release.access e revoke.access. */
  @Post("checkout")
  @HttpCode(200)
  async checkout(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-signature") signature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new Error("Raw body não disponível para validar webhook do Checkout TheMembers");
    this.themembers.verifyCheckoutWebhookToken(signature);
    return this.themembers.receiveWebhook(rawBody, undefined, "CHECKOUT");
  }

  /** Área de membros/plataforma: HMAC-SHA256 com client_token. Não altera acesso por padrão. */
  @Post("platform")
  @HttpCode(200)
  async platform(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-webhook-signature") signature?: string,
    @Headers("x-webhook-event") event?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new Error("Raw body não disponível para validar webhook da plataforma TheMembers");
    this.themembers.verifyPlatformWebhook(rawBody, signature);
    return this.themembers.receiveWebhook(rawBody, event, "PLATFORM");
  }
}
