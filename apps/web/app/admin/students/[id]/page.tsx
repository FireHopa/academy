"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";

type Course = { id: string; title: string; status: string };
type Enrollment = { id: string; status: string; startsAt: string; expiresAt: string | null; progressPercent: number; completedLessons: number; totalLessons: number; course: Course };
type Device = { id: string; label: string | null; userAgent: string | null; lastIp: string | null; lastSeenAt: string; revokedAt: string | null; watchSessions: { id: string; lessonId: string; lastSeenAt: string }[] };
type Session = { id: string; status: string; startedAt: string; lastSeenAt: string; endedAt: string | null; lesson: { title: string; module: { course: { id: string; title: string } } } };
type Progress = { id: string; completed: boolean; positionSec: number; updatedAt: string; lesson: { id: string; title: string; durationSec: number | null; module: { course: { id: string; title: string; slug: string } } } };
type Certificate = { id: string; code: string; issuedAt: string; course: { title: string; slug: string } };
type Notification = { id: string; title: string; message: string; linkUrl: string | null; readAt: string | null; createdAt: string };
type InviteDeliveryStatus = "SENT" | "FAILED" | "NOT_REQUESTED";
type InviteResult = { url: string; delivered: boolean; deliveryStatus: InviteDeliveryStatus };
type Student = {
  id: string; name: string; email: string; cpf: string | null; phone: string | null;
  status: "ACTIVE" | "BLOCKED"; blockedAt: string | null; blockedReason: string | null;
  lastLoginAt: string | null; createdAt: string; enrollments: Enrollment[]; availableCourses: Course[];
  devices: Device[]; watchSessions: Session[]; lessonProgress: Progress[]; certificates: Certificate[]; notifications: Notification[];
};

const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "Nunca";
const localDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const toIsoDate = (value: string, endOfDay = false) => value ? new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString() : null;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "AL";
const formatCpf = (value?: string | null) => value ? value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : "";
const formatPhone = (value?: string | null) => {
  if (!value) return "";
  if (value.length === 11) return value.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (value.length === 10) return value.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return value;
};

