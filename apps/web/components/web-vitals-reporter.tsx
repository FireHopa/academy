"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { API_URL } from "@/lib/api";

type Observation = {
  name: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  route: string;
};

const SUPPORTED = new Set<Observation["name"]>(["LCP", "INP", "CLS", "TTFB", "FCP"]);

export function WebVitalsReporter() {
  const pending = useRef<Observation[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const metrics = pending.current.splice(0, 20);
    if (!metrics.length) return;
    void fetch(`${API_URL}/api/observability/web-vitals`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics }),
    }).catch(() => undefined);
  }, []);

  const report = useCallback((metric: { name: string; value: number; rating?: string }) => {
    if (!SUPPORTED.has(metric.name as Observation["name"]) || !Number.isFinite(metric.value)) return;
    pending.current.push({
      name: metric.name as Observation["name"],
      value: metric.value,
      rating: (["good", "needs-improvement", "poor"] as const).find(value => value === metric.rating),
      route: window.location.pathname,
    });
    if (pending.current.length >= 20) flush();
    else if (!timer.current) timer.current = setTimeout(flush, 2_000);
  }, [flush]);

  useReportWebVitals(report);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush]);

  return null;
}
