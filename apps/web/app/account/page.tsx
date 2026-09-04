"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountLayout } from "@/components/account-layout";
import { StudentIcon } from "@/components/student-icon";
import { apiFetch } from "@/lib/api";

type Cert = { id: string; code: string; issuedAt: string; course: { title: string } };

export default function AccountPage() {
  const [certs, setCerts] = useState<Cert[]>([]);
  useEffect(() => { apiFetch<{ certificates: Cert[] }>("/experience/certificates").then(result => setCerts(result.certificates)).catch(() => undefined); }, []);
  const certificateText = certs.length ? certs.length + " certificado" + (certs.length > 1 ? "s" : "") + " emitido" + (certs.length > 1 ? "s" : "") + "." : "Conclua um curso para receber seu primeiro certificado.";

  return <AccountLayout active="overview" eyebrow="Sua conta" title="Configurações da conta" description="Gerencie seu perfil, acessos e preferências em um só lugar.">
    <section className="account-overview-status">
      <span><StudentIcon name="check" size={19}/></span>
      <div><strong>Conta ativa</strong><p>Seu acesso está funcionando normalmente.</p></div>
      <Link href="/library">Ir para minha biblioteca<StudentIcon name="chevron" size={16}/></Link>
    </section>
    <div className="account-section-title"><div><h2>Acesso rápido</h2><p>Escolha o que deseja gerenciar.</p></div></div>
    <div className="account-overview-grid">
      <Link className="account-action-card featured" href="/account/profile"><span><StudentIcon name="profile"/></span><div><h3>Perfil e avatar</h3><p>Altere seu nome, escolha um avatar ou envie sua foto.</p></div><StudentIcon name="chevron" size={18}/></Link>
      <Link className="account-action-card" href="/account/security"><span><StudentIcon name="security"/></span><div><h3>Segurança e dispositivos</h3><p>Controle aparelhos autorizados e reproduções ativas.</p></div><StudentIcon name="chevron" size={18}/></Link>
      <Link className="account-action-card" href="/account/certificates"><span><StudentIcon name="certificate"/></span><div><h3>Meus certificados</h3><p>{certificateText}</p></div><StudentIcon name="chevron" size={18}/></Link>
      <Link className="account-action-card" href="/history"><span><StudentIcon name="history"/></span><div><h3>Histórico de aulas</h3><p>Retome rapidamente os conteúdos que você estava assistindo.</p></div><StudentIcon name="chevron" size={18}/></Link>
    </div>
  </AccountLayout>;
}
