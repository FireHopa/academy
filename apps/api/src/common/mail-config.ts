import type { ConfigService } from "@nestjs/config";

type ConfigReader = Pick<ConfigService, "get">;

function configured(config: ConfigReader, key: string) {
  const value = config.get<unknown>(key);
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function enabled(config: ConfigReader, key: string) {
  const value = config.get<unknown>(key);
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function mailConfigurationReady(config: ConfigReader, production: boolean) {
  const provider = String(config.get("MAIL_PROVIDER") ?? "disabled").trim().toLowerCase();

  if (provider === "disabled") {
    return !production || enabled(config, "ALLOW_DISABLED_MAIL_IN_PRODUCTION");
  }

  if (provider !== "resend") return false;
  return configured(config, "RESEND_API_KEY") && configured(config, "MAIL_FROM");
}

export function validateProductionMailConfig(config: ConfigReader) {
  const provider = String(config.get("MAIL_PROVIDER") ?? "disabled").trim().toLowerCase();

  if (provider === "disabled") {
    if (!enabled(config, "ALLOW_DISABLED_MAIL_IN_PRODUCTION")) {
      throw new Error(
        "Em produção configure MAIL_PROVIDER=resend ou confirme conscientemente o modo sem e-mail com ALLOW_DISABLED_MAIL_IN_PRODUCTION=true.",
      );
    }
    return;
  }

  if (provider !== "resend") throw new Error("MAIL_PROVIDER deve ser resend ou disabled.");
  if (!configured(config, "RESEND_API_KEY") || !configured(config, "MAIL_FROM")) {
    throw new Error("MAIL_PROVIDER=resend exige RESEND_API_KEY e MAIL_FROM.");
  }
}
