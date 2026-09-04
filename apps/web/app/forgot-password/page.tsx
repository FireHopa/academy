"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setDevUrl("");
    try {
      const result = await apiFetch<{ ok: true; devResetUrl?: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true); setDevUrl(result.devResetUrl || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível solicitar a recuperação"); }
    finally { setLoading(false); }
  }

  return <main className="login-shell"><div className="login-card">
    <BrandLogo className="auth-brand-logo" height={142}/>
    <h1>Recuperar senha</h1>
    {!sent ? <>
      <p>Informe seu e-mail. Se existir uma conta ativa, enviaremos um link temporário para criar uma nova senha.</p>
      <form onSubmit={submit} className="auth-stack">
        <label className="field"><span>E-mail</span><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com" /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary full" disabled={loading}>{loading ? "Enviando..." : "Enviar link de recuperação"}</button>
      </form>
    </> : <div className="auth-success"><b>Solicitação recebida</b><p>Se o e-mail estiver cadastrado e ativo, o link de recuperação será enviado. O link expira em 1 hora.</p>{devUrl && <a className="mini-link" href={devUrl}>Abrir link de desenvolvimento →</a>}</div>}
    <Link className="auth-back" href="/login">← Voltar para o login</Link>
  </div></main>;
}
