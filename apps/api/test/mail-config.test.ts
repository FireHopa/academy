import assert from "node:assert/strict";
import { test } from "node:test";
import { mailConfigurationReady, validateProductionMailConfig } from "../src/common/mail-config";
import { config } from "./helpers";

test("modo sem e-mail é bloqueado em produção sem autorização explícita", () => {
  const values = config({ MAIL_PROVIDER: "disabled" }) as any;

  assert.equal(mailConfigurationReady(values, false), true);
  assert.equal(mailConfigurationReady(values, true), false);
  assert.throws(() => validateProductionMailConfig(values), /ALLOW_DISABLED_MAIL_IN_PRODUCTION/);
});

test("modo sem e-mail é aceito em produção quando explicitamente autorizado", () => {
  const values = config({
    MAIL_PROVIDER: "disabled",
    ALLOW_DISABLED_MAIL_IN_PRODUCTION: "true",
  }) as any;

  assert.equal(mailConfigurationReady(values, true), true);
  assert.doesNotThrow(() => validateProductionMailConfig(values));
});

test("Resend continua exigindo chave e remetente", () => {
  const incomplete = config({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "", MAIL_FROM: "" }) as any;
  const complete = config({
    MAIL_PROVIDER: "resend",
    RESEND_API_KEY: "resend-secret",
    MAIL_FROM: "Academy <academy@example.com>",
  }) as any;

  assert.equal(mailConfigurationReady(incomplete, true), false);
  assert.throws(() => validateProductionMailConfig(incomplete), /RESEND_API_KEY e MAIL_FROM/);
  assert.equal(mailConfigurationReady(complete, true), true);
  assert.doesNotThrow(() => validateProductionMailConfig(complete));
});

test("provedor desconhecido permanece bloqueado", () => {
  const values = config({ MAIL_PROVIDER: "smtp" }) as any;

  assert.equal(mailConfigurationReady(values, true), false);
  assert.throws(() => validateProductionMailConfig(values), /resend ou disabled/);
});
