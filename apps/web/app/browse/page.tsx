"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExperienceRow } from "@/components/experience-row";
import { PathCard } from "@/components/path-card";
import { apiFetch } from "@/lib/api";
import type { ExperienceCourse, LearningPathCard } from "@/lib/experience";
import { contentBackgroundImage } from "@/lib/placeholders";
import { GoogleText } from "@/components/google-text";
import { FEATURES } from "@/lib/features";

type HomeData = {
  featured: ExperienceCourse | null;
  continueWatching: ExperienceCourse[];
  myList: ExperienceCourse[];
  library: ExperienceCourse[];
  categoryRows: Array<{ id: string; name: string; slug: string; courses: ExperienceCourse[] }>;
  paths: LearningPathCard[];
};

export default function BrowsePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<HomeData>("/experience/home").then(setData).catch(error => setError(error.message));
  }, []);

  if (error) return <main><div className="state-page"><h1>Não foi possível carregar</h1><p>{error}</p><button className="btn btn-secondary" type="button" onClick={() => { setError(""); apiFetch<HomeData>("/experience/home").then(setData).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar")); }}>Tentar novamente</button></div></main>;
  if (!data) return <main><div className="state-page"><div className="loading-line" />Carregando sua biblioteca...</div></main>;

  const featured = data.featured;
  const heroStyle = featured ? { backgroundImage: contentBackgroundImage(featured.heroImageUrl, featured.id || featured.slug, ["linear-gradient(90deg,rgba(0,0,0,.96),rgba(0,0,0,.55) 44%,rgba(0,0,0,.12))", "linear-gradient(0deg,#090909,transparent 38%)"]) } : undefined;

  return (
    <main>
      {featured ? (
        <section className="hero experience-hero" style={heroStyle}>
          <div className="hero-content">
            <div className="eyebrow">Em destaque</div>
            <h1><GoogleText>{featured.title}</GoogleText></h1>
            <p><GoogleText>{featured.shortDescription || featured.description}</GoogleText></p>
            <div className="hero-facts">
              <span>{featured.totalLessons} aulas</span>
              {featured.enrolled && <span>{featured.progressPercent}% concluído</span>}
              {FEATURES.categoriesAndPaths && featured.categories[0]?.name && <span><GoogleText>{featured.categories[0].name}</GoogleText></span>}
            </div>
            <div className="actions">
              {featured.enrolled && featured.nextLessonId ? <Link className="btn btn-primary" href={`/watch/${featured.nextLessonId}`}>▶ {featured.progressPercent ? "Continuar" : "Começar"}</Link> : <Link className="btn btn-primary" href={`/course/${featured.slug}`}>▶ Ver curso</Link>}
              <Link className="btn btn-secondary" href={`/course/${featured.slug}`}>ⓘ Mais informações</Link>
            </div>
          </div>
        </section>
      ) : <section className="empty-hero"><h1>Sua plataforma está pronta para receber cursos.</h1></section>}
      <div className="content experience-content">
        <ExperienceRow title="Continue assistindo" items={data.continueWatching} href="/library" />
        <ExperienceRow title="Minha biblioteca" items={data.library} href="/library" />
        {FEATURES.categoriesAndPaths && data.paths.length > 0 && <section className="row"><div className="row-head"><h2>Trilhas recomendadas</h2><Link href="/paths">Ver todas</Link></div><div className="path-grid">{data.paths.slice(0,3).map(path => <PathCard key={path.id} path={path} />)}</div></section>}
        <ExperienceRow title="Minha lista" items={data.myList} href="/library#favoritos" />
        {FEATURES.categoriesAndPaths && data.categoryRows.map(row => <ExperienceRow key={row.id} title={row.name} items={row.courses} href={`/catalog?category=${row.slug}`} />)}
      </div>
    </main>
  );
}
