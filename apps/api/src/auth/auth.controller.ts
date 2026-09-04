import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";
import { AcceptInviteDto, ForgotPasswordDto, ResetPasswordDto, ValidateAccountTokenDto } from "./dto/account.dto";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./public.decorator";
import { AllowPreOnboarding } from "./pre-onboarding.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateCredentials(body.email, body.password);
    this.setSessionCookie(res, this.auth.issueToken(user));
    return { user };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() body: ForgotPasswordDto) { return this.auth.requestPasswordReset(body.email); }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("token/validate")
  validateToken(@Body() body: ValidateAccountTokenDto) { return this.auth.validateAccountToken(body.token, body.type); }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("accept-invite")
  async acceptInvite(@Body() body: AcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.acceptInvite(body.token, body.password);
    this.setSessionCookie(res, result.token);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  resetPassword(@Body() body: ResetPasswordDto) { return this.auth.resetPassword(body.token, body.password); }

  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("academy_session", { path: "/", domain: this.config.get<string>("COOKIE_DOMAIN") || undefined });
  }

  @AllowPreOnboarding()
  @Get("me")
  me(@Req() req: AuthenticatedRequest) { return { user: req.user }; }

  private setSessionCookie(res: Response, token: string) {
    res.cookie("academy_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
      domain: this.config.get<string>("COOKIE_DOMAIN") || undefined,
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
  }
}
