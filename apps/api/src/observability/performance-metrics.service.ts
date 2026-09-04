import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

type ApiSeries = {
  method: string;
  route: string;
  durations: number[];
  requests: number;
  errors: number;
  statuses: Record<string, number>;
};

type WebVitalSeries = {
  name: string;
  route: string;
  values: number[];
  count: number;
  ratings: Record<string, number>;
};

type JobSeries = {
  name: string;
  queued: number;
  started: number;
  completed: number;
  failed: number;
  inline: number;
  durations: number[];
};

export type WebVitalObservation = {
  name: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  route?: string;
};

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function normalizeMetricRoute(input?: string | null) {
  const path = (input || "/unknown").split("?", 1)[0].replace(/\/{2,}/g, "/");
  const normalized = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
    .replace(/\/[a-z][a-z0-9]{19,31}(?=\/|$)/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return normalized.length > 180 ? normalized.slice(0, 180) : normalized;
}

@Injectable()
export class PerformanceMetricsService {
  private readonly startedAt = new Date();
  private readonly api = new Map<string, ApiSeries>();
  private readonly webVitals = new Map<string, WebVitalSeries>();
  private readonly jobs = new Map<string, JobSeries>();
  private readonly prismaDurations: number[] = [];
  private readonly slowQueries: Array<{
    fingerprint: string;
    durationMs: number;
    query: string;
    occurredAt: string;
  }> = [];
  private readonly windowSize = 1_000;
  private readonly maximumSeries = 250;
  private prismaQueries = 0;

  recordApi(method: string, route: string, status: number, durationMs: number) {
    const normalizedRoute = normalizeMetricRoute(route);
    if (normalizedRoute === "/api/admin/observability/metrics") return;
    const key = `${method.toUpperCase()} ${normalizedRoute}`;
    const selectedKey = this.api.has(key) || this.api.size < this.maximumSeries ? key : "OTHER /high-cardinality";
    const series = this.api.get(selectedKey) ?? {
      method: selectedKey === key ? method.toUpperCase() : "OTHER",
      route: selectedKey === key ? normalizedRoute : "/high-cardinality",
      durations: [],
      requests: 0,
      errors: 0,
      statuses: {},
    };
    series.requests += 1;
    if (status >= 500) series.errors += 1;
    const statusGroup = `${Math.max(0, Math.floor(status / 100))}xx`;
    series.statuses[statusGroup] = (series.statuses[statusGroup] ?? 0) + 1;
    this.push(series.durations, durationMs);
    this.api.set(selectedKey, series);
  }

  recordWebVitals(observations: WebVitalObservation[]) {
    for (const observation of observations) {
      if (!Number.isFinite(observation.value) || observation.value < 0) continue;
      const route = normalizeMetricRoute(observation.route);
      const key = `${observation.name} ${route}`;
      const selectedKey = this.webVitals.has(key) || this.webVitals.size < this.maximumSeries ? key : `${observation.name} /high-cardinality`;
      const series = this.webVitals.get(selectedKey) ?? {
        name: observation.name,
        route: selectedKey === key ? route : "/high-cardinality",
        values: [],
        count: 0,
        ratings: {},
      };
      series.count += 1;
      if (observation.rating) series.ratings[observation.rating] = (series.ratings[observation.rating] ?? 0) + 1;
      this.push(series.values, observation.value);
      this.webVitals.set(selectedKey, series);
    }
  }

  recordPrismaQuery(durationMs: number, query: string, slowThresholdMs: number) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.prismaQueries += 1;
    this.push(this.prismaDurations, durationMs);
    if (durationMs < slowThresholdMs) return;
    const normalized = query.replace(/\s+/g, " ").trim().slice(0, 320);
    this.slowQueries.push({
      fingerprint: createHash("sha256").update(normalized).digest("hex").slice(0, 16),
      durationMs,
      query: normalized,
      occurredAt: new Date().toISOString(),
    });
    if (this.slowQueries.length > 100) this.slowQueries.splice(0, this.slowQueries.length - 100);
  }

  recordJobQueued(name: string, mode: "queue" | "inline") {
    const series = this.jobSeries(name);
    series.queued += 1;
    if (mode === "inline") series.inline += 1;
  }

  recordJobStarted(name: string) {
    this.jobSeries(name).started += 1;
  }

  recordJobCompleted(name: string, durationMs: number) {
    const series = this.jobSeries(name);
    series.completed += 1;
    this.push(series.durations, durationMs);
  }

  recordJobFailed(name: string, durationMs: number) {
    const series = this.jobSeries(name);
    series.failed += 1;
    this.push(series.durations, durationMs);
  }

  snapshot() {
    const memory = process.memoryUsage();
    return {
      generatedAt: new Date().toISOString(),
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1_000),
      process: {
        pid: process.pid,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
      api: [...this.api.values()]
        .map(series => ({
          method: series.method,
          route: series.route,
          count: series.requests,
          errors: series.errors,
          errorRate: series.requests ? series.errors / series.requests : 0,
          statuses: series.statuses,
          averageMs: average(series.durations),
          p50Ms: percentile(series.durations, 0.5),
          p95Ms: percentile(series.durations, 0.95),
          p99Ms: percentile(series.durations, 0.99),
          maxMs: series.durations.length ? Math.max(...series.durations) : null,
          windowSamples: series.durations.length,
        }))
        .sort((a, b) => b.count - a.count),
      webVitals: [...this.webVitals.values()]
        .map(series => ({
          name: series.name,
          route: series.route,
          count: series.count,
          samples: series.values.length,
          ratings: series.ratings,
          p50: percentile(series.values, 0.5),
          p75: percentile(series.values, 0.75),
          p95: percentile(series.values, 0.95),
        }))
        .sort((a, b) => b.count - a.count),
      prisma: {
        count: this.prismaQueries,
        samples: this.prismaDurations.length,
        averageMs: average(this.prismaDurations),
        p50Ms: percentile(this.prismaDurations, 0.5),
        p95Ms: percentile(this.prismaDurations, 0.95),
        p99Ms: percentile(this.prismaDurations, 0.99),
        slowCount: this.slowQueries.length,
        slowQueries: [...this.slowQueries].reverse(),
      },
      jobs: [...this.jobs.values()].map(series => ({
        name: series.name,
        queued: series.queued,
        started: series.started,
        completed: series.completed,
        failed: series.failed,
        inline: series.inline,
        p50Ms: percentile(series.durations, 0.5),
        p95Ms: percentile(series.durations, 0.95),
        p99Ms: percentile(series.durations, 0.99),
      })),
    };
  }

  private jobSeries(name: string) {
    const series = this.jobs.get(name) ?? { name, queued: 0, started: 0, completed: 0, failed: 0, inline: 0, durations: [] };
    this.jobs.set(name, series);
    return series;
  }

  private push(values: number[], value: number) {
    values.push(Math.max(0, Math.round(value * 100) / 100));
    if (values.length > this.windowSize) values.splice(0, values.length - this.windowSize);
  }
}
