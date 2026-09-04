"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("next") || "";
    setNextPath(requested.startsWith("/") && !requested.startsWith("//") ? requested : "");
    apiFetch<{ user: { role: string; onboardingCompleted: boolean } }>("/auth/me").then(({ user }) => {
      router.replace(user.role === "ADMIN" ? "/admin" : (!user.onboardingCompleted ? "/onboarding" : "/browse"));
    }).catch(() => {});
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const { user } = await apiFetch<{ user: { role: string; onboardingCompleted: boolean } }>("/auth/login", {
        method: "POST", body: JSON.stringify({ email, password }),
      });
      router.replace(user.role === "ADMIN" ? "/admin" : (!user.onboardingCompleted ? "/onboarding" : (nextPath || "/browse")));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar");
    } finally { setLoading(false); }
  }

  return (
    <main className="login-shell login-shell-main">
      <div className="login-background-art" aria-hidden="true" />
      <form className="login-card" onSubmit={submit}>
        <BrandLogo className="auth-brand-logo" height={142}/>
        <h1>Entrar</h1>
        <p>Acesse sua biblioteca ou o painel administrativo.</p>
        <label className="field"><span>E-mail</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" /></label>
        <label className="field"><span>Senha</span><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="auth-helper"><a href="/forgot-password">Esqueci minha senha</a></div>
        <button disabled={loading} className="btn btn-primary full" type="submit">{loading ? "Entrando..." : "Entrar na plataforma"}</button>
        <Link className="auth-public-link" href="/verify-certificate">Validar um certificado</Link>
        <nav className="auth-legal-links" aria-label="Documentos legais">
          <Link href="/termos">Termos de Uso</Link>
          <span aria-hidden="true">•</span>
          <Link href="/privacidade">Política de Privacidade</Link>
        </nav>
      </form>
    </main>
  );
}
