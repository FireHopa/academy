"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";

type Enrollment = {
  id: string;
  status: string;
  startsAt: string;
  expiresAt: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  course: { id: string; title: string; slug: string; status: string };
};

type StudentPreview = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "BLOCKED";
  enrollments: Enrollment[];
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "AL";
}

export default function StudentAreaPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<StudentPreview>(`/admin/students/${id}`)
      .then(setStudent)
      .catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar a prévia"));
  }, [id]);

  const visibleCourses = useMemo(() => {
    if (!student) return [];
    const now = Date.now();
    return student.enrollments.filter(item => item.status === "ACTIVE"
      && new Date(item.startsAt).getTime() <= now
      && (!item.expiresAt || new Date(item.expiresAt).getTime() > now));
  }, [student]);

  if (!student) return <div className="state-page compact">{error || "Preparando a área do aluno..."}</div>;

  return <>
    <header className="student-preview-page-head">
      <div><Link className="back-link" href={`/admin/students/${id}`}>← Perfil do aluno</Link><div className="eyebrow">Prévia administrativa</div><h1 className="admin-title">Área de {student.name}</h1><p className="admin-subtitle">Visualização somente leitura dos cursos disponíveis para este aluno.</p></div>
      <span className="student-preview-readonly">Somente leitura</span>
    </header>

    {student.status === "BLOCKED" && <div className="blocked-banner"><b>Conta bloqueada</b><span>O aluno não consegue acessar esta área enquanto a conta estiver bloqueada.</span></div>}

    <section className="student-area-preview">
      <header className="student-area-preview-nav"><div><span>ACADEMY</span><b>Minha área</b></div><div><span aria-hidden="true">⌕</span><span aria-hidden="true">♧</span><span className="student-area-preview-avatar">{initials(student.name)}</span></div></header>
      <div className="student-area-preview-hero"><div><small>OLÁ, {student.name.split(" ")[0].toUpperCase()}</small><h2>Continue aprendendo</h2><p>Seus cursos e conteúdos estão organizados em um só lugar.</p></div><span aria-hidden="true">▶</span></div>
      <div className="student-area-preview-content"><div><h3>Meus cursos</h3><span>{visibleCourses.length} disponível{visibleCourses.length === 1 ? "" : "is"}</span></div>
        {visibleCourses.length ? <div className="student-area-preview-grid">{visibleCourses.map((enrollment, index) => <article key={enrollment.id}><div className={`student-area-preview-art art-${index % 4}`}><span>{enrollment.progressPercent ? "Continuar" : "Começar"}</span></div><div><small>CURSO</small><h4><GoogleText>{enrollment.course.title}</GoogleText></h4><div className="student-area-preview-progress"><span style={{ width: `${enrollment.progressPercent}%` }} /></div><p>{enrollment.progressPercent}% concluído · {enrollment.completedLessons} de {enrollment.totalLessons} aulas</p></div></article>)}</div>
          : <div className="student-area-preview-empty"><span aria-hidden="true">▤</span><h3>Nenhum curso disponível</h3><p>Esta é a tela vazia que o aluno verá até receber acesso a um curso.</p><Link className="btn btn-primary" href={`/admin/students/${id}#cursos-e-acessos`}>Liberar curso</Link></div>}
      </div>
    </section>
  </>;
}
