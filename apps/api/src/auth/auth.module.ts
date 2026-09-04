import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccountController } from "./account.controller";
import { AuthGuard, AdminGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { MailService } from "./mail.service";
import { MediaModule } from "../media/media.module";

@Module({
  imports: [MediaModule],
  controllers: [AuthController, AccountController],
  providers: [AuthService, MailService, AuthGuard, AdminGuard],
  exports: [AuthService, AuthGuard, AdminGuard],
})
export class AuthModule {}
