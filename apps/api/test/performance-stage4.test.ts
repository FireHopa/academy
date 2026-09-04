import assert from "node:assert/strict";
import test from "node:test";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ObservabilityExportGuard } from "../src/observability/observability-export.guard";
import { config } from "./helpers";

function context(authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as any;
}

test("exportação de observabilidade aceita somente bearer token configurado", () => {
  const token = "observability-stage4-token-with-32-chars-minimum";
  const guard = new ObservabilityExportGuard(config({ OBSERVABILITY_EXPORT_TOKEN: token }) as any);

  assert.equal(guard.canActivate(context(`Bearer ${token}`)), true);
  assert.throws(() => guard.canActivate(context("Bearer incorreto")), UnauthorizedException);
  assert.throws(() => guard.canActivate(context()), UnauthorizedException);
});

test("exportação permanece indisponível quando não existe segredo forte", () => {
  const missing = new ObservabilityExportGuard(config() as any);
  const weak = new ObservabilityExportGuard(config({ OBSERVABILITY_EXPORT_TOKEN: "curto" }) as any);

  assert.throws(() => missing.canActivate(context("Bearer qualquer")), ServiceUnavailableException);
  assert.throws(() => weak.canActivate(context("Bearer curto")), ServiceUnavailableException);
});
