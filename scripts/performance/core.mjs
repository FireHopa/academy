import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new RangeError("O percentil deve estar no intervalo (0, 1].");
  }
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function matchesPattern(value, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

export function interpolateEnvironment(value, environment = process.env) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name) => {
    const replacement = environment[name];
    if (!replacement) throw new Error(`Variável obrigatória ausente: ${name}`);
    return replacement;
  });
}

export function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Argumento inválido: ${item}`);
    const [rawName, inlineValue] = item.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[rawName] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[rawName] = true;
      continue;
    }
    args[rawName] = next;
    index += 1;
  }
  return args;
}

export async function loadJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

export async function saveReport(path, report) {
  if (!path) return;
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

export function summarizeFailures(checks) {
  return checks.filter(check => !check.ok).map(check => check.message);
}

export function reportExit(report) {
  if (!report.ok) process.exitCode = 1;
}
