"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";
import { contentBackgroundImage } from "@/lib/placeholders";

type Item = { lessonId: string; lessonTitle: string; course: { title: string; slug: string; cardImageUrl?: string | null }; positionSec: number; completed: boolean; completedAt?: string | null; lastActivityAt: string; durationSec?: number | null };
function dateText(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default function HistoryPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  function load() {
    setError("");
    apiFetch<{ items: Item[] }>("/experience/history").then(result => setItems(result.items)).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar o histórico"));
  }
  useEffect(() => { load(); }, []);

  return <main>
    <section className="standard-head"><div className="eyebrow">Sua atividade</div><h1>Histórico</h1><p>Continue exatamente de onde parou ou reveja aulas já concluídas.</p></section>
    <section className="standard-content"><div className="history-list">
      {items?.map(item => <Link href={`/watch/${item.lessonId}`} className="history-card" key={item.lessonId}><div className="history-art" style={{ backgroundImage: contentBackgroundImage(item.course.cardImageUrl, item.course.slug) }}/><div className="history-copy"><small><GoogleText>{item.course.title}</GoogleText></small><h3><GoogleText>{item.lessonTitle}</GoogleText></h3><span>{item.completed ? "✓ Aula concluída" : item.positionSec ? `Parou em ${Math.floor(item.positionSec / 60)} min` : "Iniciada"} · {dateText(item.lastActivityAt)}</span>{item.durationSec ? <div className="history-progress"><i style={{ width: `${item.completed ? 100 : Math.min(100, Math.round(item.positionSec / item.durationSec * 100))}%` }}/></div> : null}</div><b>Continuar ›</b></Link>)}
      {items && items.length === 0 && <div className="empty-block">Seu histórico aparecerá aqui quando você começar a assistir às aulas.</div>}
      {!items && !error && <div className="empty-block">Carregando histórico...</div>}
      {error && <div className="empty-block"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={load}>Tentar novamente</button></div>}
    </div></section>
  </main>;
}
