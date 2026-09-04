"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

export default function OnboardingPage(){
  const router=useRouter();const [name,setName]=useState("");const [accepted,setAccepted]=useState(false);const [error,setError]=useState("");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
  const terms=process.env.NEXT_PUBLIC_TERMS_URL||"/termos";const privacy=process.env.NEXT_PUBLIC_PRIVACY_URL||"/privacidade";
  useEffect(()=>{apiFetch<{user:{name:string;role:string;onboardingCompleted:boolean}}>("/auth/me").then(({user})=>{if(user.role==="ADMIN"){router.replace("/admin");return;}if(user.onboardingCompleted){router.replace("/browse");return;}setName(user.name)}).catch(()=>router.replace("/login")).finally(()=>setLoading(false));},[router]);
  async function finish(){if(!accepted){setError("Você precisa confirmar o aceite antes de continuar.");return;}setSaving(true);setError("");try{await apiFetch("/account/complete-onboarding",{method:"POST",body:JSON.stringify({acceptTerms:true})});router.replace("/browse");router.refresh();}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir o primeiro acesso");}finally{setSaving(false)}}
  if(loading)return <main className="login-shell"><div className="login-card"><p>Preparando sua conta...</p></div></main>;
  return <main className="onboarding-shell"><section className="onboarding-card"><BrandLogo className="onboarding-brand-logo" height={150}/><div className="eyebrow">Primeiro acesso</div><h1>Bem-vindo, {name}.</h1><p>Seu espaço de aprendizado já está pronto. Antes de entrar, veja como a plataforma funciona.</p><div className="onboarding-grid"><div><b>01</b><h3>Continue de onde parou</h3><p>Seu progresso e o ponto exato de cada aula ficam salvos.</p></div><div><b>02</b><h3>Biblioteca de cursos</h3><p>Acesse seus cursos e mantenha os favoritos sempre à mão.</p></div><div><b>03</b><h3>Conteúdo protegido</h3><p>Reprodução vinculada à sua conta e aos dispositivos autorizados.</p></div></div><label className="terms-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Li e aceito os {terms?<a target="_blank" rel="noreferrer" href={terms}>Termos de Uso</a>:"Termos de Uso"} e a {privacy?<a target="_blank" rel="noreferrer" href={privacy}>Política de Privacidade</a>:"Política de Privacidade"} aplicáveis à plataforma.</span></label>{error&&<div className="form-error">{error}</div>}<button className="btn btn-primary" disabled={saving||!accepted} onClick={()=>void finish()}>{saving?"Concluindo...":"Entrar na plataforma"}</button></section></main>;
}
