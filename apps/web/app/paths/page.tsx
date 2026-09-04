"use client";

import { useEffect, useState } from "react";
import { PathCard } from "@/components/path-card";
import { apiFetch } from "@/lib/api";
import type { LearningPathCard } from "@/lib/experience";

export default function PathsPage() {
  const [paths, setPaths] = useState<LearningPathCard[] | null>(null);
  const [error, setError] = useState("");
  function load() {
    setError("");
    apiFetch<{ paths: LearningPathCard[] }>("/experience/paths").then(data => setPaths(data.paths)).catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar as trilhas"));
  }
  useEffect(() => { load(); }, []);
  return <main><section className="standard-head"><div className="eyebrow">Aprendizado guiado</div><h1>Trilhas</h1><p>Sequências de cursos para sair do ponto A e chegar a uma competência específica.</p></section><section className="standard-content"><div className="path-grid large">{paths?.map(path => <PathCard key={path.id} path={path}/>)}</div>{paths && !paths.length && <div className="empty-block">Nenhuma trilha publicada ainda.</div>}{!paths && !error && <div className="state-page compact">Carregando trilhas...</div>}{error && <div className="state-page compact"><div className="form-error">{error}</div><button className="btn btn-secondary" type="button" onClick={load}>Tentar novamente</button></div>}</section></main>;
}
