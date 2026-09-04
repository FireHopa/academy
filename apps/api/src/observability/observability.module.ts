import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AdminObservabilityController, ObservabilityExportController, WebVitalsController } from "./observability.controller";
import { PerformanceInterceptor } from "./performance.interceptor";
import { PerformanceMetricsService } from "./performance-metrics.service";
import { ObservabilityExportGuard } from "./observability-export.guard";

@Global()
@Module({
  controllers: [WebVitalsController, AdminObservabilityController, ObservabilityExportController],
  providers: [
    PerformanceMetricsService,
    ObservabilityExportGuard,
    { provide: APP_INTERCEPTOR, useClass: PerformanceInterceptor },
  ],
  exports: [PerformanceMetricsService],
})
export class ObservabilityModule {}
