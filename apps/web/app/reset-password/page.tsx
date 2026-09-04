"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

export default function ResetPasswordPage() {
  const [token,setToken]=useState(""); const [name,setName]=useState(""); const [validating,setValidating]=useState(true);
  const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [error,setError]=useState(""); const [done,setDone]=useState(false); const [loading,setLoading]=useState(false);
  useEffect(()=>{ const value=new URLSearchParams(window.location.search).get("token")||""; setToken(value); if(!value){setError("Link de recuperação inválido");setValidating(false);return;} apiFetch<{valid:true;user:{name:string}}>("/auth/token/validate",{method:"POST",body:JSON.stringify({token:value,type:"PASSWORD_RESET"})}).then(r=>setName(r.user.name)).catch(e=>setError(e instanceof Error?e.message:"Link inválido ou expirado")).finally(()=>setValidating(false)); },[]);
  async function submit(e:FormEvent){e.preventDefault();setError("");if(password!==confirm){setError("As senhas não coincidem");return;}setLoading(true);try{await apiFetch("/auth/reset-password",{method:"POST",body:JSON.stringify({token,password})});setDone(true);}catch(err){setError(err instanceof Error?err.message:"Não foi possível redefinir a senha");}finally{setLoading(false)}}
  return <main className="login-shell"><div className="login-card"><BrandLogo className="auth-brand-logo" height={142}/><h1>Nova senha</h1>
    {validating ? <p>Validando seu link...</p> : done ? <div className="auth-success"><b>Senha alterada</b><p>Sua senha foi atualizada e as sessões antigas foram invalidadas.</p><Link className="btn btn-primary full" href="/login">Entrar novamente</Link></div> : error && !token ? <div className="form-error">{error}</div> : <><p>{name ? `${name}, crie uma nova senha para sua conta.` : "Crie uma nova senha para sua conta."}</p><form className="auth-stack" onSubmit={submit}><label className="field"><span>Nova senha</span><input required minLength={10} maxLength={120} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} /></label><label className="field"><span>Confirmar senha</span><input required minLength={10} maxLength={120} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>{error&&<div className="form-error">{error}</div>}<button className="btn btn-primary full" disabled={loading}>{loading?"Salvando...":"Salvar nova senha"}</button></form></>}
    {!done&&<Link className="auth-back" href="/login">← Voltar para o login</Link>}
  </div></main>;
}
