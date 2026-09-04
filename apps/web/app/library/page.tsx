"use client";

import { useEffect, useState } from "react";
import { ExperienceCourseCard } from "@/components/experience-course-card";
import { apiFetch } from "@/lib/api";
import type { ExperienceCourse } from "@/lib/experience";

type LibraryData = {
  courses: ExperienceCourse[];
  favorites: ExperienceCourse[];
  total: number;
  favoriteTotal: number;
  page: number;
  limit: number;
  pages: number;
  favoritePage: number;
  favoritePages: number;
};

export default function LibraryPage() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  function load(page = 1, favoritePage = 1) {
    setError("");
    setLoading(true);
    apiFetch<LibraryData>(`/experience/library?page=${page}&favoritePage=${favoritePage}`).then(setData).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar a biblioteca")).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  if (error && !data) return <main><div className="state-page"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={() => load()}>Tentar novamente</button></div></main>;
  if (!data) return <main><div className="state-page">Carregando sua biblioteca...</div></main>;
  return (
    <main>
      <section className="standard-head"><div className="eyebrow">Seu espaço</div><h1>Minha biblioteca</h1><p>Continue exatamente de onde parou e acompanhe seu progresso.</p></section>
      <section className="standard-content">
        <div className="library-summary"><b>{data.total}</b><span>cursos liberados</span><b>{data.courses.filter(item => item.progressPercent === 100).length}</b><span>concluídos nesta página</span></div>
        {error && <div className="form-error">{error}</div>}
        <div className="catalog-grid">{data.courses.map(course => <ExperienceCourseCard key={course.id} course={course} />)}</div>
        {!data.courses.length && <div className="empty-block">Nenhum curso foi liberado para esta conta ainda.</div>}
        {data.pages > 1 && <nav className="pagination" aria-label="Paginação da biblioteca"><button className="btn btn-secondary" type="button" disabled={data.page <= 1 || loading} onClick={() => load(data.page - 1, data.favoritePage)}>← Anterior</button><span>Página {data.page} de {data.pages}</span><button className="btn btn-secondary" type="button" disabled={data.page >= data.pages || loading} onClick={() => load(data.page + 1, data.favoritePage)}>Próxima →</button></nav>}
        <div id="favoritos" className="section-head"><div><h2>Minha lista ({data.favoriteTotal})</h2><p>Cursos que você salvou para assistir depois.</p></div></div>
        <div className="catalog-grid">{data.favorites.map(course => <ExperienceCourseCard key={course.id} course={course} />)}</div>
        {!data.favorites.length && <div className="empty-block">Sua lista está vazia. Use o botão + nos cursos para salvar.</div>}
        {data.favoritePages > 1 && <nav className="pagination" aria-label="Paginação dos favoritos"><button className="btn btn-secondary" type="button" disabled={data.favoritePage <= 1 || loading} onClick={() => load(data.page, data.favoritePage - 1)}>← Anterior</button><span>Página {data.favoritePage} de {data.favoritePages}</span><button className="btn btn-secondary" type="button" disabled={data.favoritePage >= data.favoritePages || loading} onClick={() => load(data.page, data.favoritePage + 1)}>Próxima →</button></nav>}
      </section>
    </main>
  );
}
