import { Body, Controller, Delete, Get, Patch, Post, Put, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ConfigService } from "@nestjs/config";
import type { AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";
import { AvatarPresetDto, ChangeEmailDto, ChangePasswordDto, CompleteOnboardingDto, UpdateProfileDto } from "./dto/account.dto";
import { AllowPreOnboarding } from "./pre-onboarding.decorator";
import { MAX_IMAGE_UPLOAD_BYTES, type UploadedImageFile } from "../media/image-storage.service";

@AllowPreOnboarding()
@Controller("account")
export class AccountController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  @Get("profile") profile(@Req() req: AuthenticatedRequest) { return this.auth.profile(req.user.sub); }
  @Patch("profile") updateProfile(@Req() req: AuthenticatedRequest, @Body() body: UpdateProfileDto) { return this.auth.updateProfile(req.user.sub, body.name); }

  @Put("avatar/preset")
  setAvatarPreset(@Req() req: AuthenticatedRequest, @Body() body: AvatarPresetDto) {
    return this.auth.setAvatarPreset(req.user.sub, body.avatarPreset);
  }

  @Post("avatar/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 } }))
  uploadAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file?: UploadedImageFile) {
    return this.auth.uploadAvatar(req.user.sub, file);
  }

  @Delete("avatar")
  removeAvatar(@Req() req: AuthenticatedRequest) { return this.auth.removeAvatar(req.user.sub); }

  @Post("change-password")
  async changePassword(@Req() req: AuthenticatedRequest, @Body() body: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.changePassword(req.user.sub, body.currentPassword, body.newPassword);
    this.setSessionCookie(res, result.token);
    return { user: result.user };
  }

  @Post("change-email")
  async changeEmail(@Req() req: AuthenticatedRequest, @Body() body: ChangeEmailDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.changeEmail(req.user.sub, body.newEmail, body.currentPassword);
    this.setSessionCookie(res, result.token);
    return { user: result.user };
  }

  @Post("complete-onboarding")
  async completeOnboarding(@Req() req: AuthenticatedRequest, @Body() _body: CompleteOnboardingDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.completeOnboarding(req.user.sub);
    this.setSessionCookie(res, result.token);
    return { user: result.user };
  }

  private setSessionCookie(res: Response, token: string) {
    res.cookie("academy_session", token, {
      httpOnly: true, sameSite: "lax", secure: this.config.get("NODE_ENV") === "production",
      domain: this.config.get<string>("COOKIE_DOMAIN") || undefined, maxAge: 12 * 60 * 60 * 1000, path: "/",
    });
  }
}
