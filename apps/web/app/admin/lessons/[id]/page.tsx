"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../../lib/api";
import { SortableHandle, SortableList } from "../../../../components/admin/sortable-list";
import { GoogleText } from "../../../../components/google-text";

type Chapter = { id:string; title:string; startSec:number };
type Material = { id:string; title:string; type:"PDF"|"LINK"|"CHECKLIST"|"SPREADSHEET"|"PROMPT"|"FILE"; url:string };
type LessonContent = {
  id:string; title:string; description?:string|null; durationSec?:number|null; published:boolean; videoStatus:string;
  module:{id:string;title:string;course:{id:string;title:string;slug:string}};
  chapters:Chapter[]; materials:Material[]; transcript?:{content:string;language:string}|null;
};

function parseTime(value:string) {
  const parts=value.trim().split(":").map(Number);
  if(parts.some(Number.isNaN)) return 0;
  if(parts.length===1) return Math.max(0,parts[0]);
  if(parts.length===2) return Math.max(0,parts[0]*60+parts[1]);
  return Math.max(0,parts[0]*3600+parts[1]*60+parts[2]);
}
function formatTime(total:number){
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
}
function materialTypeLabel(type:Material["type"]){
  return ({PDF:"PDF",LINK:"Link",CHECKLIST:"Checklist",SPREADSHEET:"Planilha",PROMPT:"Prompt",FILE:"Arquivo"})[type];
}

