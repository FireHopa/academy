import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminGuard } from "../auth/auth.guard";
import { Public } from "../auth/public.decorator";
import { PerformanceMetricsService } from "./performance-metrics.service";
import { WebVitalsBatchDto } from "./web-vitals.dto";
import { ObservabilityExportGuard } from "./observability-export.guard";

@Controller("observability")
export class WebVitalsController {
  constructor(private readonly metrics: PerformanceMetricsService) {}

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post("web-vitals")
  @HttpCode(202)
  collect(@Body() body: WebVitalsBatchDto) {
    this.metrics.recordWebVitals(body.metrics);
    return { accepted: body.metrics.length };
  }
}

@Controller("admin/observability")
@UseGuards(AdminGuard)
export class AdminObservabilityController {
  constructor(private readonly metrics: PerformanceMetricsService) {}

  @Get("metrics")
  @Header("Cache-Control", "no-store, private")
  snapshot() {
    return this.metrics.snapshot();
  }
}

@Public()
@Controller("observability")
@UseGuards(ObservabilityExportGuard)
export class ObservabilityExportController {
  constructor(private readonly metrics: PerformanceMetricsService) {}

  @Get("export")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "no-store, private")
  snapshot() {
    return this.metrics.snapshot();
  }
}
