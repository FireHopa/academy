#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadJson,
  parseArguments,
  percentile,
  reportExit,
  saveReport,
} from "./core.mjs";

const KNOWN_METRICS = new Set(["LCP", "INP", "CLS", "TTFB", "FCP"]);

function metricName(value) {
  const normalized = String(value ?? "").toUpperCase();
  return KNOWN_METRICS.has(normalized) ? normalized : null;
}

function emptySeries() {
  return { values: [], aggregates: [] };
}

function addRecord(series, record, fallbackName) {
  const name = metricName(record?.name ?? record?.metric ?? fallbackName);
  if (!name) return;
  const current = series.get(name) ?? emptySeries();
  if (Array.isArray(record)) {
    current.values.push(...record.map(Number).filter(Number.isFinite));
  } else if (Number.isFinite(Number(record?.value))) {
    current.values.push(Number(record.value));
  } else if (Array.isArray(record?.values)) {
    current.values.push(...record.values.map(Number).filter(Number.isFinite));
  }
  const p75 = record?.p75 ?? record?.percentiles?.p75 ?? record?.percentile75;
  const samples = record?.samples ?? record?.count;
  if (Number.isFinite(Number(p75))) {
    current.aggregates.push({
      p75: Number(p75),
      samples: Number.isFinite(Number(samples)) ? Number(samples) : 0,
      route: typeof record?.route === "string" ? record.route : null,
    });
  }
  series.set(name, current);
}

export function normalizeWebVitals(payload) {
  const series = new Map();
  const visit = (value, fallbackName = null) => {
    if (Array.isArray(value)) {
      if (fallbackName && value.every(item => Number.isFinite(Number(item)))) {
        addRecord(series, value, fallbackName);
      } else {
        for (const item of value) visit(item, fallbackName);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (metricName(value.name ?? value.metric ?? fallbackName)) {
      addRecord(series, value, fallbackName);
      return;
    }
    for (const container of ["metrics", "webVitals", "web_vitals", "data", "results"]) {
      if (value[container] !== undefined) visit(value[container]);
    }
    for (const [key, item] of Object.entries(value)) {
      if (metricName(key)) visit(item, key);
    }
  };
  visit(payload);
  return series;
}

export function parseVitalsText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("A fonte de Web Vitals está vazia.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const records = trimmed.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw new Error(`NDJSON inválido na linha ${index + 1}.`); }
    });
    return records;
  }
}

async function readSource(source, timeoutMs, production) {
  if (/^https?:\/\//i.test(source)) {
    if (production && !source.startsWith("https://")) throw new Error("PERF_WEB_VITALS_SOURCE deve usar HTTPS no gate de produção.");
    const headers = { accept: "application/json, application/x-ndjson" };
    if (process.env.PERF_WEB_VITALS_TOKEN) headers.authorization = `Bearer ${process.env.PERF_WEB_VITALS_TOKEN}`;
    if (process.env.PERF_WEB_VITALS_COOKIE) headers.cookie = process.env.PERF_WEB_VITALS_COOKIE;
    const response = await fetch(source, { headers, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Falha ao obter Web Vitals: HTTP ${response.status}.`);
    return parseVitalsText(await response.text());
  }
  return parseVitalsText(await readFile(resolve(source), "utf8"));
}

export function evaluateWebVitals({ payload, config, minimumSamples }) {
  const target = config.webVitals;
  const series = normalizeWebVitals(payload);
  const metrics = Object.entries(target.metrics).map(([name, threshold]) => {
    const data = series.get(name) ?? emptySeries();
    const samples = data.values.length || data.aggregates.reduce((total, aggregate) => total + aggregate.samples, 0);
    const actual = data.values.length
      ? percentile(data.values, target.percentile)
      : data.aggregates.length
        ? Math.max(...data.aggregates.map(aggregate => aggregate.p75))
        : null;
    const enoughSamples = samples >= minimumSamples;
    const withinTarget = actual !== null && actual <= threshold.maximum;
    return {
      name,
      unit: threshold.unit,
      percentile: target.percentile,
      samples,
      minimumSamples,
      actual,
      maximum: threshold.maximum,
      enoughSamples,
      withinTarget,
      aggregateSeries: data.aggregates.length,
      worstRoute: [...data.aggregates].sort((left, right) => right.p75 - left.p75)[0]?.route ?? null,
      ok: enoughSamples && withinTarget,
    };
  });
  return {
    kind: "web-vitals",
    generatedAt: new Date().toISOString(),
    ok: metrics.every(metric => metric.ok),
    metrics,
  };
}

function printReport(report) {
  console.table(report.metrics.map(metric => ({
    metric: metric.name,
    p75: metric.actual ?? "missing",
    maximum: metric.maximum,
    unit: metric.unit,
    samples: metric.samples,
    status: metric.ok ? "PASS" : "FAIL",
  })));
  for (const metric of report.metrics.filter(item => !item.ok)) {
    if (!metric.enoughSamples) console.error(`FAIL ${metric.name}: ${metric.samples}/${metric.minimumSamples} amostras.`);
    else console.error(`FAIL ${metric.name}: p75 ${metric.actual} > ${metric.maximum} ${metric.unit}.`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const source = args.source || process.env.PERF_WEB_VITALS_SOURCE;
  if (!source) throw new Error("Informe --source ou PERF_WEB_VITALS_SOURCE.");
  const config = await loadJson(args.config || "performance/targets.json");
  const minimumSamples = Number(args["minimum-samples"] ?? process.env.PERF_MIN_WEB_VITAL_SAMPLES ?? config.webVitals.minimumSamples);
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1) throw new Error("minimum-samples deve ser um inteiro positivo.");
  const production = args.production === true || String(process.env.PERF_RELEASE_MODE ?? "").toLowerCase() === "production";
  const payload = await readSource(source, Number(args.timeout ?? 10_000), production);
  const report = evaluateWebVitals({ payload, config, minimumSamples });
  printReport(report);
  await saveReport(args.output, report);
  reportExit(report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
