import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CertificateVerificationController } from "./certificate-verification.controller";
import { ExperienceController } from "./experience.controller";
import { ExperienceService } from "./experience.service";

@Module({
  imports: [AuthModule],
  controllers: [ExperienceController, CertificateVerificationController],
  providers: [ExperienceService],
})
export class ExperienceModule {}
