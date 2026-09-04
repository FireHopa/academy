import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/public.decorator";
import { HealthService } from "./health.service";

@Public()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get(["health/live", "api/health/live"])
  live(@Res({ passthrough: true }) response: Response) {
    const result = this.health.live();
    response.status(HttpStatus.OK);
    response.setHeader("Cache-Control", "no-store");
    return result;
  }

  @Get(["health/ready", "api/health/ready"])
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.ready();
    response.status(result.ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    response.setHeader("Cache-Control", "no-store");
    return result;
  }

  @Get(["health", "api/health"])
  async check(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.check();
    response.status(result.ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    response.setHeader("Cache-Control", "no-store");
    return result;
  }
}
