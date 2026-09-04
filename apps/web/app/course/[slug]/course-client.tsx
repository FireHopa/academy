"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDuration } from "@/lib/experience";
import { contentBackgroundImage } from "@/lib/placeholders";
import { GoogleText } from "@/components/google-text";
import { FEATURES } from "@/lib/features";

type CourseDetail = {
  id:string; slug:string; title:string; description?:string|null; shortDescription?:string|null; heroImageUrl?:string|null; favorite:boolean; enrolled:boolean; progressPercent:number; completedLessons:number; totalLessons:number; nextLessonId?:string|null; durationSec:number; certificateEnabled:boolean; certificate?:{code:string;issuedAt:string}|null; categories:Array<{id:string;name:string;slug:string}>;
  modules:Array<{id:string;title:string;position:number;lessons:Array<{id:string;title:string;description?:string|null;durationSec?:number|null;preview:boolean;videoStatus:string;completed:boolean;positionSec:number}>}>;
};
export function CourseClient({ slug }: { slug: string }) {
  const [course,setCourse]=useState<CourseDetail|null>(null);
  const [favorite,setFavorite]=useState(false);
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{ setError("");setCourse(null);apiFetch<CourseDetail>(`/experience/courses/${slug}`).then(data=>{setCourse(data);setFavorite(data.favorite);}).catch(cause=>setError(cause instanceof Error?cause.message:"Falha ao carregar o curso")); },[slug,attempt]);
  if(error) return <main><div className="state-page"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={()=>setAttempt(value=>value+1)}>Tentar novamente</button></div></main>;
  if(!course) return <main><div className="state-page">Carregando curso...</div></main>;
  const heroStyle={backgroundImage:contentBackgroundImage(course.heroImageUrl,course.id||course.slug,["linear-gradient(90deg,rgba(0,0,0,.96),rgba(0,0,0,.42))","linear-gradient(0deg,#090909,transparent 44%)"])};
  async function toggle(){ if(!course)return; if(favorite) await apiFetch(`/experience/favorites/${course.id}`,{method:"DELETE"}); else await apiFetch(`/experience/favorites/${course.id}`,{method:"POST"}); setFavorite(!favorite); }
  const courseLabel = FEATURES.categoriesAndPaths ? course.categories.map(c=>c.name).join(" · ")||"Curso" : "Curso";
  return <main><section className="course-hero experience-course-hero" style={heroStyle}><div className="hero-content"><div className="eyebrow"><GoogleText>{courseLabel}</GoogleText></div><h1><GoogleText>{course.title}</GoogleText></h1><p><GoogleText>{course.shortDescription||course.description}</GoogleText></p><div className="hero-facts"><span>{course.totalLessons} aulas</span>{course.durationSec>0&&<span>{formatDuration(course.durationSec)}</span>}{course.enrolled&&<span>{course.progressPercent}% concluído</span>}</div><div className="actions">{course.enrolled&&course.nextLessonId?<Link className="btn btn-primary" href={`/watch/${course.nextLessonId}`}>▶ {course.progressPercent?"Continuar curso":"Começar curso"}</Link>:<button className="btn btn-primary" disabled>Curso não liberado</button>}<button className="btn btn-secondary" onClick={toggle}>{favorite?"✓ Na minha lista":"＋ Minha lista"}</button></div></div></section><section className="course-wrap"><div className="course-grid"><div>{course.modules.map((module,moduleIndex)=><div className="module" key={module.id}><h3>Módulo {String(moduleIndex+1).padStart(2,"0")} · <GoogleText>{module.title}</GoogleText></h3>{module.lessons.map((lesson,index)=><Link href={course.enrolled||lesson.preview?`/watch/${lesson.id}`:"#"} className={`lesson ${lesson.completed?"completed":""}`} key={lesson.id}><span className="lesson-num">{lesson.completed?"✓":String(index+1).padStart(2,"0")}</span><div className="lesson-main"><strong><GoogleText>{lesson.title}</GoogleText></strong><span>{lesson.videoStatus==="READY"?"Vídeo protegido disponível":"Conteúdo em preparação"}{lesson.positionSec>0&&!lesson.completed?` · parou em ${Math.floor(lesson.positionSec/60)} min`:""}</span></div><span className="lesson-time">{lesson.durationSec?formatDuration(lesson.durationSec):""}</span></Link>)}</div>)}</div><aside className="side-card"><div className="eyebrow">Seu progresso</div><h3>{course.progressPercent}% concluído</h3><div className="progress-track"><div className="progress-fill" style={{width:`${course.progressPercent}%`}}/></div><p style={{color:"#888",fontSize:13}}>{course.completedLessons} de {course.totalLessons} aulas concluídas</p><hr style={{border:0,borderTop:"1px solid var(--border)",margin:"20px 0"}}/><p style={{color:"#aaa",lineHeight:1.6}}><GoogleText>{course.description}</GoogleText></p>{course.certificate&&<Link className="btn btn-primary certificate-course-link" href={`/certificate/${course.certificate.code}`}>Ver certificado</Link>}{course.certificateEnabled&&!course.certificate&&course.enrolled&&<div className="certificate-pending">Certificado liberado ao concluir 100% do curso.</div>}</aside></div></section></main>;
}
