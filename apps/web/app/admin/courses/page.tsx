"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { contentBackgroundImage } from "../../../lib/placeholders";
import { GoogleText } from "../../../components/google-text";

type Course = { id:string; title:string; slug:string; status:string; updatedAt:string; cardImageUrl?:string|null; _count:{enrollments:number;modules:number}; modules:{_count:{lessons:number}}[] };

export default function CoursesPage(){
  const router=useRouter(); const [courses,setCourses]=useState<Course[]>([]); const [title,setTitle]=useState(""); const [desc,setDesc]=useState(""); const [creating,setCreating]=useState(false); const [open,setOpen]=useState(false); const [error,setError]=useState("");
  function load(){apiFetch<Course[]>("/admin/courses").then(setCourses).catch(e=>setError(e.message));}
  useEffect(load,[]);
  async function create(e:FormEvent){e.preventDefault();setCreating(true);setError("");try{const c=await apiFetch<{id:string}>("/admin/courses",{method:"POST",body:JSON.stringify({title,shortDescription:desc||undefined})});router.push(`/admin/courses/${c.id}`);}catch(e){setError(e instanceof Error?e.message:"Erro ao criar");}finally{setCreating(false);}}
  return <>
    <div className="section-head top"><div><div className="eyebrow">Conteúdo</div><h1 className="admin-title">Cursos</h1></div><button className="btn btn-primary" onClick={()=>setOpen(!open)}>＋ Novo curso</button></div>
    {error&&<div className="form-error">{error}</div>}
    {open&&<form className="create-panel" onSubmit={create}><div className="field"><span>Nome do curso</span><input required minLength={2} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Aquisição de clientes + IA" /></div><div className="field"><span>Descrição curta</span><input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Uma frase para apresentar o curso" /></div><div className="actions"><button className="btn btn-primary" disabled={creating}>{creating?"Criando...":"Criar e editar"}</button><button className="btn btn-secondary" type="button" onClick={()=>setOpen(false)}>Cancelar</button></div></form>}
    <div className="course-admin-grid">{courses.map(c=><Link href={`/admin/courses/${c.id}`} className="course-admin-card" key={c.id}><div className="course-admin-art" style={{backgroundImage:contentBackgroundImage(c.cardImageUrl,c.id,["linear-gradient(0deg,rgba(8,15,35,.52),rgba(8,15,35,.06))"])}}><span>{c.status === "PUBLISHED" ? "PUBLICADO" : "RASCUNHO"}</span></div><div className="course-admin-body"><h3><GoogleText>{c.title}</GoogleText></h3><p>/{c.slug}</p><div className="meta"><span>{c._count.modules} módulos</span><span>{c.modules.reduce((n,m)=>n+m._count.lessons,0)} aulas</span><span>{c._count.enrollments} alunos</span></div></div></Link>)}{!courses.length&&<div className="empty-panel">Você ainda não criou nenhum curso.</div>}</div>
  </>;
}
