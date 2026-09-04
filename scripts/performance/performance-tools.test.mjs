import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import { evaluateApiSlo } from "./check-api-slo.mjs";
import { normalizeRoute, parseClientReferenceManifest } from "./check-next-build.mjs";
import { evaluateWebVitals, normalizeWebVitals, parseVitalsText } from "./check-web-vitals.mjs";
import { interpolateEnvironment, matchesPattern, percentile } from "./core.mjs";

describe("performance core", () => {
  test("calculates nearest-rank percentiles without mutating input", () => {
    const values = [4, 1, 3, 2];
    assert.equal(percentile(values, 0.5), 2);
    assert.equal(percentile(values, 0.95), 4);
    assert.deepEqual(values, [4, 1, 3, 2]);
  });

  test("matches exact and wildcard route patterns", () => {
    assert.equal(matchesPattern("/admin/students", "/admin/*"), true);
    assert.equal(matchesPattern("/admin", "/admin/*"), false);
    assert.equal(matchesPattern("/login", "/login"), true);
    assert.equal(matchesPattern("/login/help", "/login"), false);
  });

  test("interpolates required environment variables", () => {
    assert.equal(interpolateEnvironment("/lessons/${LESSON_ID}", { LESSON_ID: "abc" }), "/lessons/abc");
    assert.throws(() => interpolateEnvironment("${MISSING}", {}), /MISSING/);
  });
});

describe("Next.js build manifest parser", () => {
  test("ignores the RSC initializer and extracts the assigned route", () => {
    const payload = { clientModules: {}, entryCSSFiles: {}, entryJSFiles: {} };
    const source = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
      `globalThis.__RSC_MANIFEST["/watch/[lessonId]/page"] = ${JSON.stringify(payload)};`;
    const parsed = parseClientReferenceManifest(source);
    assert.equal(parsed.route, "/watch/[lessonId]");
    assert.deepEqual(parsed.manifest, payload);
  });

  test("normalizes the App Router home route", () => {
    assert.equal(normalizeRoute("/page"), "/");
  });
});

describe("Web Vitals gate", () => {
  const config = {
    webVitals: {
      percentile: 0.75,
      minimumSamples: 3,
      metrics: {
        LCP: { maximum: 2500, unit: "ms" },
        CLS: { maximum: 0.1, unit: "score" },
      },
    },
  };

  test("normalizes JSON, NDJSON and aggregate payloads", () => {
    const json = parseVitalsText('[{"name":"LCP","value":1200}]');
    assert.equal(normalizeWebVitals(json).get("LCP").values[0], 1200);
    const ndjson = parseVitalsText('{"name":"LCP","value":1200}\n{"name":"CLS","value":0.03}');
    assert.equal(normalizeWebVitals(ndjson).get("CLS").values[0], 0.03);
    const aggregate = normalizeWebVitals({ metrics: { LCP: { p75: 2100, count: 500 } } });
    assert.deepEqual(aggregate.get("LCP").aggregates, [{ p75: 2100, samples: 500, route: null }]);
  });

  test("passes only with enough samples below every p75 target", () => {
    const passing = evaluateWebVitals({
      payload: {
        metrics: [
          ...[1000, 1400, 2000, 2300].map(value => ({ name: "LCP", value })),
          ...[0.01, 0.02, 0.05, 0.08].map(value => ({ name: "CLS", value })),
        ],
      },
      config,
      minimumSamples: 3,
    });
    assert.equal(passing.ok, true);

    const failing = evaluateWebVitals({
      payload: { metrics: { LCP: { p75: 2600, count: 100 }, CLS: { p75: 0.04, count: 100 } } },
      config,
      minimumSamples: 3,
    });
    assert.equal(failing.ok, false);
    assert.equal(failing.metrics.find(metric => metric.name === "LCP").withinTarget, false);
  });

  test("usa o pior p75 entre rotas sem perder a soma das amostras", () => {
    const report = evaluateWebVitals({
      payload: {
        webVitals: [
          { name: "LCP", route: "/browse", p75: 1800, samples: 80 },
          { name: "LCP", route: "/catalog", p75: 2700, samples: 70 },
          { name: "CLS", route: "/browse", p75: 0.03, samples: 150 },
        ],
      },
      config,
      minimumSamples: 100,
    });
    const lcp = report.metrics.find(metric => metric.name === "LCP");
    assert.equal(lcp.samples, 150);
    assert.equal(lcp.actual, 2700);
    assert.equal(lcp.worstRoute, "/catalog");
    assert.equal(lcp.ok, false);
  });
});

