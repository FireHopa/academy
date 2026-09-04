"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { AdminIcon } from "@/components/admin/admin-icon";
import { SortableHandle, SortableList } from "@/components/admin/sortable-list";
import { GoogleText } from "@/components/google-text";

type Category = { id:string; name:string; slug:string; _count?:{courses:number} };
type Course = { id:string; title:string; status:string; categories:Category[] };
type PathItem = { position:number; course:{id:string;title:string;slug:string;status:string} };
type LearningPath = { id:string; title:string; slug:string; description?:string|null; heroImageUrl?:string|null; published:boolean; position:number; courses:PathItem[] };

export default function OrganizationPage() {
  const [categories,setCategories]=useState<Category[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [paths,setPaths]=useState<LearningPath[]>([]);
  const [categoryName,setCategoryName]=useState("");
  const [pathTitle,setPathTitle]=useState("");
  const [pathDescription,setPathDescription]=useState("");
  const [error,setError]=useState("");
  const [editingPath,setEditingPath]=useState<string|null>(null);
  const [draftOrder,setDraftOrder]=useState<Record<string,string[]>>({});

  async function load(){
    try {
      const [cats,cs,ps]=await Promise.all([
        apiFetch<Category[]>("/admin/categories"),
        apiFetch<Course[]>("/admin/courses"),
        apiFetch<LearningPath[]>("/admin/paths"),
      ]);
      setCategories(cats); setCourses(cs); setPaths(ps);
      setDraftOrder(Object.fromEntries(ps.map(path=>[path.id,path.courses.map(item=>item.course.id)])));
    } catch(e){ setError(e instanceof Error?e.message:"Erro ao carregar"); }
  }
  useEffect(()=>{load();},[]);

  async function createCategory(e:FormEvent){ e.preventDefault(); if(!categoryName.trim())return; await apiFetch("/admin/categories",{method:"POST",body:JSON.stringify({name:categoryName})}); setCategoryName(""); await load(); }
  async function createPath(e:FormEvent){ e.preventDefault(); if(!pathTitle.trim())return; await apiFetch("/admin/paths",{method:"POST",body:JSON.stringify({title:pathTitle,description:pathDescription||undefined})}); setPathTitle("");setPathDescription("");await load(); }
  async function toggleCategory(course:Course,categoryId:string){ const ids=course.categories.map(c=>c.id); const next=ids.includes(categoryId)?ids.filter(id=>id!==categoryId):[...ids,categoryId]; await apiFetch(`/admin/courses/${course.id}/categories`,{method:"PUT",body:JSON.stringify({categoryIds:next})}); await load(); }
  async function togglePathPublish(path:LearningPath){ await apiFetch(`/admin/paths/${path.id}`,{method:"PATCH",body:JSON.stringify({published:!path.published})}); await load(); }
  async function renamePath(path:LearningPath){ const title=window.prompt("Nome da trilha",path.title)?.trim(); if(!title||title===path.title)return; await apiFetch(`/admin/paths/${path.id}`,{method:"PATCH",body:JSON.stringify({title})}); await load(); }
  async function deletePath(path:LearningPath){ if(!window.confirm(`Excluir a trilha “${path.title}”?`))return; await apiFetch(`/admin/paths/${path.id}`,{method:"DELETE"}); await load(); }
  function updatePathImage(pathId:string,heroImageUrl:string){ setPaths(current=>current.map(path=>path.id===pathId?{...path,heroImageUrl}:path)); }

  function toggleCourseInPath(pathId:string,courseId:string){ setDraftOrder(current=>{ const list=current[pathId]??[]; return {...current,[pathId]:list.includes(courseId)?list.filter(id=>id!==courseId):[...list,courseId]}; }); }
  function reorderPathCourses(pathId:string,courseIds:string[]){ setDraftOrder(current=>({...current,[pathId]:courseIds})); }
  async function savePathCourses(pathId:string){ const list=draftOrder[pathId]??[]; await apiFetch(`/admin/paths/${pathId}/courses`,{method:"PUT",body:JSON.stringify({items:list.map((courseId,index)=>({courseId,position:index+1}))})}); setEditingPath(null); await load(); }
  const courseMap=useMemo(()=>new Map(courses.map(c=>[c.id,c])),[courses]);

  return <>
    <div className="section-head top"><div><div className="eyebrow">Organização</div><h1 className="admin-title">Categorias e trilhas</h1><p>Organize a experiência que aparece para o aluno.</p></div></div>
    {error&&<div className="form-error">{error}</div>}

    <div className="organization-grid">
      <section className="editor-card">
        <div className="section-head"><div><h2>Categorias</h2><p>Geram as fileiras da Home e filtros do catálogo.</p></div></div>
        <form className="inline-form" onSubmit={createCategory}><input value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="Ex.: Mídia paga"/><button className="btn btn-primary">Criar categoria</button></form>
        <div className="category-list">{categories.map(category=><div className="category-row" key={category.id}><b><GoogleText>{category.name}</GoogleText></b><span>/{category.slug}</span><small>{category._count?.courses??0} cursos</small></div>)}</div>
      </section>

      <section className="editor-card">
        <div className="section-head"><div><h2>Associar cursos</h2><p>Clique nas categorias que cada curso deve ocupar.</p></div></div>
        <div className="course-category-list">{courses.map(course=><div className="course-category-row" key={course.id}><div><b><GoogleText>{course.title}</GoogleText></b><small>{course.status==="PUBLISHED"?"Publicado":"Rascunho"}</small></div><div className="tag-picker">{categories.map(category=><button type="button" key={category.id} className={course.categories.some(item=>item.id===category.id)?"active":""} onClick={()=>toggleCategory(course,category.id)}><GoogleText>{category.name}</GoogleText></button>)}</div></div>)}</div>
      </section>
    </div>

    <section className="editor-card">
      <div className="section-head"><div><h2>Trilhas de aprendizado</h2><p>Defina uma sequência intencional de cursos.</p></div></div>
      <form className="path-create-form" onSubmit={createPath}><input value={pathTitle} onChange={e=>setPathTitle(e.target.value)} placeholder="Nome da trilha"/><input value={pathDescription} onChange={e=>setPathDescription(e.target.value)} placeholder="Objetivo da trilha"/><button className="btn btn-primary">Criar trilha</button></form>
      <div className="admin-path-list">{paths.map(path=><div className="admin-path-card" key={path.id}>
        <div className="admin-path-head">
          <div><small>{path.published?"PUBLICADA":"RASCUNHO"}</small><h3><GoogleText>{path.title}</GoogleText></h3><p><GoogleText>{path.description}</GoogleText></p></div>
          <div className="path-head-actions">
            <button type="button" className={`path-visibility-toggle ${path.published?"is-visible":"is-hidden"}`} onClick={()=>togglePathPublish(path)} aria-label={path.published?"Ocultar trilha":"Publicar trilha"} title={path.published?"Trilha visível. Clique para ocultar.":"Trilha oculta. Clique para publicar."}><AdminIcon name={path.published?"eye":"eyeOff"} size={18}/></button>
            <div className="compact-actions"><button onClick={()=>renamePath(path)}>Renomear</button><button onClick={()=>setEditingPath(editingPath===path.id?null:path.id)}>Editar</button><button className="danger-link" onClick={()=>deletePath(path)}>Excluir</button></div>
          </div>
        </div>
        {editingPath===path.id&&<div className="path-editor">
          <ImageUploadField label="Banner da trilha" help="Recomendado: 1920 × 1080px, proporção 16:9." value={path.heroImageUrl} seed={`path-hero:${path.id}`} uploadPath={`/admin/paths/${path.id}/image`} directPreset="path-hero" onChange={url=>updatePathImage(path.id,url)} onExternalUrlSave={heroImageUrl=>apiFetch(`/admin/paths/${path.id}`,{method:"PATCH",body:JSON.stringify({heroImageUrl})})}/>
          <div className="path-order">
            <SortableList
              items={draftOrder[path.id]??[]}
              getId={courseId=>courseId}
              getLabel={courseId=>`Curso ${courseMap.get(courseId)?.title??"sem título"}`}
              onReorder={courseIds=>reorderPathCourses(path.id,courseIds)}
              renderItem={(courseId,index,sort)=>{const course=courseMap.get(courseId);return course?<div {...sort.itemProps} className={`path-order-row ${sort.stateClassName}`.trim()} key={courseId}><SortableHandle label={`curso ${course.title}`} {...sort.handleProps}/><span>{index+1}</span><b><GoogleText>{course.title}</GoogleText></b><button onClick={()=>toggleCourseInPath(path.id,courseId)}>Remover</button></div>:null;}}
            />
          </div>
          <div className="tag-picker available-courses">{courses.filter(c=>!(draftOrder[path.id]??[]).includes(c.id)).map(course=><button type="button" key={course.id} onClick={()=>toggleCourseInPath(path.id,course.id)}>＋ <GoogleText>{course.title}</GoogleText></button>)}</div>
          <button className="btn btn-primary" onClick={()=>savePathCourses(path.id)}>Salvar ordem da trilha</button>
        </div>}
      </div>)}</div>
    </section>
  </>;
}
