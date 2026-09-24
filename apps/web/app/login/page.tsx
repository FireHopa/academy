"use client";

import { FormEvent, PointerEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  }

  return (
    <main className="login-shell login-shell-main" onPointerMove={handlePointerMove}>
      <section className="login-hero" aria-label="A nova era de aquisição de clientes por Inteligência Artificial">
        <div className="login-hero-effects" aria-hidden="true">
          <span className="login-orbit login-orbit-a" />
          <span className="login-orbit login-orbit-b" />
          <span className="login-orbit login-orbit-c" />
          <span className="login-particle-field" />
          <span className="login-ambient login-ambient-a" />
          <span className="login-ambient login-ambient-b" />
          <span className="login-scan-line" />
        </div>

        <div className="login-hero-content">
          <div className="login-hero-copy">
            <p className="login-hero-kicker">A nova era de</p>
            <h2>
              <span>aquisição de</span>
              <strong data-text="clientes">clientes</strong>
            </h2>
            <div className="login-ai-badge">
              <span className="login-ai-icon" aria-hidden="true">
                <span className="login-ai-head" />
                <span className="login-ai-body" />
                <span className="login-ai-spark">✦</span>
              </span>
              <span className="login-ai-copy"><span>por</span> <b>Inteligência Artificial</b></span>
            </div>
          </div>
        </div>

        <div className="login-hero-shade" aria-hidden="true" />
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <BrandLogo className="auth-brand-logo" height={122}/>

          <div className="login-card-heading">
            <h1>Entrar</h1>
            <p>Acesse sua biblioteca ou o painel administrativo.</p>
          </div>

          <label className="field auth-field">
            <span>E-mail</span>
            <div className="auth-input-wrap">
              <svg className="auth-input-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6.5h16v11H4z" />
                <path d="m4.7 7.3 7.3 5.5 7.3-5.5" />
              </svg>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" />
            </div>
          </label>

          <label className="field auth-field">
            <span>Senha</span>
            <div className="auth-input-wrap auth-password-wrap">
              <svg className="auth-input-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>

          <div className="auth-helper"><a href="/forgot-password">Esqueci minha senha</a></div>
          {error && <div className="form-error">{error}</div>}

          <button disabled={loading} className="btn auth-submit full" type="submit">
            {loading ? "Entrando..." : "Entrar na plataforma"}
          </button>

          <div className="auth-divider"><span>ou</span></div>
          <Link className="auth-public-link" href="/verify-certificate">Validar um certificado</Link>

          <nav className="auth-legal-links" aria-label="Documentos legais">
            <Link href="/termos">Termos de Uso</Link>
            <span aria-hidden="true">•</span>
            <Link href="/privacidade">Política de Privacidade</Link>
          </nav>
        </form>
      </section>
    </main>
  );
}
