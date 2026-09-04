"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountLayout } from "@/components/account-layout";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";

type Cert = { id: string; code: string; issuedAt: string; course: { title: string; certificateTitle?: string | null; cardImageUrl?: string | null } };

export default function CertificatesPage() {
  const [items, setItems] = useState<Cert[] | null>(null);
  const [error, setError] = useState("");
  function load() { setError(""); apiFetch<{ certificates: Cert[] }>("/experience/certificates").then(result => setItems(result.certificates)).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar os certificados")); }
  useEffect(() => { load(); }, []);

  return <AccountLayout active="certificates" eyebrow="Suas conquistas" title="Meus certificados" description="Seus certificados são emitidos automaticamente quando você conclui todas as aulas publicadas de um curso.">
    <div className="certificate-grid account-certificate-grid">
      {items?.map(item => <Link className="certificate-card" href={"/certificate/" + item.code} key={item.id}><div className="certificate-seal">✓</div><small>Casa do Ads</small><h3><GoogleText>{item.course.certificateTitle || item.course.title}</GoogleText></h3><span>Emitido em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(item.issuedAt))}</span><code>{item.code}</code></Link>)}
      {items && items.length === 0 && <div className="empty-block">Você ainda não possui certificados. Continue seus cursos para liberar sua primeira conquista.</div>}
      {!items && !error && <div className="empty-block">Carregando certificados...</div>}
      {error && <div className="empty-block"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={load}>Tentar novamente</button></div>}
    </div>
  </AccountLayout>;
}
