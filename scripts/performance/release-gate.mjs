#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArguments, saveReport } from "./core.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export function runCheck(name, script, args) {
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, [join(scriptDirectory, script), ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", error => resolveResult({ name, ok: false, error: error.message }));
    child.once("exit", (code, signal) => resolveResult({
      name,
      ok: code === 0,
      exitCode: code,
      signal,
    }));
  });
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const production = args.production === true || String(process.env.PERF_RELEASE_MODE ?? "").toLowerCase() === "production";
  const config = args.config || "performance/targets.json";
  const resultsDirectory = args["results-directory"] || ".performance-results";
  const checks = [];

  checks.push(await runCheck("next-build", "check-next-build.mjs", [
    "--config", config,
    "--output", join(resultsDirectory, "next-build.json"),
  ]));

  if (process.env.PERF_API_BASE_URL) {
    const apiArgs = ["--config", config, "--output", join(resultsDirectory, "api-slo.json")];
    if (production) apiArgs.push("--require-all", "--production");
    checks.push(await runCheck("api-slo", "check-api-slo.mjs", apiArgs));
  } else {
    checks.push({ name: "api-slo", ok: !production, skipped: true, reason: "PERF_API_BASE_URL ausente" });
  }

  if (process.env.PERF_WEB_VITALS_SOURCE) {
    const webVitalsArgs = [
      "--config", config,
      "--source", process.env.PERF_WEB_VITALS_SOURCE,
      "--output", join(resultsDirectory, "web-vitals.json"),
    ];
    if (production) webVitalsArgs.push("--production");
    checks.push(await runCheck("web-vitals", "check-web-vitals.mjs", webVitalsArgs));
  } else {
    checks.push({ name: "web-vitals", ok: !production, skipped: true, reason: "PERF_WEB_VITALS_SOURCE ausente" });
  }

  const report = {
    kind: "release-gate",
    generatedAt: new Date().toISOString(),
    mode: production ? "production" : "pull-request",
    ok: checks.every(check => check.ok),
    checks,
  };
  await saveReport(args.output || join(resultsDirectory, "release-gate.json"), report);
  console.table(checks.map(check => ({
    check: check.name,
    status: check.ok ? (check.skipped ? "SKIP" : "PASS") : "FAIL",
    reason: check.reason ?? check.error ?? "",
  })));
  if (!report.ok) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
