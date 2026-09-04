"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { apiFetch } from "@/lib/api";

type PublicCertificate = {
  code: string;
  studentName: string;
  courseTitle: string;
  issuedAt: string;
};

type VerificationResult = {
  valid: boolean;
  certificate: PublicCertificate | null;
};

type VerificationState = "idle" | "loading" | "valid" | "not-found" | "error";
const CERTIFICATE_CODE_PATTERN = /^CERT-\d{4}-(?:[A-F0-9]{10}|[A-F0-9]{16})$/;

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function CertificateVerifier({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(() => normalizeCode(initialCode));
  const [state, setState] = useState<VerificationState>(initialCode ? "loading" : "idle");
  const [certificate, setCertificate] = useState<PublicCertificate | null>(null);

  useEffect(() => {
    const normalized = normalizeCode(initialCode);
    setCode(normalized);
    setCertificate(null);
    if (!normalized) {
      setState("idle");
      return;
    }
    if (!CERTIFICATE_CODE_PATTERN.test(normalized)) {
      setState("not-found");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    apiFetch<VerificationResult>(`/certificates/verify/${encodeURIComponent(normalized)}`, {
      signal: controller.signal,
    })
      .then(result => {
        setCertificate(result.certificate);
        setState(result.valid && result.certificate ? "valid" : "not-found");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [initialCode]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeCode(code);
    if (!normalized) return;
    router.push(`/verify-certificate/${encodeURIComponent(normalized)}`);
  }

  return (
    <main className="verification-page">
      <section className="verification-card">
        <BrandLogo className="auth-brand-logo" height={142} />
        <div className="verification-kicker">VALIDAÇÃO PÚBLICA</div>
        <h1>Verificar certificado</h1>
        <p>Digite o código exibido no certificado para confirmar sua autenticidade.</p>

        <form className="verification-form" onSubmit={submit}>
          <label className="field">
            <span>Código do certificado</span>
            <input
              required
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="CERT-2026-0123456789ABCDEF"
              aria-describedby="certificate-code-help"
            />
          </label>
          <small id="certificate-code-help">O código pode ser digitado com letras maiúsculas ou minúsculas.</small>
          <button className="btn btn-primary full" type="submit">Verificar autenticidade</button>
        </form>

        <div className="verification-result" aria-live="polite">
          {state === "loading" && <p className="verification-message">Consultando o registro oficial...</p>}
          {state === "not-found" && <div className="verification-invalid" role="status"><b>Certificado não encontrado</b><p>Confira o código informado. Nenhum certificado válido corresponde a ele.</p></div>}
          {state === "error" && <div className="form-error" role="alert">Não foi possível consultar o certificado agora. Tente novamente.</div>}
          {state === "valid" && certificate && (
            <div className="verification-valid" role="status">
              <div className="verification-seal" aria-hidden="true">✓</div>
              <div>
                <b>Certificado válido</b>
                <p>Este certificado consta no registro oficial da plataforma.</p>
              </div>
              <dl>
                <div><dt>Aluno</dt><dd>{certificate.studentName}</dd></div>
                <div><dt>Curso</dt><dd>{certificate.courseTitle}</dd></div>
                <div><dt>Emitido em</dt><dd>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(certificate.issuedAt))}</dd></div>
                <div><dt>Código</dt><dd><code>{certificate.code}</code></dd></div>
              </dl>
            </div>
          )}
        </div>

        <Link className="auth-back" href="/login">← Voltar para o login</Link>
      </section>
    </main>
  );
}