function enrollmentState(enrollment: Enrollment) {
  const now = Date.now();
  if (enrollment.status === "CANCELLED") return { label: "Cancelada", tone: "neutral" };
  if (enrollment.status === "EXPIRED" || (enrollment.expiresAt && new Date(enrollment.expiresAt).getTime() <= now)) return { label: "Expirada", tone: "warning" };
  if (new Date(enrollment.startsAt).getTime() > now) return { label: "Agendada", tone: "info" };
  return { label: "Acesso liberado", tone: "success" };
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeLink, setNoticeLink] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteDelivered, setInviteDelivered] = useState(false);
  const [inviteDeliveryStatus, setInviteDeliveryStatus] = useState<InviteDeliveryStatus | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  async function load() {
    setError("");
    try { setStudent(await apiFetch<Student>(`/admin/students/${id}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar aluno"); }
  }

  useEffect(() => { void load(); }, [id]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => { if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [moreOpen]);

  async function action<T>(fn: () => Promise<T>, message: string | ((result: T) => string) = "Alteração salva com sucesso.") {
    setBusy(true); setError(""); setFeedback("");
    try { const result = await fn(); await load(); setFeedback(typeof message === "function" ? message(result) : message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir"); }
    finally { setBusy(false); }
  }

  const overview = useMemo(() => {
    if (!student) return { current: [] as Enrollment[], progress: 0 };
    const now = Date.now();
    const current = student.enrollments.filter(item => item.status === "ACTIVE" && new Date(item.startsAt).getTime() <= now && (!item.expiresAt || new Date(item.expiresAt).getTime() > now));
    const lessons = current.reduce((sum, item) => sum + item.totalLessons, 0);
    const completed = current.reduce((sum, item) => sum + item.completedLessons, 0);
    return { current, progress: lessons ? Math.round((completed / lessons) * 100) : 0 };
  }, [student]);

  if (!student) return <div className="state-page compact">{error || "Carregando aluno..."}</div>;
  const selectedStudent = student;
  const enrolledIds = new Set(student.enrollments.filter(item => item.status !== "CANCELLED").map(item => item.course.id));
  const available = student.availableCourses.filter(course => !enrolledIds.has(course.id));
  const activeSessions = student.watchSessions.filter(session => session.status === "ACTIVE");
  const removableEnrollments = student.enrollments.filter(item => item.status !== "CANCELLED");

  async function toggleStatus() {
    setMoreOpen(false);
    if (selectedStudent.status === "ACTIVE" && !window.confirm(`Bloquear a conta de ${selectedStudent.name}? As sessões ativas também serão encerradas.`)) return;
    const next = selectedStudent.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    await action(() => apiFetch(`/admin/students/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: next, reason: next === "BLOCKED" ? "Bloqueado pelo painel administrativo" : undefined }) }), next === "BLOCKED" ? "Conta bloqueada." : "Conta reativada.");
  }

  async function endAllSessions() {
    setMoreOpen(false);
    if (!activeSessions.length) { setFeedback("Não há sessões ativas para encerrar."); return; }
    if (!window.confirm(`Encerrar ${activeSessions.length} sessão${activeSessions.length === 1 ? "" : "ões"} ativa${activeSessions.length === 1 ? "" : "s"} deste aluno?`)) return;
    await action(() => Promise.all(activeSessions.map(session => apiFetch(`/admin/students/${id}/sessions/${session.id}/end`, { method: "POST" }))), "Sessões ativas encerradas.");
  }

  async function removeAllAccess() {
    setMoreOpen(false);
    if (!removableEnrollments.length) { setFeedback("O aluno não possui acessos para remover."); return; }
    if (!window.confirm(`Remover o acesso de ${selectedStudent.name} a ${removableEnrollments.length} curso${removableEnrollments.length === 1 ? "" : "s"}? O progresso continuará salvo.`)) return;
    await action(() => Promise.all(removableEnrollments.map(item => apiFetch(`/admin/students/${id}/enrollments/${item.id}`, { method: "DELETE" }))), "Acessos aos cursos removidos.");
  }

  return <>
    <header className="student-profile-head">
      <div>
        <Link className="back-link" href="/admin/students">← Alunos</Link>
        <div className="student-profile-identity"><span aria-hidden="true">{initials(student.name)}</span><div><div className="eyebrow">Perfil do aluno</div><h1 className="admin-title">{student.name}</h1><p>{student.email}</p></div></div>
        <div className="student-profile-meta"><span>Criado em {dateTime(student.createdAt)}</span><span>Último acesso {dateTime(student.lastLoginAt)}</span>{student.cpf && <span>CPF {formatCpf(student.cpf)}</span>}{student.phone && <span>Telefone {formatPhone(student.phone)}</span>}</div>
      </div>
      <div className="student-profile-actions">
        <button className="btn btn-primary" type="button" onClick={() => document.getElementById("cursos-e-acessos")?.scrollIntoView({ behavior: "smooth" })}>Liberar curso</button>
        <button className="btn btn-secondary" type="button" onClick={() => document.getElementById("acesso-do-aluno")?.scrollIntoView({ behavior: "smooth" })}>Enviar acesso</button>
        <Link className="btn btn-secondary" href={`/admin/students/${id}/preview`}>Ver área do aluno</Link>
        <div className="student-more-actions" ref={moreRef}>
          <button className="btn btn-secondary" type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(open => !open)}>Mais ações <span aria-hidden="true">⋮</span></button>
          {moreOpen && <div className="student-actions-menu" role="menu">
            <button type="button" role="menuitem" disabled={busy} onClick={() => void endAllSessions()}>Encerrar sessões<span>{activeSessions.length} ativa{activeSessions.length === 1 ? "" : "s"}</span></button>
            <button type="button" role="menuitem" disabled={busy} onClick={() => void removeAllAccess()}>Remover acessos<span>{removableEnrollments.length} curso{removableEnrollments.length === 1 ? "" : "s"}</span></button>
            <button className={student.status === "ACTIVE" ? "danger" : ""} type="button" role="menuitem" disabled={busy} onClick={() => void toggleStatus()}>{student.status === "ACTIVE" ? "Bloquear conta" : "Reativar conta"}<span>{student.status === "ACTIVE" ? "Restringir entrada" : "Restaurar entrada"}</span></button>
          </div>}
        </div>
      </div>
    </header>

    {error && <div className="form-error" role="alert"><GoogleText>{error}</GoogleText></div>}
    {feedback && <div className="student-feedback" role="status">✓ {feedback}</div>}
    {student.status === "BLOCKED" && <div className="blocked-banner"><b>Conta bloqueada</b><span>{student.blockedReason || "Sem motivo informado"} · {dateTime(student.blockedAt)}</span></div>}

    <section className="student-overview" aria-label="Resumo do aluno">
      <div><span>Status</span><b><span className={`status ${student.status === "BLOCKED" ? "blocked" : ""}`}>{student.status === "ACTIVE" ? "Ativo" : "Bloqueado"}</span></b></div>
      <div><span>Matrículas ativas</span><b>{overview.current.length}</b><small>{overview.current.length ? "Com acesso neste momento" : "Nenhum curso liberado"}</small></div>
      <div><span>Último acesso</span><b className="student-overview-date">{dateTime(student.lastLoginAt)}</b><small>{student.lastLoginAt ? "Entrada mais recente" : "Primeiro acesso pendente"}</small></div>
      <div><span>Progresso</span><b>{overview.progress}%</b><div className="student-overview-progress" aria-label={`${overview.progress}% concluído`}><span style={{ width: `${overview.progress}%` }} /></div></div>
    </section>

    <section className="admin-detail-section student-priority-section" id="cursos-e-acessos">
      <div className="section-head top"><div><span className="section-order">01</span><h2>Cursos e acessos</h2><p>Libere um curso agora ou programe o período de acesso.</p></div></div>
      <form className="student-grant-form" onSubmit={(event: FormEvent) => {
        event.preventDefault(); if (!courseId) return;
        void action(() => apiFetch(`/admin/students/${id}/enrollments`, { method: "POST", body: JSON.stringify({ courseId, startsAt: toIsoDate(startsAt), expiresAt: toIsoDate(expiresAt, true) }) }).then(() => { setCourseId(""); setStartsAt(""); setExpiresAt(""); }), "Curso liberado para o aluno.");
      }}>
        <label className="student-form-field"><span>Curso</span><select required value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">Selecionar curso...</option>{available.map(course => <option key={course.id} value={course.id}>{course.title}{course.status === "DRAFT" ? " (rascunho)" : ""}</option>)}</select></label>
        <label className="student-form-field"><span>Data de ativação <em>Opcional</em></span><input lang="pt-BR" type="date" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
        <label className="student-form-field"><span>Data de expiração <em>Opcional</em></span><input lang="pt-BR" type="date" min={startsAt || undefined} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || !courseId}>{busy ? "Liberando..." : "Liberar curso"}</button>
      </form>
      <div className="student-enrollment-list">{student.enrollments.map(item => <EnrollmentEditor key={item.id} userId={id} enrollment={item} busy={busy} run={action} />)}{!student.enrollments.length && <CompactEmpty icon="＋" title="Nenhum curso liberado" text="Selecione um curso acima para criar a primeira matrícula." />}</div>
    </section>

    <section className="student-access-card" id="acesso-do-aluno">
      <div><span className="section-order">02</span><b>Recuperação de acesso</b><p>Um novo convite invalida o anterior.</p></div>
      <div className="student-access-buttons"><button className="btn btn-secondary" type="button" disabled={busy || student.status === "BLOCKED"} onClick={() => void action(async () => { const result = await apiFetch<InviteResult>(`/admin/students/${id}/invite`, { method: "POST" }); setInviteUrl(result.url); setInviteDelivered(result.delivered); setInviteDeliveryStatus(result.deliveryStatus); return result; }, "Novo convite gerado.")}>Gerar convite</button><button className="btn btn-primary" type="button" disabled={busy || student.status === "BLOCKED"} onClick={() => void action(async () => { const result = await apiFetch<InviteResult>(`/admin/students/${id}/invite?send=true`, { method: "POST" }); setInviteUrl(result.url); setInviteDelivered(result.delivered); setInviteDeliveryStatus(result.deliveryStatus); return result; }, result => result.deliveryStatus === "SENT" ? "Novo convite gerado e enviado." : "Novo convite gerado, mas o e-mail não foi enviado. Copie o link ou tente novamente.")}>Gerar e enviar</button></div>
      {student.status === "BLOCKED" && <small className="student-access-disabled">Reative a conta para gerar um novo convite.</small>}
      {inviteUrl && <div className="student-invite-result"><label htmlFor="student-invite-url">Link do convite</label><div><input id="student-invite-url" readOnly value={inviteUrl} /><button className="btn btn-secondary" type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copiar</button></div><span>{inviteDelivered ? "E-mail enviado para o aluno." : inviteDeliveryStatus === "FAILED" ? "O e-mail não foi enviado. O link continua válido para compartilhar ou tentar novamente." : "Link pronto para compartilhar."}</span></div>}
    </section>

    <section className="admin-detail-section student-progress-section">
      <div className="section-head"><div><span className="section-order">03</span><h2>Progresso e atividade recente</h2><p>Últimas aulas acessadas pelo aluno.</p></div></div>
      <div className="student-activity-list">{student.lessonProgress.slice(0, 12).map(item => <div className="student-activity-row" key={item.id}><span className={item.completed ? "completed" : "playing"} aria-hidden="true">{item.completed ? "✓" : "▶"}</span><div><b><GoogleText>{item.lesson.title}</GoogleText></b><small><GoogleText>{item.lesson.module.course.title}</GoogleText> · {item.completed ? "Concluída" : `Parou em ${Math.floor(item.positionSec / 60)} min`}</small></div><time>{dateTime(item.updatedAt)}</time><b className={item.completed ? "good-text" : "muted-text"}>{item.completed ? "100%" : "Em andamento"}</b></div>)}{!student.lessonProgress.length && <CompactEmpty icon="▶" title="Nenhuma atividade ainda" text="O progresso aparecerá depois que o aluno iniciar uma aula." />}</div>
    </section>

    <div className="student-secondary-grid">
      <section className="student-compact-section"><header><div><h2>Dispositivos</h2><p>{student.devices.filter(device => !device.revokedAt).length} ativo{student.devices.filter(device => !device.revokedAt).length === 1 ? "" : "s"}</p></div></header><div className="student-compact-list">{student.devices.map(device => <div className="student-compact-row" key={device.id}><div><b>{device.label || "Dispositivo"}</b><span>{device.revokedAt ? `Revogado em ${dateTime(device.revokedAt)}` : `Último acesso ${dateTime(device.lastSeenAt)}`}</span><small>{device.lastIp || "IP não registrado"}</small></div>{!device.revokedAt && <button className="student-text-danger" type="button" disabled={busy} onClick={() => { if (window.confirm("Revogar este dispositivo? As sessões vinculadas serão encerradas.")) void action(() => apiFetch(`/admin/students/${id}/devices/${device.id}`, { method: "DELETE" }), "Dispositivo revogado."); }}>Revogar</button>}</div>)}{!student.devices.length && <CompactEmpty title="Nenhum dispositivo registrado" />}</div></section>
      <section className="student-compact-section"><header><div><h2>Sessões</h2><p>{activeSessions.length} ativa{activeSessions.length === 1 ? "" : "s"}</p></div></header><div className="student-compact-list">{student.watchSessions.slice(0, 10).map(session => <div className="student-compact-row" key={session.id}><div><b><GoogleText>{session.lesson.title}</GoogleText></b><span><GoogleText>{session.lesson.module.course.title}</GoogleText> · {session.status === "ACTIVE" ? "Ativa" : "Encerrada"}</span><small>{dateTime(session.lastSeenAt)}</small></div>{session.status === "ACTIVE" && <button className="student-text-danger" type="button" disabled={busy} onClick={() => { if (window.confirm("Encerrar esta sessão agora?")) void action(() => apiFetch(`/admin/students/${id}/sessions/${session.id}/end`, { method: "POST" }), "Sessão encerrada."); }}>Encerrar</button>}</div>)}{!student.watchSessions.length && <CompactEmpty title="Sem sessões registradas" />}</div></section>
      <section className="student-compact-section"><header><div><h2>Certificados</h2><p>{student.certificates.length} emitido{student.certificates.length === 1 ? "" : "s"}</p></div></header><div className="student-compact-list">{student.certificates.map(certificate => <div className="student-compact-row" key={certificate.id}><div><b><GoogleText>{certificate.course.title}</GoogleText></b><span>{certificate.code}</span><small>Emitido em {dateTime(certificate.issuedAt)}</small></div></div>)}{!student.certificates.length && <CompactEmpty title="Nenhum certificado emitido" />}</div></section>
    </div>

    <section className="admin-detail-section student-notification-section">
      <div className="section-head"><div><span className="section-order">04</span><h2>Notificação individual</h2><p>Envie um aviso diretamente para este aluno.</p></div></div>
      <form className="student-notice-form" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void action(() => apiFetch(`/admin/students/${id}/notifications`, { method: "POST", body: JSON.stringify({ title: noticeTitle, message: noticeMessage, linkUrl: noticeLink || undefined }) }).then(() => { setNoticeTitle(""); setNoticeMessage(""); setNoticeLink(""); }), "Notificação enviada para o aluno.");
      }}>
        <label className="student-form-field"><span>Título</span><input required value={noticeTitle} onChange={event => setNoticeTitle(event.target.value)} placeholder="Ex.: Nova aula disponível" /></label>
        <label className="student-form-field student-message-field"><span>Mensagem</span><textarea required value={noticeMessage} onChange={event => setNoticeMessage(event.target.value)} placeholder="Escreva uma mensagem curta e objetiva" /></label>
        <label className="student-form-field"><span>Link <em>Opcional</em></span><input value={noticeLink} onChange={event => setNoticeLink(event.target.value)} placeholder="/course/curso-principal" /></label>
        <button className="btn btn-primary" disabled={busy}>Enviar notificação</button>
      </form>
      <div className="student-notification-history">{student.notifications.map(item => <div key={item.id}><div><b><GoogleText>{item.title}</GoogleText></b><span><GoogleText>{item.message}</GoogleText></span></div><small>{dateTime(item.createdAt)} · {item.readAt ? `Lida em ${dateTime(item.readAt)}` : "Não lida"}</small></div>)}{!student.notifications.length && <CompactEmpty title="Nenhuma notificação enviada" />}</div>
    </section>
  </>;
}

