"use client";

import { useEffect, useState } from "react";
import { ExperienceCourseCard } from "@/components/experience-course-card";
import { apiFetch } from "@/lib/api";
import type { ExperienceCourse } from "@/lib/experience";
import { contentBackgroundImage } from "@/lib/placeholders";
import { GoogleText } from "@/components/google-text";

type PathData = { id: string; slug: string; title: string; description?: string | null; heroImageUrl?: string | null; courses: ExperienceCourse[] };
export function PathClient({ slug }: { slug: string }) {
  const [data, setData] = useState<PathData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setError(""); setData(null); apiFetch<PathData>(`/experience/paths/${slug}`).then(setData).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar a trilha")); }, [slug, attempt]);
  if (error) return <main><div className="state-page"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div></main>;
  if (!data) return <main><div className="state-page">Carregando trilha...</div></main>;
  const completed = data.courses.filter(course => course.progressPercent === 100).length;
  return <main><section className="path-hero" style={{ backgroundImage:contentBackgroundImage(data.heroImageUrl,`path:${data.id}`,["linear-gradient(90deg,rgba(0,0,0,.95),rgba(0,0,0,.45))"]) }}><div><div className="eyebrow">Trilha de aprendizado</div><h1><GoogleText>{data.title}</GoogleText></h1><p><GoogleText>{data.description}</GoogleText></p><div className="hero-facts"><span>{data.courses.length} cursos</span><span>{completed} concluídos</span></div></div></section><section className="standard-content"><div className="path-sequence">{data.courses.map((course,index) => <div className="path-step" key={course.id}><div className="step-number">{String(index+1).padStart(2,"0")}</div><ExperienceCourseCard course={course}/></div>)}</div></section></main>;
}
