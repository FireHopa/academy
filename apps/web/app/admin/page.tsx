"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Dashboard = {
  students: number;
  courses: number;
  lessons: number;
  publishedCourses: number;
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  function load() {
    setError("");
    apiFetch<Dashboard>("/admin/dashboard").then(setData).catch(cause => setError(cause instanceof Error ? cause.message : "Não foi possível carregar a visão geral"));
  }

  useEffect(() => { load(); }, []);

  return <>
    <div className="section-head top"><div><div className="eyebrow">Visão geral</div><h1 className="admin-title">Painel administrativo</h1><p>Acompanhe a estrutura da plataforma e acesse as tarefas mais frequentes.</p></div></div>
    {error && <div className="form-error">{error} <button className="mini-button" type="button" onClick={load}>Tentar novamente</button></div>}
    {!data && !error && <div className="empty-panel">Carregando indicadores...</div>}
    {data && <>
      <section className="stat-grid" aria-label="Indicadores da plataforma">
        <div className="stat"><span>Alunos</span><b>{data.students.toLocaleString("pt-BR")}</b><small>Contas de estudantes cadastradas</small></div>
        <div className="stat"><span>Cursos</span><b>{data.courses.toLocaleString("pt-BR")}</b><small>{data.publishedCourses.toLocaleString("pt-BR")} publicado{data.publishedCourses === 1 ? "" : "s"}</small></div>
        <div className="stat"><span>Aulas</span><b>{data.lessons.toLocaleString("pt-BR")}</b><small>Conteúdos criados em todos os cursos</small></div>
        <div className="stat"><span>Taxa de publicação</span><b>{data.courses ? Math.round(data.publishedCourses / data.courses * 100) : 0}%</b><small>Percentual de cursos disponíveis aos alunos</small></div>
      </section>
      <div className="admin-dashboard-grid">
        <section className="admin-dashboard-main editor-card">
          <div className="section-head"><div><h2>Próximos passos</h2><p>Atalhos para manter o conteúdo e os acessos em dia.</p></div></div>
          <div className="admin-quick-list">
            <Link href="/admin/courses"><span><strong>Revisar cursos e aulas</strong><small>Edite capas, módulos, aulas e publicação.</small></span><b>→</b></Link>
            <Link href="/admin/students"><span><strong>Gerenciar alunos</strong><small>Cadastre pessoas, libere cursos e acompanhe acessos.</small></span><b>→</b></Link>
            <Link href="/admin/integrations"><span><strong>Verificar integrações</strong><small>Confira vídeo, webhooks e sincronizações externas.</small></span><b>→</b></Link>
          </div>
        </section>
        <aside className="admin-quick-panel">
          <h2>Ações rápidas</h2>
          <p>Acesse diretamente as áreas operacionais mais usadas.</p>
          <div className="admin-quick-list">
            <Link href="/admin/courses"><span><strong>Novo curso</strong><small>Criar e organizar conteúdo</small></span><b>＋</b></Link>
            <Link href="/admin/students"><span><strong>Novo aluno</strong><small>Cadastrar ou importar CSV</small></span><b>＋</b></Link>
            <Link href="/browse" target="_blank" rel="noreferrer"><span><strong>Área do aluno</strong><small>Abrir experiência publicada</small></span><b>↗</b></Link>
          </div>
        </aside>
      </div>
    </>}
  </>;
}
