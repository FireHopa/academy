"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

export default function InvitePage(){
  const router=useRouter(); const [token,setToken]=useState("");const [name,setName]=useState("");const [email,setEmail]=useState("");const [validating,setValidating]=useState(true);const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  useEffect(()=>{const value=new URLSearchParams(window.location.search).get("token")||"";setToken(value);if(!value){setError("Convite inválido");setValidating(false);return;}apiFetch<{valid:true;user:{name:string;email:string}}>("/auth/token/validate",{method:"POST",body:JSON.stringify({token:value,type:"INVITE"})}).then(r=>{setName(r.user.name);setEmail(r.user.email)}).catch(e=>setError(e instanceof Error?e.message:"Convite inválido ou expirado")).finally(()=>setValidating(false));},[]);
  async function submit(e:FormEvent){e.preventDefault();setError("");if(password!==confirm){setError("As senhas não coincidem");return;}setLoading(true);try{await apiFetch("/auth/accept-invite",{method:"POST",body:JSON.stringify({token,password})});router.replace("/onboarding");router.refresh();}catch(err){setError(err instanceof Error?err.message:"Não foi possível aceitar o convite");}finally{setLoading(false)}}
  return <main className="login-shell"><div className="login-card"><BrandLogo className="auth-brand-logo" height={142}/><h1>Ativar sua conta</h1>{validating?<p>Validando convite...</p>:error&&!name?<div className="form-error">{error}</div>:<><p>Olá, <b>{name}</b>. Confirme sua conta <strong>{email}</strong> criando uma senha.</p><form className="auth-stack" onSubmit={submit}><label className="field"><span>Crie sua senha</span><input required minLength={10} maxLength={120} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="field"><span>Repita a senha</span><input required minLength={10} maxLength={120} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>{error&&<div className="form-error">{error}</div>}<button className="btn btn-primary full" disabled={loading}>{loading?"Ativando...":"Ativar minha conta"}</button></form></>}</div></main>;
}
