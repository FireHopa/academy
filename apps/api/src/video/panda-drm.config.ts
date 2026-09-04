import type { ConfigService } from "@nestjs/config";

export const PANDA_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function pandaConfigValue(config: ConfigService, key: string) {
  const raw = config.get<unknown>(key);
  return raw === undefined || raw === null ? "" : String(raw).trim();
}

export function parsePandaBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

export function pandaDrmRequired(config: ConfigService, fallback = true) {
  return parsePandaBoolean(config.get<unknown>("PANDA_REQUIRE_DRM")) ?? fallback;
}

export function pandaDrmCredentials(config: ConfigService) {
  const groupId = pandaConfigValue(config, "PANDA_DRM_GROUP_ID");
  const secret = pandaConfigValue(config, "PANDA_DRM_GROUP_SECRET");
  return {
    groupId,
    secret,
    configured: Boolean(groupId && secret && PANDA_UUID_PATTERN.test(groupId)),
    partial: Boolean(groupId) !== Boolean(secret),
    groupIdValid: Boolean(groupId && PANDA_UUID_PATTERN.test(groupId)),
  };
}

export function validatePandaDrmProductionConfig(config: ConfigService) {
  if (parsePandaBoolean(config.get<unknown>("PANDA_REQUIRE_DRM")) !== true) {
    throw new Error("PANDA_REQUIRE_DRM deve ser true em produção.");
  }

  const credentials = pandaDrmCredentials(config);
  const missing = [
    !credentials.groupId ? "PANDA_DRM_GROUP_ID" : "",
    !credentials.secret ? "PANDA_DRM_GROUP_SECRET" : "",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Configuração Panda incompleta em produção: ${missing.join(", ")}.`);
  }
  if (!credentials.groupIdValid) {
    throw new Error("PANDA_DRM_GROUP_ID deve ser um UUID válido em produção.");
  }
}
