#!/usr/bin/env node

import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatBytes,
  loadJson,
  matchesPattern,
  parseArguments,
  reportExit,
  saveReport,
} from "./core.mjs";

const MANIFEST_SUFFIX = "_client-reference-manifest.js";

async function walk(directory, predicate, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, predicate, output);
    else if (predicate(path)) output.push(path);
  }
  return output;
}

export function parseClientReferenceManifest(source, path = "manifest") {
  const assignment = /globalThis\.__RSC_MANIFEST\["([^"]+)"\]\s*=\s*/.exec(source);
  if (!assignment) throw new Error(`Manifesto Next.js inválido: ${path}`);
  const json = source.slice(assignment.index + assignment[0].length).trim().replace(/;$/, "");
  return { route: normalizeRoute(assignment[1]), manifest: JSON.parse(json) };
}

export function normalizeRoute(route) {
  if (route === "/page") return "/";
  return route.endsWith("/page") ? route.slice(0, -5) : route;
}

function normalizeAssetPath(buildDirectory, asset) {
  const clean = asset.replace(/^\/_next\//, "").replace(/^\.next\//, "");
  return resolve(buildDirectory, clean);
}

async function assetMeasurement(path, cache) {
  if (cache.has(path)) return cache.get(path);
  const bytes = await readFile(path);
  const measurement = {
    path,
    rawBytes: bytes.length,
    brotliBytes: brotliCompressSync(bytes, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
  cache.set(path, measurement);
  return measurement;
}

async function routeAssets(buildDirectory, clientPath, parsed, cache) {
  const js = new Set();
  const css = new Set();
  const modules = Object.keys(parsed.manifest.clientModules ?? {});

  for (const files of Object.values(parsed.manifest.entryJSFiles ?? {})) {
    for (const file of files) js.add(normalizeAssetPath(buildDirectory, file));
  }
  for (const entries of Object.values(parsed.manifest.entryCSSFiles ?? {})) {
    for (const entry of entries) {
      const file = typeof entry === "string" ? entry : entry.path;
      if (file) css.add(normalizeAssetPath(buildDirectory, file));
    }
  }

  const pageBuildManifest = clientPath.replace(MANIFEST_SUFFIX, `${sep}build-manifest.json`);
  try {
    const buildManifest = JSON.parse(await readFile(pageBuildManifest, "utf8"));
    for (const file of [...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])]) {
      js.add(normalizeAssetPath(buildDirectory, file));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const jsAssets = await Promise.all([...js].map(path => assetMeasurement(path, cache)));
  const cssAssets = await Promise.all([...css].map(path => assetMeasurement(path, cache)));
  const sum = (assets, key) => assets.reduce((total, asset) => total + asset[key], 0);
  return {
    modules,
    jsAssets,
    cssAssets,
    javascriptRawBytes: sum(jsAssets, "rawBytes"),
    javascriptBrotliBytes: sum(jsAssets, "brotliBytes"),
    cssRawBytes: sum(cssAssets, "rawBytes"),
    cssBrotliBytes: sum(cssAssets, "brotliBytes"),
  };
}

function budgetForRoute(nextConfig, route) {
  const overrides = nextConfig.overrides.filter(item => matchesPattern(route, item.match));
  return Object.assign({}, nextConfig.defaults, ...overrides);
}

function routeChecks(route, measurement, budget, forbiddenModules) {
  const totalBrotliBytes = measurement.javascriptBrotliBytes + measurement.cssBrotliBytes;
  const checks = [
    {
      name: "javascriptBrotliBytes",
      ok: measurement.javascriptBrotliBytes <= budget.javascriptBrotliBytes,
      actual: measurement.javascriptBrotliBytes,
      maximum: budget.javascriptBrotliBytes,
    },
    {
      name: "cssBrotliBytes",
      ok: measurement.cssBrotliBytes <= budget.cssBrotliBytes,
      actual: measurement.cssBrotliBytes,
      maximum: budget.cssBrotliBytes,
    },
    {
      name: "totalBrotliBytes",
      ok: totalBrotliBytes <= budget.totalBrotliBytes,
      actual: totalBrotliBytes,
      maximum: budget.totalBrotliBytes,
    },
  ];

  for (const forbidden of forbiddenModules) {
    const matches = measurement.modules.filter(module => module.includes(forbidden));
    checks.push({
      name: `forbidden:${forbidden}`,
      ok: matches.length === 0,
      actual: matches,
      maximum: 0,
    });
  }

  return {
    route,
    budget,
    javascriptRawBytes: measurement.javascriptRawBytes,
    javascriptBrotliBytes: measurement.javascriptBrotliBytes,
    cssRawBytes: measurement.cssRawBytes,
    cssBrotliBytes: measurement.cssBrotliBytes,
    totalBrotliBytes,
    initialFiles: [...measurement.jsAssets, ...measurement.cssAssets].map(asset => basename(asset.path)),
    checks,
    ok: checks.every(check => check.ok),
  };
}

export async function evaluateNextBuild({ config, rootDirectory = process.cwd() }) {
  const nextConfig = config.nextBuild;
  const buildDirectory = resolve(rootDirectory, nextConfig.buildDirectory);
  const appDirectory = join(buildDirectory, "server", "app");
  const paths = await walk(appDirectory, path => path.endsWith(MANIFEST_SUFFIX));
  if (paths.length === 0) throw new Error(`Nenhum manifesto App Router encontrado em ${appDirectory}. Execute o build antes do gate.`);

  const assetCache = new Map();
  const routes = [];
  for (const path of paths.sort()) {
    const parsed = parseClientReferenceManifest(await readFile(path, "utf8"), path);
    if (["/_global-error", "/_not-found"].includes(parsed.route)) continue;
    const measurement = await routeAssets(buildDirectory, path, parsed, assetCache);
    routes.push(routeChecks(
      parsed.route,
      measurement,
      budgetForRoute(nextConfig, parsed.route),
      nextConfig.forbiddenInitialClientModules,
    ));
  }

  const initialAssets = [...assetCache.values()];
  const largestInitialChunk = initialAssets
    .filter(asset => asset.path.endsWith(".js"))
    .sort((a, b) => b.brotliBytes - a.brotliBytes)[0] ?? null;
  const cssPaths = await walk(join(buildDirectory, "static", "chunks"), path => path.endsWith(".css"));
  const cssAssets = await Promise.all(cssPaths.map(path => assetMeasurement(path, assetCache)));
  const totalCssRawBytes = cssAssets.reduce((total, asset) => total + asset.rawBytes, 0);
  const aggregateChecks = [
    {
      name: "largestInitialChunkBrotliBytes",
      ok: Boolean(largestInitialChunk) && largestInitialChunk.brotliBytes <= nextConfig.assets.largestInitialChunkBrotliBytes,
      actual: largestInitialChunk?.brotliBytes ?? 0,
      maximum: nextConfig.assets.largestInitialChunkBrotliBytes,
      asset: largestInitialChunk ? relative(buildDirectory, largestInitialChunk.path) : null,
    },
    {
      name: "totalCssRawBytes",
      ok: totalCssRawBytes <= nextConfig.assets.totalCssRawBytes,
      actual: totalCssRawBytes,
      maximum: nextConfig.assets.totalCssRawBytes,
    },
  ];

  return {
    kind: "next-build",
    generatedAt: new Date().toISOString(),
    buildDirectory: relative(rootDirectory, buildDirectory),
    ok: routes.every(route => route.ok) && aggregateChecks.every(check => check.ok),
    routes,
    aggregateChecks,
  };
}

function printReport(report) {
  console.table(report.routes.map(route => ({
    route: route.route,
    js_brotli: formatBytes(route.javascriptBrotliBytes),
    css_brotli: formatBytes(route.cssBrotliBytes),
    total_brotli: formatBytes(route.totalBrotliBytes),
    status: route.ok ? "PASS" : "FAIL",
  })));
  for (const check of report.aggregateChecks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${formatBytes(check.actual)} / ${formatBytes(check.maximum)}`);
  }
  for (const route of report.routes.filter(item => !item.ok)) {
    for (const check of route.checks.filter(item => !item.ok)) {
      const actual = Array.isArray(check.actual) ? check.actual.join(", ") : formatBytes(check.actual);
      console.error(`FAIL ${route.route} ${check.name}: ${actual}`);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const config = await loadJson(args.config || "performance/targets.json");
  const report = await evaluateNextBuild({ config, rootDirectory: args.root || process.cwd() });
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