export default function LessonContentEditor({params}:{params:Promise<{id:string}>}){
  const {id}=use(params);
  const [lesson,setLesson]=useState<LessonContent|null>(null);
  const [description,setDescription]=useState("");
  const [chapters,setChapters]=useState<Chapter[]>([]);
  const [materials,setMaterials]=useState<Material[]>([]);
  const [transcript,setTranscript]=useState("");
  const [language,setLanguage]=useState("pt-BR");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);

  const load=()=>apiFetch<LessonContent>(`/admin/lessons/${id}/content`).then(data=>{
    setLesson(data);setDescription(data.description||"");setChapters(data.chapters.map(c=>({id:c.id||crypto.randomUUID(),title:c.title,startSec:c.startSec})));setMaterials(data.materials.map(m=>({id:m.id||crypto.randomUUID(),title:m.title,type:m.type,url:m.url})));setTranscript(data.transcript?.content||"");setLanguage(data.transcript?.language||"pt-BR");
  }).catch(e=>setError(e.message));
  useEffect(()=>{load();},[id]);

  const transcriptWords=useMemo(()=>transcript.trim()?transcript.trim().split(/\s+/).length:0,[transcript]);

  async function save(e:FormEvent){
    e.preventDefault();setSaving(true);setError("");setSaved(false);
    try{
      await apiFetch(`/admin/lessons/${id}/content`,{method:"PUT",body:JSON.stringify({description,chapters:chapters.map(({title,startSec})=>({title,startSec})),materials:materials.map(({title,type,url})=>({title,type,url})),transcript,transcriptLanguage:language})});
      setSaved(true);await load();
    }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar aula");}finally{setSaving(false);}
  }
  function addChapter(){setChapters([...chapters,{id:crypto.randomUUID(),title:"Novo capítulo",startSec:chapters.length?chapters[chapters.length-1].startSec+60:0}]);}
  function addMaterial(){setMaterials([...materials,{id:crypto.randomUUID(),title:"Material complementar",type:"PDF",url:""}]);}

  if(!lesson)return <p>{error||"Carregando aula..."}</p>;
  return <>
    <div className="editor-head"><div><Link className="back-link" href={`/admin/courses/${lesson.module.course.id}`}>← <GoogleText>{lesson.module.course.title}</GoogleText></Link><div className="eyebrow">Editar aula</div><h1><GoogleText>{lesson.title}</GoogleText></h1><p><GoogleText>{lesson.module.title}</GoogleText> · {lesson.videoStatus==="READY"?"vídeo DRM pronto":"vídeo em preparação"}</p></div><button className="btn btn-primary" onClick={()=>(document.getElementById("lesson-content-form") as HTMLFormElement | null)?.requestSubmit()} disabled={saving}>{saving?"Salvando...":"Salvar aula"}</button></div>
    {error&&<div className="form-error">{error}</div>}{saved&&<div className="form-success">Aula salva.</div>}
    <div className="lesson-editor-layout">
      <form id="lesson-content-form" className="lesson-content-admin" onSubmit={save}>
        <section className="editor-card"><div className="section-head"><div><h2>Descrição da aula</h2><p>Texto exibido abaixo do player.</p></div></div><textarea className="big-textarea" rows={5} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Explique o objetivo e o que o aluno vai aprender nesta aula."/></section>

        <section className="editor-card"><div className="section-head"><div><h2>Capítulos do vídeo</h2><p>Permitem navegar diretamente para cada assunto.</p></div><button className="btn btn-secondary" type="button" onClick={addChapter}>＋ Capítulo</button></div>
          <div className="content-editor-list"><SortableList items={chapters} getId={chapter=>chapter.id} getLabel={chapter=>`Capítulo ${chapter.title}`} onReorder={setChapters} renderItem={(chapter,index,sort)=><div {...sort.itemProps} className={`content-editor-row chapter-admin-row ${sort.stateClassName}`.trim()} key={chapter.id}><div className="drag-cell"><SortableHandle label={`capítulo ${chapter.title}`} {...sort.handleProps}/><span className="drag-index">{index+1}</span></div><input value={chapter.title} onChange={e=>setChapters(chapters.map((c,i)=>i===index?{...c,title:e.target.value}:c))}/><input className="time-input" value={formatTime(chapter.startSec)} onChange={e=>setChapters(chapters.map((c,i)=>i===index?{...c,startSec:parseTime(e.target.value)}:c))}/><button type="button" className="danger-link" onClick={()=>setChapters(chapters.filter((_,i)=>i!==index))}>Excluir</button></div>}/>{!chapters.length&&<div className="empty-inline">Sem capítulos. Você pode adicionar depois que o vídeo estiver finalizado.</div>}</div>
        </section>

        <section className="editor-card"><div className="section-head"><div><h2>Materiais complementares</h2><p>PDFs, planilhas, prompts, checklists ou links. A URL pode apontar para R2/S3 quando conectarmos o storage.</p></div><button className="btn btn-secondary" type="button" onClick={addMaterial}>＋ Material</button></div>
          <div className="content-editor-list"><SortableList items={materials} getId={material=>material.id} getLabel={material=>`Material ${material.title}`} onReorder={setMaterials} renderItem={(material,index,sort)=><div {...sort.itemProps} className={`content-editor-row material-admin-row ${sort.stateClassName}`.trim()} key={material.id}><div className="drag-cell"><SortableHandle label={`material ${material.title}`} {...sort.handleProps}/><span className="drag-index">{index+1}</span></div><input value={material.title} onChange={e=>setMaterials(materials.map((m,i)=>i===index?{...m,title:e.target.value}:m))}/><select value={material.type} onChange={e=>setMaterials(materials.map((m,i)=>i===index?{...m,type:e.target.value as Material["type"]}:m))}><option value="PDF">PDF</option><option value="CHECKLIST">Checklist</option><option value="SPREADSHEET">Planilha</option><option value="PROMPT">Prompt</option><option value="LINK">Link</option><option value="FILE">Arquivo</option></select><input className="material-url" value={material.url} onChange={e=>setMaterials(materials.map((m,i)=>i===index?{...m,url:e.target.value}:m))} placeholder="https://..."/><button type="button" className="danger-link" onClick={()=>setMaterials(materials.filter((_,i)=>i!==index))}>Excluir</button></div>}/>{!materials.length&&<div className="empty-inline">Nenhum material cadastrado.</div>}</div>
        </section>

        <section className="editor-card"><div className="section-head"><div><h2>Transcrição</h2><p>Base pesquisável da aula e futura fonte para a IA.</p></div><div className="transcript-meta"><span>{transcriptWords.toLocaleString("pt-BR")} palavras</span><input value={language} onChange={e=>setLanguage(e.target.value)} aria-label="Idioma da transcrição"/></div></div><textarea className="transcript-admin-textarea" value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Cole aqui a transcrição completa da aula..."/></section>
      </form>

      <aside className="lesson-student-preview" aria-label="Prévia da aula para o aluno">
        <div className="student-preview-head"><div><span>PRÉVIA DO ALUNO</span><strong>Atualização em tempo real</strong></div><i/></div>
        <div className="student-preview-screen">
          <div className="student-preview-video"><span>▶</span><small>{lesson.videoStatus==="READY"?"Vídeo disponível":"Vídeo em preparação"}</small></div>
          <div className="student-preview-body">
            <small><GoogleText>{lesson.module.course.title}</GoogleText> · <GoogleText>{lesson.module.title}</GoogleText></small>
            <h2><GoogleText>{lesson.title}</GoogleText></h2>
            <p><GoogleText>{description.trim()||"A descrição da aula aparecerá aqui para o aluno."}</GoogleText></p>
            <div className="student-preview-tabs"><span className={chapters.length?"active":""}>Capítulos {chapters.length}</span><span className={materials.length?"active":""}>Materiais {materials.length}</span><span className={transcript.trim()?"active":""}>Transcrição</span></div>
            {chapters.length>0&&<div className="student-preview-list">{chapters.slice(0,4).map(chapter=><div key={chapter.id}><time>{formatTime(chapter.startSec)}</time><b><GoogleText>{chapter.title||"Capítulo sem título"}</GoogleText></b></div>)}</div>}
            {materials.length>0&&<div className="student-preview-materials">{materials.slice(0,4).map(material=><div key={material.id}><span>{materialTypeLabel(material.type)}</span><b><GoogleText>{material.title||"Material sem título"}</GoogleText></b></div>)}</div>}
            {!chapters.length&&!materials.length&&!transcript.trim()&&<div className="student-preview-empty">Os capítulos, materiais e a transcrição aparecerão nesta área.</div>}
          </div>
        </div>
      </aside>
    </div>
  </>;
}