function EnrollmentEditor({ userId, enrollment, busy, run }: { userId: string; enrollment: Enrollment; busy: boolean; run: (fn: () => Promise<unknown>, message?: string) => Promise<void> }) {
  const [status, setStatus] = useState(enrollment.status);
  const [start, setStart] = useState(localDate(enrollment.startsAt));
  const [end, setEnd] = useState(localDate(enrollment.expiresAt));
  const state = enrollmentState(enrollment);
  useEffect(() => { setStatus(enrollment.status); setStart(localDate(enrollment.startsAt)); setEnd(localDate(enrollment.expiresAt)); }, [enrollment]);
  return <article className="student-enrollment-card">
    <div className="student-enrollment-summary"><div><b><GoogleText>{enrollment.course.title}</GoogleText></b><span className={`student-access-state ${state.tone}`}>{state.label}</span></div><div className="student-enrollment-progress"><div><span style={{ width: `${enrollment.progressPercent}%` }} /></div><small>{enrollment.progressPercent}% concluído · {enrollment.completedLessons} de {enrollment.totalLessons} aulas</small></div></div>
    <div className="student-enrollment-fields">
      <label className="student-form-field"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="ACTIVE">Ativa</option><option value="EXPIRED">Expirada</option><option value="CANCELLED">Cancelada</option></select></label>
      <label className="student-form-field"><span>Início</span><input lang="pt-BR" type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label className="student-form-field"><span>Expiração <em>Opcional</em></span><input lang="pt-BR" type="date" min={start || undefined} value={end} onChange={event => setEnd(event.target.value)} /></label>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void run(() => apiFetch(`/admin/students/${userId}/enrollments/${enrollment.id}`, { method: "PATCH", body: JSON.stringify({ status, startsAt: toIsoDate(start), expiresAt: toIsoDate(end, true) }) }), "Matrícula atualizada.")}>Salvar</button>
      <button className="student-text-danger" type="button" disabled={busy || enrollment.status === "CANCELLED"} onClick={() => { if (window.confirm("Remover o acesso a este curso? O progresso continuará salvo.")) void run(() => apiFetch(`/admin/students/${userId}/enrollments/${enrollment.id}`, { method: "DELETE" }), "Acesso ao curso removido."); }}>Remover</button>
    </div>
  </article>;
}

function CompactEmpty({ icon, title, text }: { icon?: string; title: string; text?: string }) {
  return <div className="student-compact-empty">{icon && <span aria-hidden="true">{icon}</span>}<div><b>{title}</b>{text && <small>{text}</small>}</div></div>;
}
