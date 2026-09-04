import { Controller, Get, Header, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/public.decorator";
import { ExperienceService } from "./experience.service";

@Controller("certificates")
export class CertificateVerificationController {
  constructor(private readonly experience: ExperienceService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Get("verify/:code")
  verify(@Param("code") code: string) {
    return this.experience.verifyCertificate(code);
  }
}
