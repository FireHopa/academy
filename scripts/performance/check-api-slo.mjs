#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  interpolateEnvironment,
  loadJson,
  parseArguments,
  percentile,
  reportExit,
  saveReport,
} from "./core.mjs";

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} deve ser um inteiro positivo.`);
  return parsed;
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return cookies.map(cookie => cookie.split(";", 1)[0]).join("; ");
}

async function request({ url, method, body, cookie, origin, timeoutMs, captureJson = false }) {
  const headers = {
    accept: "application/json",
    "user-agent": "academy-play-performance-gate/1.0",
  };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseBytes = await response.arrayBuffer();
    let responseBody = null;
    if (captureJson && responseBytes.byteLength) {
      try { responseBody = JSON.parse(new TextDecoder().decode(responseBytes)); }
      catch { responseBody = null; }
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      durationMs: performance.now() - started,
      responseBody,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function valueAtPath(payload, path) {
  return String(path).split(".").reduce((value, key) => value?.[key], payload);
}

async function requestFlow(target, flow, environment) {
  const measured = await request({ ...target, captureJson: Boolean(flow.cleanup) });
  if (!measured.ok || !flow.cleanup) return measured;
  const responseId = valueAtPath(measured.responseBody, flow.cleanup.responseIdPath);
  if (responseId === undefined || responseId === null || responseId === "") {
    return { ...measured, ok: false, error: `Resposta sem ${flow.cleanup.responseIdPath} para cleanup` };
  }
  const cleanupPath = interpolateEnvironment(
    flow.cleanup.path.replaceAll("${responseId}", encodeURIComponent(String(responseId))),
    environment,
  );
  const cleanup = await request({
    ...target,
    url: `${new URL(target.url).origin}${cleanupPath}`,
    method: flow.cleanup.method,
    body: flow.cleanup.body,
    captureJson: false,
  });
  if (!cleanup.ok) {
    return { ...measured, ok: false, error: `Cleanup respondeu HTTP ${cleanup.status}`, cleanupStatus: cleanup.status };
  }
  return measured;
}

async function login(baseUrl, loginConfig, timeoutMs, origin, environment) {
  const email = environment[loginConfig.emailEnvironment];
  const password = environment[loginConfig.passwordEnvironment];
  if (!email || !password) {
    throw new Error(`Configure ${loginConfig.emailEnvironment} e ${loginConfig.passwordEnvironment} para o gate autenticado.`);
  }
  const response = await fetch(`${baseUrl}${loginConfig.path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      "user-agent": "academy-play-performance-gate/1.0",
    },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  await response.arrayBuffer();
  if (!response.ok) throw new Error(`Login do gate falhou: HTTP ${response.status}.`);
  const cookie = cookieHeader(response);
  if (!cookie) throw new Error("Login do gate não retornou cookie de sessão.");
  return cookie;
}

async function runPool(total, concurrency, operation) {
  const results = new Array(total);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(total, concurrency) }, async () => {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(index);
    }
  });
  await Promise.all(workers);
  return results;
}

function evaluateFlow(flow, results, maximumErrorRate) {
  const successful = results.filter(item => item.ok).map(item => item.durationMs);
  const failures = results.filter(item => !item.ok);
  const errorRate = failures.length / results.length;
  const measurements = {
    p50Ms: percentile(successful, 0.5),
    p95Ms: percentile(successful, 0.95),
    p99Ms: percentile(successful, 0.99),
  };
  const checks = [
    {
      name: "errorRate",
      ok: errorRate <= maximumErrorRate,
      actual: errorRate,
      maximum: maximumErrorRate,
    },
    ...Object.entries(measurements).map(([name, actual]) => ({
      name,
      ok: actual !== null && actual <= flow[name],
      actual,
      maximum: flow[name],
    })),
  ];
  return {
    name: flow.name,
    path: flow.path,
    requests: results.length,
    successfulRequests: successful.length,
    failedRequests: failures.length,
    errorRate,
    statusCounts: Object.fromEntries([...new Set(results.map(item => item.status))].sort().map(status => [status, results.filter(item => item.status === status).length])),
    p50Ms: measurements.p50Ms,
    p95Ms: measurements.p95Ms,
    p99Ms: measurements.p99Ms,
    checks,
    ok: checks.every(check => check.ok),
  };
}

