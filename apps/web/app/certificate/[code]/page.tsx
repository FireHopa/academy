"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";

type Certificate = {
  code: string;
  issuedAt: string;
  user: { name: string };
  course: { title: string; certificateTitle?: string | null; slug: string };
};

export default function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [item, setItem] = useState<Certificate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Certificate>(`/experience/certificates/${code}`).then(setItem).catch(cause => setError(cause.message));
  }, [code]);

  if (!item) return <main className="certificate-page"><div className="certificate-loading">{error || "Carregando certificado..."}</div></main>;

  return <main className="certificate-page">
    <div className="certificate-actions no-print">
      <Link href="/account/certificates">← Meus certificados</Link>
      <div>
        <Link className="btn btn-secondary" href={`/verify-certificate/${item.code}`}>Validar publicamente</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>Imprimir / salvar em PDF</button>
      </div>
    </div>
    <section className="certificate-document">
      <BrandLogo className="certificate-brand-logo" height={96} />
      <div className="certificate-kicker">CERTIFICADO DE CONCLUSÃO</div>
      <h1>Certificamos que</h1>
      <h2>{item.user.name}</h2>
      <p>concluiu integralmente o curso</p>
      <h3><GoogleText>{item.course.certificateTitle || item.course.title}</GoogleText></h3>
      <div className="certificate-rule" />
      <div className="certificate-footer">
        <div><span>Emitido em</span><b>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(item.issuedAt))}</b></div>
        <div><span>Código de autenticidade</span><b>{item.code}</b></div>
      </div>
    </section>
  </main>;
}
