"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExperienceCourseCard } from "@/components/experience-course-card";
import { apiFetch } from "@/lib/api";
import { GoogleText } from "@/components/google-text";
import type { ExperienceCourse } from "@/lib/experience";
import { FEATURES } from "@/lib/features";

type CatalogData = {
  query: string;
  category: string;
  categories: Array<{ id: string; name: string; slug: string }>;
  courses: ExperienceCourse[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasMore: boolean;
};

export function CatalogClient({ initialQuery, initialCategory, initialPage }: { initialQuery: string; initialCategory: string; initialPage: number }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const activeCategory = FEATURES.categoriesAndPaths ? initialCategory : "";

  useEffect(() => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("q", initialQuery);
    if (activeCategory) params.set("category", activeCategory);
    if (initialPage > 1) params.set("page", String(initialPage));
    setData(null);
    setError("");
    apiFetch<CatalogData>(`/experience/catalog${params.size ? `?${params}` : ""}`).then(setData).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao buscar cursos"));
  }, [initialQuery, activeCategory, initialPage, attempt]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (activeCategory) params.set("category", activeCategory);
    router.push(`/catalog${params.size ? `?${params}` : ""}`);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams();
    if (initialQuery) params.set("q", initialQuery);
    if (activeCategory) params.set("category", activeCategory);
    if (page > 1) params.set("page", String(page));
    router.push(`/catalog${params.size ? `?${params}` : ""}`);
  }

  return (
    <main>
      <section className="standard-head catalog-head"><div className="eyebrow">Explore</div><h1>Catálogo</h1><form onSubmit={submit} className="catalog-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Busque por curso ou assunto"/><button className="btn btn-primary">Buscar</button></form></section>
      <section className="standard-content">
      {FEATURES.categoriesAndPaths && <div className="filter-chips"><button onClick={() => router.push(initialQuery ? `/catalog?q=${encodeURIComponent(initialQuery)}` : "/catalog")} className={!activeCategory ? "active" : ""}>Todos</button>{data?.categories.map(category => <button key={category.id} className={activeCategory === category.slug ? "active" : ""} onClick={() => { const params = new URLSearchParams(); if (initialQuery) params.set("q", initialQuery); params.set("category", category.slug); router.push(`/catalog?${params}`); }}><GoogleText>{category.name}</GoogleText></button>)}</div>}
        {error ? <div className="state-page compact"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div> : data ? <><div className="result-line">{data.total} {data.total === 1 ? "resultado" : "resultados"}{initialQuery ? ` para “${initialQuery}”` : ""}</div><div className="catalog-grid">{data.courses.map(course => <ExperienceCourseCard key={course.id} course={course} />)}</div>{!data.courses.length && <div className="empty-block">Nenhum curso encontrado. Tente outro termo.</div>}{data.pages > 1 && <nav className="pagination" aria-label="Paginação do catálogo"><button className="btn btn-secondary" type="button" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>← Anterior</button><span>Página {data.page} de {data.pages}</span><button className="btn btn-secondary" type="button" disabled={!data.hasMore} onClick={() => goToPage(data.page + 1)}>Próxima →</button></nav>}</> : <div className="state-page compact">Buscando cursos...</div>}
      </section>
    </main>
  );
}