export async function evaluateApiSlo({ config, environment = process.env, options = {} }) {
  const api = config.api;
  const rawBaseUrl = environment[api.baseUrlEnvironment];
  if (!rawBaseUrl) throw new Error(`Configure ${api.baseUrlEnvironment}.`);
  const baseUrl = rawBaseUrl.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error(`${api.baseUrlEnvironment} deve ser uma URL HTTP(S).`);
  if (options.production && !baseUrl.startsWith("https://")) throw new Error(`${api.baseUrlEnvironment} deve usar HTTPS no gate de produção.`);
  const origin = environment.PERF_WEB_ORIGIN || new URL(baseUrl).origin;
  const timeoutMs = positiveInteger(options.timeoutMs ?? environment.PERF_API_TIMEOUT_MS ?? api.requestTimeoutMs, "timeout");
  const iterations = positiveInteger(options.iterations ?? environment.PERF_API_ITERATIONS ?? api.iterations, "iterations");
  const concurrency = positiveInteger(options.concurrency ?? environment.PERF_API_CONCURRENCY ?? api.concurrency, "concurrency");
  const warmupRequests = Number(options.warmupRequests ?? environment.PERF_API_WARMUP_REQUESTS ?? api.warmupRequests);
  if (!Number.isInteger(warmupRequests) || warmupRequests < 0) throw new Error("warmupRequests deve ser um inteiro não negativo.");
  const requireAll = options.requireAll ?? String(environment.PERF_REQUIRE_ALL_FLOWS ?? "false").toLowerCase() === "true";
  const loginProfiles = { student: api.login, admin: api.adminLogin };
  const cookies = new Map();
  const flows = [];

  for (const flow of api.flows) {
    if (flow.requiredEnvironment && !environment[flow.requiredEnvironment]) {
      flows.push({ name: flow.name, path: flow.path, skipped: true, ok: !requireAll, reason: `Variável ausente: ${flow.requiredEnvironment}` });
      continue;
    }
    const authProfile = flow.authProfile ?? "student";
    const loginConfig = loginProfiles[authProfile];
    if (!loginConfig) {
      flows.push({ name: flow.name, path: flow.path, skipped: true, ok: false, reason: `Perfil de autenticação inválido: ${authProfile}` });
      continue;
    }
    const missingCredentials = [loginConfig.emailEnvironment, loginConfig.passwordEnvironment].filter(name => !environment[name]);
    if (missingCredentials.length) {
      flows.push({
        name: flow.name,
        path: flow.path,
        skipped: true,
        ok: !requireAll,
        reason: `Credenciais ausentes: ${missingCredentials.join(", ")}`,
      });
      continue;
    }
    if (!cookies.has(authProfile)) {
      cookies.set(authProfile, await login(baseUrl, loginConfig, timeoutMs, origin, environment));
    }
    const path = interpolateEnvironment(flow.path, environment);
    const target = { url: `${baseUrl}${path}`, method: flow.method, body: flow.body, cookie: cookies.get(authProfile), origin, timeoutMs };
    const operation = () => requestFlow(target, flow, environment);
    for (let index = 0; index < warmupRequests; index += 1) await operation();
    const flowConcurrency = positiveInteger(flow.concurrency ?? concurrency, `${flow.name}.concurrency`);
    const results = await runPool(iterations, flowConcurrency, operation);
    flows.push({ ...evaluateFlow({ ...flow, path }, results, api.maximumErrorRate), authProfile, concurrency: flowConcurrency });
  }

  const measuredFlows = flows.filter(flow => !flow.skipped).length;

  return {
    kind: "api-slo",
    generatedAt: new Date().toISOString(),
    target: new URL(baseUrl).origin,
    iterations,
    concurrency,
    warmupRequests,
    requireAll,
    production: Boolean(options.production),
    measuredFlows,
    ok: measuredFlows > 0 && flows.every(flow => flow.ok),
    flows,
  };
}

function duration(value) {
  return value === null || value === undefined ? "missing" : `${value.toFixed(1)} ms`;
}

function printReport(report) {
  console.table(report.flows.map(flow => ({
    flow: flow.name,
    requests: flow.skipped ? "skipped" : flow.requests,
    errors: flow.skipped ? "-" : `${(flow.errorRate * 100).toFixed(2)}%`,
    p50: flow.skipped ? "-" : duration(flow.p50Ms),
    p95: flow.skipped ? "-" : duration(flow.p95Ms),
    p99: flow.skipped ? "-" : duration(flow.p99Ms),
    status: flow.ok ? (flow.skipped ? "SKIP" : "PASS") : "FAIL",
  })));
  for (const flow of report.flows.filter(item => !item.ok)) {
    if (flow.skipped) console.error(`FAIL ${flow.name}: ${flow.reason}.`);
    for (const check of flow.checks ?? []) {
      if (!check.ok) console.error(`FAIL ${flow.name} ${check.name}: ${check.actual} / ${check.maximum}.`);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const config = await loadJson(args.config || "performance/targets.json");
  const report = await evaluateApiSlo({
    config,
    options: {
      timeoutMs: args.timeout,
      iterations: args.iterations,
      concurrency: args.concurrency,
      warmupRequests: args.warmup,
      requireAll: args["require-all"] === true ? true : undefined,
      production: args.production === true || String(process.env.PERF_RELEASE_MODE ?? "").toLowerCase() === "production",
    },
  });
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
