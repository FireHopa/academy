"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import styles from "./page.module.css";

type AuditItem = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  metadata: { method?: string; path?: string; request?: unknown } | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
  createdAt: string;
};

type AuditResponse = { items: AuditItem[]; total: number; page: number; pageSize: number; pages: number };

const entityLabels: Record<string, string> = {
  STUDENT: "Aluno",
  STUDENT_IMPORT: "Importação de alunos",
  ENROLLMENT: "Matrícula",
  COURSE: "Curso",
  COURSE_MODULE: "Módulo",
  COURSE_MODULE_ORDER: "Ordem dos módulos",
  LESSON: "Aula",
  MODULE_LESSON_ORDER: "Ordem das aulas",
  LESSON_CONTENT: "Conteúdo da aula",
  CATEGORY: "Categoria",
  LEARNING_PATH: "Trilha",
  DEVICE: "Dispositivo",
  WATCH_SESSION: "Sessão",
  EXTERNAL_PRODUCT: "Produto TheMembers",
  REMOTE_COURSE: "Curso TheMembers",
  INTEGRATION: "Integração",
  VIDEO_ASSET_CLEANUP: "Limpeza de vídeos",
};

const actionLabels: Record<string, string> = {
  "student.create": "Aluno criado",
  "student.import.requested": "Importação de alunos solicitada",
  "student.invite.generate": "Convite de aluno gerado",
  "student.status.update": "Status do aluno alterado",
  "student.notification.send": "Notificação enviada ao aluno",
  "student.device.revoke": "Dispositivo revogado",
  "student.session.end": "Sessão encerrada",
  "enrollment.create": "Matrícula criada",
  "enrollment.update": "Matrícula alterada",
  "enrollment.cancel": "Matrícula cancelada",
  "course.create": "Curso criado",
  "course.update": "Curso alterado",
  "course.delete": "Curso excluído",
  "course.image.upload": "Imagem do curso enviada",
  "course.image.remove": "Imagem do curso removida",
  "course.module.create": "Módulo criado",
  "course.module.update": "Módulo alterado",
  "course.module.delete": "Módulo excluído",
  "course.modules.reorder": "Módulos reordenados",
  "lesson.create": "Aula criada",
  "lesson.update": "Aula alterada",
  "lesson.delete": "Aula excluída",
  "lessons.reorder": "Aulas reordenadas",
  "lesson.content.update": "Conteúdo da aula alterado",
  "lesson.video.upload.create": "Upload de vídeo iniciado",
  "lesson.video.panda.attach": "Vídeo Panda vinculado",
  "lesson.video.panda.refresh": "Vídeo Panda atualizado",
  "lesson.video.remove": "Vídeo removido",
  "category.create": "Categoria criada",
  "course.categories.update": "Categorias do curso alteradas",
  "learning-path.create": "Trilha criada",
  "learning-path.update": "Trilha alterada",
  "learning-path.delete": "Trilha excluída",
  "learning-path.image.upload": "Imagem da trilha enviada",
  "learning-path.image.remove": "Imagem da trilha removida",
  "learning-path.courses.update": "Cursos da trilha alterados",
  "integration.panda.test": "Conexão Panda testada",
  "video-assets.cleanup.requested": "Limpeza de vídeos solicitada",
  "integration.themembers.test": "Conexão TheMembers testada",
  "integration.themembers.course-import.requested": "Importação TheMembers solicitada",
  "integration.themembers.products-sync.requested": "Sincronização de produtos solicitada",
  "integration.themembers.reconcile.requested": "Reconciliação TheMembers solicitada",
  "integration.themembers.product-courses.update": "Mapeamento de produto alterado",
  "integration.themembers.reference.update": "Referência do produto alterada",
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function endOfDay(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : "";
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return <div className={styles.emptyChange}><b>{title}</b><span>Sem estado registrado</span></div>;
  return <div className={styles.jsonBlock}><b>{title}</b><pre>{JSON.stringify(value, null, 2)}</pre></div>;
}

export default function AuditPage() {
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q.trim()) params.set("q", q.trim());
    if (entityType) params.set("entityType", entityType);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", endOfDay(to));
    try { setResult(await apiFetch<AuditResponse>(`/admin/audit-logs?${params}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a auditoria"); }
    finally { setLoading(false); }
  }, [entityType, from, page, q, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  function resetFilters() {
    setQ("");
    setEntityType("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return <>
    <header className={styles.header}>
      <div><div className="eyebrow">Segurança e controle</div><h1 className="admin-title">Auditoria administrativa</h1><p className="admin-lead">Veja quem alterou alunos, cursos, acessos, conteúdos e integrações.</p></div>
      <div className={styles.total}><b>{result?.total ?? 0}</b><span>registros encontrados</span></div>
    </header>

    <section className={styles.filters} aria-label="Filtros da auditoria">
      <label className={styles.search}><span>Buscar</span><input value={q} onChange={event => { setQ(event.target.value); setPage(1); }} placeholder="Administrador, ação, ID ou request ID" /></label>
      <label><span>Tipo de registro</span><select value={entityType} onChange={event => { setEntityType(event.target.value); setPage(1); }}><option value="">Todos</option>{Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>De</span><input type="date" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
      <label><span>Até</span><input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
      <button type="button" onClick={resetFilters}>Limpar</button>
    </section>

    {error && <div className="form-error" role="alert">{error}</div>}
    <div className={styles.status} aria-live="polite">{loading ? "Atualizando histórico..." : `${result?.items.length ?? 0} registro(s) nesta página`}</div>

    <section className={styles.list}>
      {result?.items.map(item => <article className={styles.item} key={item.id}>
        <div className={styles.itemMain}>
          <span className={styles.actionIcon} aria-hidden="true">✓</span>
          <div className={styles.actionCopy}><strong>{actionLabels[item.action] || item.action}</strong><span>{entityLabels[item.entityType] || item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}</span></div>
          <div className={styles.actor}><b>{item.actorName}</b><span>{item.actorEmail}</span></div>
          <time>{dateTime(item.createdAt)}</time>
        </div>
        <details className={styles.details}>
          <summary>Ver alterações e dados técnicos</summary>
          <div className={styles.changeGrid}><JsonBlock title="Antes" value={item.before} /><JsonBlock title="Depois" value={item.after} /></div>
          <dl className={styles.technical}>
            <div><dt>Requisição</dt><dd>{item.metadata?.method || "-"} {item.metadata?.path || "-"}</dd></div>
            <div><dt>Request ID</dt><dd>{item.requestId}</dd></div>
            <div><dt>IP</dt><dd>{item.ipAddress || "Não identificado"}</dd></div>
            <div><dt>Navegador</dt><dd>{item.userAgent || "Não identificado"}</dd></div>
          </dl>
          {item.metadata?.request !== undefined && <JsonBlock title="Dados sanitizados da requisição" value={item.metadata.request} />}
        </details>
      </article>)}
      {!loading && !result?.items.length && <div className={styles.empty}><b>Nenhum registro encontrado</b><span>Ajuste os filtros ou aguarde uma nova ação administrativa.</span></div>}
    </section>

    {(result?.pages ?? 1) > 1 && <nav className={styles.pagination} aria-label="Páginas da auditoria"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}>← Anterior</button><span>Página {result?.page} de {result?.pages}</span><button type="button" disabled={page >= (result?.pages ?? 1) || loading} onClick={() => setPage(current => current + 1)}>Próxima →</button></nav>}
  </>;
}