describe("authenticated API SLO gate", () => {
  let server;
  let baseUrl;
  let cleanupRequests = 0;

  before(async () => {
    server = createServer((request, response) => {
      if (request.url === "/api/auth/login" && request.method === "POST") {
        response.setHeader("set-cookie", "academy_session=test-token; HttpOnly; Path=/");
        response.setHeader("content-type", "application/json");
        response.end('{"user":{"id":"test"}}');
        return;
      }
      if (request.url === "/api/ok" && request.headers.cookie === "academy_session=test-token") {
        response.setHeader("content-type", "application/json");
        response.end('{"ok":true}');
        return;
      }
      if (request.url === "/api/playback/lessons/lesson-1/bootstrap" && request.method === "POST" && request.headers.cookie === "academy_session=test-token") {
        response.setHeader("content-type", "application/json");
        response.end('{"playbackSession":{"id":"session-1"}}');
        return;
      }
      if (request.url === "/api/playback/sessions/session-1/end" && request.method === "POST" && request.headers.cookie === "academy_session=test-token") {
        cleanupRequests += 1;
        response.setHeader("content-type", "application/json");
        response.end('{"ended":true}');
        return;
      }
      response.statusCode = 401;
      response.end('{"error":"unauthorized"}');
    });
    await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise(resolveClose => server.close(resolveClose));
  });

  test("measures percentiles and skips optional unresolved flows", async () => {
    const config = {
      api: {
        baseUrlEnvironment: "PERF_API_BASE_URL",
        requestTimeoutMs: 1000,
        warmupRequests: 1,
        iterations: 5,
        concurrency: 2,
        maximumErrorRate: 0,
        login: {
          path: "/api/auth/login",
          emailEnvironment: "PERF_STUDENT_EMAIL",
          passwordEnvironment: "PERF_STUDENT_PASSWORD",
        },
        flows: [
          { name: "ok", method: "GET", path: "/api/ok", p50Ms: 200, p95Ms: 200, p99Ms: 200 },
          { name: "optional", method: "GET", path: "/api/${OPTIONAL_ID}", requiredEnvironment: "OPTIONAL_ID", p50Ms: 200, p95Ms: 200, p99Ms: 200 },
        ],
      },
    };
    const report = await evaluateApiSlo({
      config,
      environment: {
        PERF_API_BASE_URL: baseUrl,
        PERF_STUDENT_EMAIL: "student@example.com",
        PERF_STUDENT_PASSWORD: "password123",
      },
    });
    assert.equal(report.ok, true);
    assert.equal(report.flows[0].successfulRequests, 5);
    assert.equal(report.flows[1].skipped, true);
  });

  test("encerra cada sessão de playback antes da próxima medição", async () => {
    cleanupRequests = 0;
    const config = {
      api: {
        baseUrlEnvironment: "PERF_API_BASE_URL",
        requestTimeoutMs: 1000,
        warmupRequests: 1,
        iterations: 3,
        concurrency: 3,
        maximumErrorRate: 0,
        login: {
          path: "/api/auth/login",
          emailEnvironment: "PERF_STUDENT_EMAIL",
          passwordEnvironment: "PERF_STUDENT_PASSWORD",
        },
        flows: [{
          name: "playback",
          method: "POST",
          path: "/api/playback/lessons/lesson-1/bootstrap",
          body: { deviceFingerprint: "performance-test-device" },
          concurrency: 1,
          cleanup: {
            method: "POST",
            path: "/api/playback/sessions/${responseId}/end",
            responseIdPath: "playbackSession.id",
            body: {},
          },
          p50Ms: 200,
          p95Ms: 200,
          p99Ms: 200,
        }],
      },
    };
    const report = await evaluateApiSlo({
      config,
      environment: {
        PERF_API_BASE_URL: baseUrl,
        PERF_STUDENT_EMAIL: "student@example.com",
        PERF_STUDENT_PASSWORD: "password123",
      },
    });
    assert.equal(report.ok, true);
    assert.equal(report.flows[0].concurrency, 1);
    assert.equal(cleanupRequests, 4);
  });

  test("exige HTTPS quando o gate está em modo de produção", async () => {
    const config = {
      api: {
        baseUrlEnvironment: "PERF_API_BASE_URL",
        requestTimeoutMs: 1000,
        warmupRequests: 0,
        iterations: 1,
        concurrency: 1,
        maximumErrorRate: 0,
        login: { path: "/api/auth/login", emailEnvironment: "EMAIL", passwordEnvironment: "PASSWORD" },
        flows: [],
      },
    };
    await assert.rejects(() => evaluateApiSlo({ config, environment: { PERF_API_BASE_URL: baseUrl }, options: { production: true } }), /HTTPS/);
  });
});
