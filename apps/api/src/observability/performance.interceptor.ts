import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { finalize, tap } from "rxjs";
import { PerformanceMetricsService, normalizeMetricRoute } from "./performance-metrics.service";

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  constructor(private readonly metrics: PerformanceMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const started = performance.now();
    let errorStatus: number | undefined;

    return next.handle().pipe(
      tap({
        error: error => {
          errorStatus = typeof error?.getStatus === "function" ? error.getStatus() : Number(error?.status ?? 500);
        },
      }),
      finalize(() => {
        const route = normalizeMetricRoute(request.originalUrl || request.url);
        this.metrics.recordApi(request.method, route, errorStatus ?? response.statusCode, performance.now() - started);
      }),
    );
  }
}
