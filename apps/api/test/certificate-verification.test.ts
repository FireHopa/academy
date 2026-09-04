import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { RequestMethod } from "@nestjs/common";
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { IS_PUBLIC_KEY } from "../src/auth/public.decorator";
import { CertificateVerificationController } from "../src/experience/certificate-verification.controller";
import { ExperienceService } from "../src/experience/experience.service";
import { recorded } from "./helpers";

const issuedAt = new Date("2026-08-15T12:00:00.000Z");

test("verificação pública normaliza código legado e expõe somente os dados necessários", async () => {
  const findUnique = recorded(async () => ({
    code: "CERT-2026-ABCDEF1234",
    issuedAt,
    user: { name: "Ada Lovelace", email: "privado@example.com", id: "user-1" },
    course: { title: "Curso base", certificateTitle: "Formação Avançada", id: "course-1", slug: "curso-base" },
  }));
  const service = new ExperienceService({ certificate: { findUnique } } as any);

  const result = await service.verifyCertificate("  cert-2026-abcdef1234  ");

  assert.deepEqual(findUnique.calls[0][0], {
    where: { code: "CERT-2026-ABCDEF1234" },
    select: {
      code: true,
      issuedAt: true,
      user: { select: { name: true } },
      course: { select: { title: true, certificateTitle: true } },
    },
  });
  assert.deepEqual(result, {
    valid: true,
    certificate: {
      code: "CERT-2026-ABCDEF1234",
      studentName: "Ada Lovelace",
      courseTitle: "Formação Avançada",
      issuedAt,
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /privado@example|user-1|course-1|curso-base/);
});

test("verificação pública usa o título normal quando não existe título de certificado", async () => {
  const service = new ExperienceService({
    certificate: {
      findUnique: async () => ({
        code: "CERT-2026-0123456789ABCDEF",
        issuedAt,
        user: { name: "Grace Hopper" },
        course: { title: "Fundamentos", certificateTitle: null },
      }),
    },
  } as any);

  const result = await service.verifyCertificate("CERT-2026-0123456789ABCDEF");

  assert.equal(result.valid, true);
  assert.equal(result.certificate?.courseTitle, "Fundamentos");
});

test("código malformado não consulta o banco nem revela o motivo", async () => {
  const findUnique = recorded(async () => null);
  const service = new ExperienceService({ certificate: { findUnique } } as any);

  const result = await service.verifyCertificate("codigo-invalido");

  assert.deepEqual(result, { valid: false, certificate: null });
  assert.equal(findUnique.calls.length, 0);
});

test("código bem formatado inexistente usa a mesma resposta pública negativa", async () => {
  const service = new ExperienceService({
    certificate: { findUnique: async () => null },
  } as any);

  const result = await service.verifyCertificate("CERT-2025-0000000000");

  assert.deepEqual(result, { valid: false, certificate: null });
});

test("endpoint de verificação é GET público, não armazenável e limitado a dez consultas por minuto", async () => {
  const verifyCertificate = recorded(async (code: string) => ({ valid: false, certificate: null, code }));
  const controller = new CertificateVerificationController({ verifyCertificate } as any);
  const handler = CertificateVerificationController.prototype.verify;
  const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as Array<{ name: string; value: string }>;

  assert.equal(Reflect.getMetadata(PATH_METADATA, CertificateVerificationController), "certificates");
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), "verify/:code");
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
  assert.deepEqual(headers, [{ name: "Cache-Control", value: "no-store" }]);
  assert.equal(Reflect.getMetadata("THROTTLER:LIMITdefault", handler), 10);
  assert.equal(Reflect.getMetadata("THROTTLER:TTLdefault", handler), 60_000);

  await controller.verify("CERT-2026-ABCDEF1234");
  assert.deepEqual(verifyCertificate.calls[0], ["CERT-2026-ABCDEF1234"]);
});

test("frontend publica o verificador sem incluí-lo nas rotas protegidas", () => {
  const root = process.cwd();
  const proxy = readFileSync(resolve(root, "apps/web/proxy.ts"), "utf8");
  const login = readFileSync(resolve(root, "apps/web/app/login/page.tsx"), "utf8");
  const privateCertificate = readFileSync(resolve(root, "apps/web/app/certificate/[code]/page.tsx"), "utf8");
  const publicCertificate = readFileSync(resolve(root, "apps/web/components/certificate-verifier.tsx"), "utf8");

  assert.doesNotMatch(proxy, /verify-certificate/);
  assert.match(login, /href="\/verify-certificate"/);
  assert.match(privateCertificate, /Validar publicamente/);
  assert.match(publicCertificate, /\/certificates\/verify\//);
  assert.doesNotMatch(publicCertificate, /email|userId|courseId/);
});
