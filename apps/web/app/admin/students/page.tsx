"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Student = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "BLOCKED";
  blockedReason?: string | null;
  lastLoginAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  activeCourses: number;
  devices: number;
  certificates: number;
  progressPercent: number;
};

type Course = { id: string; title: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" };
type EnrollmentResult = { id: string; course: Course; startsAt: string; expiresAt: string | null };
type InviteDeliveryStatus = "SENT" | "FAILED" | "NOT_REQUESTED";
type CreateResult = {
  user: { id: string; name: string; email: string };
  invite: { url: string; delivered: boolean; deliveryStatus: InviteDeliveryStatus } | null;
  enrollment: EnrollmentResult | null;
};
type StudentFilter = "" | "ACTIVE" | "BLOCKED" | "NO_COURSE" | "INACTIVE";
type CreateField = "name" | "email" | "password" | "cpf" | "phone" | "courseId" | "startsAt" | "expiresAt";
type CsvStudent = { name: string; email: string; password?: string };
type CsvImportResult = {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  message: string;
  results: Array<{
    row: number;
    name: string;
    email: string;
    status: "CREATED" | "SKIPPED" | "FAILED";
    inviteUrl?: string;
    inviteDelivered?: boolean;
    inviteDeliveryStatus?: InviteDeliveryStatus;
    message?: string;
  }>;
};

const filters: Array<{ value: StudentFilter; label: string; title?: string }> = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "BLOCKED", label: "Bloqueados" },
  { value: "NO_COURSE", label: "Sem curso" },
  { value: "INACTIVE", label: "Inativos", title: "Sem login ou progresso nos últimos 30 dias" },
];

function fmt(value?: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function inviteStatusLabel(status?: InviteDeliveryStatus) {
  if (status === "SENT") return "enviado";
  if (status === "FAILED") return "falha no envio";
  if (status === "NOT_REQUESTED") return "não solicitado";
  return "sem convite";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "AL";
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const number = digits(value).slice(0, 11);
  return number.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatPhone(value: string) {
  const number = digits(value).slice(0, 13);
  if (number.length > 11) return number.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 ($2) $3-$4");
  return number.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4,5})(\d{4})$/, "$1-$2");
}

function validCpf(value: string) {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    const sum = cpf.slice(0, length).split("").reduce((total, item, index) => total + Number(item) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function dateIso(value: string, endOfDay = false) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
}

function normalizedHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function delimiterFor(text: string) {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/).find(item => item.trim()) || "";
  const candidates = [";", ",", "\t"];
  const counts = new Map(candidates.map(candidate => [candidate, 0]));
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') { index++; continue; }
      quoted = !quoted;
      continue;
    }
    if (!quoted && counts.has(line[index])) counts.set(line[index], (counts.get(line[index]) || 0) + 1);
  }
  return candidates.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0];
}

function csvMatrix(text: string) {
  const delimiter = delimiterFor(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index++; continue; }
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(cell.trim());
      cell = "";
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value.trim())) rows.push(row);
  if (quoted) throw new Error("O CSV possui aspas abertas sem fechamento.");
  return rows;
}

function parseStudentsCsv(text: string): CsvStudent[] {
  const matrix = csvMatrix(text);
  if (matrix.length < 2) throw new Error("O CSV precisa ter cabeçalho e pelo menos um aluno.");
  const headers = matrix[0].map(normalizedHeader);
  const find = (aliases: string[]) => headers.findIndex(header => aliases.includes(header));
  const nameIndex = find(["nome", "name", "nome do aluno", "aluno"]);
  const emailIndex = find(["email", "e mail", "mail"]);
  const passwordIndex = find(["senha", "password", "senha inicial"]);
  if (nameIndex < 0 || emailIndex < 0) throw new Error('Use as colunas obrigatórias "nome" e "email". A coluna "senha" é opcional.');
  if (matrix.length - 1 > 1000) throw new Error("O limite é de 1.000 alunos por importação.");
  return matrix.slice(1).map((values, index) => {
    const name = (values[nameIndex] || "").trim();
    const email = (values[emailIndex] || "").trim();
    const password = passwordIndex >= 0 ? (values[passwordIndex] || "").trim() : "";
    if (!name || !email) throw new Error(`Linha ${index + 2}: nome e e-mail são obrigatórios.`);
    if (password && password.length < 10) throw new Error(`Linha ${index + 2}: a senha precisa ter pelo menos 10 caracteres.`);
    return { name, email, ...(password ? { password } : {}) };
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [coursesError, setCoursesError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [courseId, setCourseId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateField, string>>>({});
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvStudent[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvInviteEmail, setCsvInviteEmail] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [csvError, setCsvError] = useState("");

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage) });
      if (q.trim()) params.set("q", q.trim());
      if (filter) params.set("status", filter);
      const result = await apiFetch<{ items: Student[]; total: number; page: number; pages: number }>(`/admin/students?${params}`);
      setStudents(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPages(result.pages);
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : "Falha ao carregar alunos");
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 280);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    apiFetch<Course[]>("/admin/courses")
      .then(result => setCourses(result.filter(course => course.status !== "ARCHIVED")))
      .catch(cause => setCoursesError(cause instanceof Error ? cause.message : "Não foi possível carregar os cursos"));
  }, []);

  useEffect(() => {
    if (!createOpen || created) return;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [createOpen, created]);

  function resetCreate() {
    setName("");
    setEmail("");
    setPassword("");
    setCpf("");
    setPhone("");
    setCourseId("");
    setStartsAt("");
    setExpiresAt("");
    setSendInviteEmail(true);
    setAdvancedOpen(false);
    setFieldErrors({});
    setCreateError("");
    setCreated(null);
  }

  function openCreate() {
    resetCreate();
    setCreateOpen(true);
  }

  function openCsv() {
    setCsvRows([]);
    setCsvFileName("");
    setCsvInviteEmail(false);
    setCsvResult(null);
    setCsvError("");
    setCsvOpen(true);
  }

  function validateCreate() {
    const errors: Partial<Record<CreateField, string>> = {};
    if (name.trim().length < 2) errors.name = "Digite o nome completo do aluno.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Digite um endereço de e-mail válido.";
    if (password && password.length < 10) errors.password = "A senha precisa ter pelo menos 10 caracteres.";
    if (cpf && !validCpf(cpf)) errors.cpf = "Digite um CPF válido.";
    const phoneDigits = digits(phone);
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 15)) errors.phone = "Digite um telefone com DDD.";
    if (expiresAt) {
      const start = startsAt ? new Date(`${startsAt}T00:00:00`) : new Date();
      const end = new Date(`${expiresAt}T23:59:59`);
      if (end <= start) errors.expiresAt = "A expiração deve ser posterior ao início.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!validateCreate()) return;
    setCreating(true);
    setCreateError("");
    try {
      const body = {
        name: name.trim(),
        email: email.trim(),
        ...(password ? { password } : { sendInviteEmail }),
        ...(cpf ? { cpf: digits(cpf) } : {}),
        ...(phone ? { phone: digits(phone) } : {}),
        ...(courseId ? { courseId, startsAt: dateIso(startsAt), expiresAt: dateIso(expiresAt, true) } : {}),
      };
      const result = await apiFetch<CreateResult>("/admin/students", { method: "POST", body: JSON.stringify(body) });
      setCreated(result);
      await load(1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha ao criar aluno";
      setCreateError(message);
      if (/e-mail|email/i.test(message)) setFieldErrors(current => ({ ...current, email: message }));
      if (/cpf/i.test(message)) setFieldErrors(current => ({ ...current, cpf: message }));
    } finally {
      setCreating(false);
    }
  }

  async function copyInvite(url?: string) {
    if (url) await navigator.clipboard.writeText(url);
  }

  async function selectCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCsvResult(null);
    setCsvRows([]);
    setCsvFileName("");
    setCsvError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCsvError("O arquivo CSV deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }
    try {
      const rows = parseStudentsCsv(await file.text());
      setCsvRows(rows);
      setCsvFileName(file.name);
    } catch (cause) {
      setCsvError(cause instanceof Error ? cause.message : "Não foi possível ler o CSV");
      event.target.value = "";
    }
  }

  async function importCsv() {
    if (!csvRows.length) return;
    setCsvImporting(true);
    setCsvResult(null);
    setCsvError("");
    try {
      const result = await apiFetch<CsvImportResult>("/admin/students/import", { method: "POST", body: JSON.stringify({ rows: csvRows, sendInviteEmail: csvInviteEmail }) });
      setCsvResult(result);
      await load(1);
    } catch (cause) {
      setCsvError(cause instanceof Error ? cause.message : "Falha ao importar alunos");
    } finally {
      setCsvImporting(false);
    }
  }

  function downloadCsvResult() {
    if (!csvResult) return;
    const lines = [
      ["linha", "nome", "email", "status", "situacao_convite", "link_convite", "observacao"],
      ...csvResult.results.map(item => [item.row, item.name, item.email, item.status, inviteStatusLabel(item.inviteDeliveryStatus), item.inviteUrl || "", item.message || ""]),
    ];
    const blob = new Blob(["\uFEFF" + lines.map(line => line.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resultado-importacao-alunos.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <>
      <header className="students-page-head">
        <div><div className="eyebrow">Gestão de alunos</div><h1 className="admin-title">Alunos</h1><p className="admin-subtitle">Cadastre, libere cursos e acompanhe cada aluno em poucos cliques.</p></div>
        <div className="students-head-actions"><button className="btn btn-secondary" type="button" onClick={openCsv}>Importar CSV</button><button className="btn btn-primary students-new-button" type="button" onClick={openCreate}>＋ Novo aluno</button></div>
      </header>

      <section className="students-toolbar" aria-label="Busca e filtros de alunos">
        <label className="students-search-field"><span className="sr-only">Buscar alunos</span><span aria-hidden="true">⌕</span><input value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar por nome ou e-mail" />{q && <button type="button" aria-label="Limpar busca" onClick={() => setQ("")}>×</button>}</label>
        <div className="students-filter-tabs" role="group" aria-label="Filtrar alunos">{filters.map(item => <button key={item.value || "all"} type="button" title={item.title} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
      </section>

      <div className="students-list-meta" aria-live="polite"><span>{loading ? "Atualizando alunos..." : `${total} aluno${total === 1 ? "" : "s"}`}</span>{filter === "INACTIVE" && <small>Sem login ou progresso há 30 dias</small>}</div>
      {listError && <div className="form-error">{listError}</div>}

      <div className={`student-table-wrap students-desktop-table ${loading ? "is-loading" : ""}`}><table className="table student-table"><thead><tr><th>Aluno</th><th>Status</th><th>Cursos</th><th>Última atividade</th><th>Progresso</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{students.map(student => <StudentRow key={student.id} student={student} />)}{!students.length && !loading && <tr><td colSpan={6} className="empty-cell">Nenhum aluno encontrado com estes filtros.</td></tr>}</tbody></table></div>

      <div className={`students-mobile-list ${loading ? "is-loading" : ""}`}>{students.map(student => <StudentMobileCard key={student.id} student={student} />)}{!students.length && !loading && <div className="empty-panel">Nenhum aluno encontrado com estes filtros.</div>}</div>

      {pages > 1 && <nav className="pagination" aria-label="Paginação de alunos"><button className="btn btn-secondary" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>← Anterior</button><span>Página {page} de {pages}</span><button className="btn btn-secondary" disabled={page >= pages || loading} onClick={() => void load(page + 1)}>Próxima →</button></nav>}

      {createOpen && <Modal id="new-student" title={created ? "Aluno criado" : "Novo aluno"} description={created ? "O acesso foi configurado com sucesso." : "Crie o acesso do aluno e, se quiser, já libere um curso."} onClose={() => !creating && setCreateOpen(false)}>
        {created ? <CreateSuccess result={created} onCopy={copyInvite} onAnother={resetCreate} /> : <form className="student-modal-form" onSubmit={create} noValidate>
          {createError && <div className="modal-form-error" role="alert">{createError}</div>}
          <div className="student-modal-grid">
            <Field label="Nome" error={fieldErrors.name} htmlFor="student-name"><input ref={nameRef} id="student-name" value={name} onChange={event => { setName(event.target.value); setFieldErrors(current => ({ ...current, name: undefined })); }} placeholder="Digite o nome do aluno" autoComplete="name" aria-invalid={Boolean(fieldErrors.name)} /></Field>
            <Field label="E-mail" error={fieldErrors.email} htmlFor="student-email"><input id="student-email" type="email" value={email} onChange={event => { setEmail(event.target.value); setFieldErrors(current => ({ ...current, email: undefined })); }} placeholder="aluno@email.com" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} /></Field>
            <Field label="Senha inicial" optional error={fieldErrors.password} htmlFor="student-password"><input id="student-password" type="password" minLength={10} value={password} onChange={event => { setPassword(event.target.value); setFieldErrors(current => ({ ...current, password: undefined })); }} placeholder="Definir uma senha" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} /></Field>
            <Field label="Curso ou produto" optional error={fieldErrors.courseId} htmlFor="student-course"><select id="student-course" value={courseId} onChange={event => setCourseId(event.target.value)} disabled={Boolean(coursesError)}><option value="">Selecionar curso...</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}{course.status === "DRAFT" ? " (rascunho)" : ""}</option>)}</select>{coursesError && <small className="field-support error">{coursesError}</small>}</Field>
          </div>

          {!password ? <label className="student-invite-check"><input type="checkbox" checked={sendInviteEmail} onChange={event => setSendInviteEmail(event.target.checked)} /><span><b>Enviar convite de acesso por e-mail</b><small>O aluno receberá um link para definir sua senha.</small></span></label> : <div className="student-password-note"><b>Senha inicial definida</b><span>O aluno poderá entrar diretamente com esta senha.</span></div>}

          <button className="student-advanced-toggle" type="button" aria-expanded={advancedOpen} aria-controls="student-advanced-fields" onClick={() => setAdvancedOpen(open => !open)}><span>{advancedOpen ? "−" : "+"}</span> Opções avançadas</button>
          {advancedOpen && <div className="student-advanced-fields" id="student-advanced-fields">
            <Field label="CPF" optional error={fieldErrors.cpf} htmlFor="student-cpf"><input id="student-cpf" inputMode="numeric" value={cpf} onChange={event => { setCpf(formatCpf(event.target.value)); setFieldErrors(current => ({ ...current, cpf: undefined })); }} placeholder="000.000.000-00" aria-invalid={Boolean(fieldErrors.cpf)} /></Field>
            <Field label="Telefone" optional error={fieldErrors.phone} htmlFor="student-phone"><input id="student-phone" type="tel" value={phone} onChange={event => { setPhone(formatPhone(event.target.value)); setFieldErrors(current => ({ ...current, phone: undefined })); }} placeholder="(11) 99999-9999" autoComplete="tel" aria-invalid={Boolean(fieldErrors.phone)} /></Field>
            {courseId && <><Field label="Data de ativação" optional error={fieldErrors.startsAt} htmlFor="student-start"><input id="student-start" lang="pt-BR" type="date" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></Field><Field label="Data de expiração" optional error={fieldErrors.expiresAt} htmlFor="student-end"><input id="student-end" lang="pt-BR" type="date" min={startsAt || undefined} value={expiresAt} onChange={event => { setExpiresAt(event.target.value); setFieldErrors(current => ({ ...current, expiresAt: undefined })); }} aria-invalid={Boolean(fieldErrors.expiresAt)} /></Field></>}
          </div>}

          <div className="student-modal-actions"><button className="btn btn-primary" disabled={creating}>{creating ? "Criando aluno..." : "Criar aluno"}</button><button className="student-cancel-button" type="button" disabled={creating} onClick={() => setCreateOpen(false)}>Cancelar</button></div>
        </form>}
      </Modal>}

      {csvOpen && <Modal id="csv-students" title="Importar alunos por CSV" description="Cadastre até 1.000 alunos em uma única operação." onClose={() => !csvImporting && setCsvOpen(false)}>
        <div className="student-csv-modal">
          {csvError && <div className="modal-form-error" role="alert">{csvError}</div>}
          <div className="student-csv-guide"><div><b>Prepare o arquivo</b><span>Use as colunas nome e email. A coluna senha é opcional.</span></div><a href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFFnome;email;senha\nMaria Silva;maria@exemplo.com;")}`} download="modelo-importacao-alunos.csv">Baixar modelo CSV</a></div>
          <label className={`student-csv-dropzone ${csvRows.length ? "has-file" : ""}`}><input type="file" accept=".csv,text/csv" onChange={selectCsv} /><span aria-hidden="true">↑</span><b>{csvFileName || "Selecionar arquivo CSV"}</b><small>{csvRows.length ? `${csvRows.length} aluno${csvRows.length === 1 ? "" : "s"} pronto${csvRows.length === 1 ? "" : "s"} para importar` : "CSV de até 5 MB"}</small></label>
          <label className="student-invite-check compact"><input type="checkbox" checked={csvInviteEmail} onChange={event => setCsvInviteEmail(event.target.checked)} /><span><b>Enviar convites por e-mail</b><small>Somente para alunos que não tiverem senha no arquivo.</small></span></label>
          {csvResult && <div className="student-csv-result"><div><b>{csvResult.created} criados</b><span>{csvResult.skipped} ignorados</span><span>{csvResult.failed} com falha</span></div><button className="btn btn-secondary" type="button" onClick={downloadCsvResult}>Baixar resultado</button>{csvResult.results.some(item => item.message) && <ul>{csvResult.results.filter(item => item.message).slice(0, 8).map(item => <li key={`${item.row}-${item.email}`}>Linha {item.row}: {item.email} · {item.message}</li>)}</ul>}</div>}
          <div className="student-modal-actions"><button className="btn btn-primary" type="button" disabled={!csvRows.length || csvImporting || Boolean(csvResult)} onClick={() => void importCsv()}>{csvImporting ? "Importando..." : csvResult ? "Importação concluída" : `Importar${csvRows.length ? ` ${csvRows.length} aluno${csvRows.length === 1 ? "" : "s"}` : " alunos"}`}</button><button className="student-cancel-button" type="button" disabled={csvImporting} onClick={() => setCsvOpen(false)}>{csvResult ? "Fechar" : "Cancelar"}</button></div>
        </div>
      </Modal>}
    </>
  );
}

function Field({ label, optional = false, error, htmlFor, children }: { label: string; optional?: boolean; error?: string; htmlFor: string; children: ReactNode }) {
  return <label className={`student-form-field ${error ? "has-error" : ""}`} htmlFor={htmlFor}><span>{label}{optional && <em>Opcional</em>}</span>{children}{error && <small className="field-error" role="alert">{error}</small>}</label>;
}

function Modal({ id, title, description, onClose, children }: { id: string; title: string; description: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")?.focus(), 0);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keyboard);
      previousFocus?.focus();
    };
  }, []);
  return <div className="student-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="student-modal" id={id} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}><header><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button type="button" onClick={onClose} aria-label="Fechar modal">×</button></header><div className="student-modal-body">{children}</div></section></div>;
}

function CreateSuccess({ result, onCopy, onAnother }: { result: CreateResult; onCopy: (url?: string) => Promise<void>; onAnother: () => void }) {
  const inviteMessage = result.invite?.deliveryStatus === "SENT"
    ? "Convite enviado por e-mail."
    : result.invite?.deliveryStatus === "FAILED"
      ? "Aluno criado, mas o e-mail não foi enviado. Copie o link abaixo ou tente novamente pelo perfil."
      : "Convite gerado sem envio por e-mail. Copie o link para compartilhar.";
  return <div className="student-create-success"><div className="student-success-icon" aria-hidden="true">✓</div><h3>{result.user.name} foi criado com sucesso.</h3><p>{result.enrollment ? <>Aluno criado e matriculado em <b>{result.enrollment.course.title}</b>.</> : "Nenhum curso foi liberado para este aluno ainda."}</p>{result.invite && <div className="student-success-invite"><span>{inviteMessage}</span><div><input readOnly value={result.invite.url} aria-label="Link de convite" /><button className="btn btn-secondary" type="button" onClick={() => void onCopy(result.invite?.url)}>Copiar</button></div></div>}<div className="student-success-actions">{!result.enrollment && <Link className="btn btn-primary" href={`/admin/students/${result.user.id}#cursos-e-acessos`}>Liberar curso</Link>}<Link className={result.enrollment ? "btn btn-primary" : "btn btn-secondary"} href={`/admin/students/${result.user.id}`}>Abrir perfil</Link><button type="button" onClick={onAnother}>Cadastrar outro</button></div></div>;
}

function StudentRow({ student }: { student: Student }) {
  const activity = student.lastActivityAt || student.lastLoginAt;
  return <tr><td><div className="student-identity"><span>{initials(student.name)}</span><div><b>{student.name}</b><small>{student.email}</small></div></div></td><td><span className={`status ${student.status === "BLOCKED" ? "blocked" : ""}`}>{student.status === "ACTIVE" ? "Ativo" : "Bloqueado"}</span></td><td><b className="student-course-count">{student.activeCourses}</b><small>{student.activeCourses === 1 ? "curso ativo" : "cursos ativos"}</small></td><td><span className={activity ? "" : "muted-text"}>{fmt(activity)}</span></td><td>{student.activeCourses ? <div className="student-list-progress"><div><span style={{ width: `${student.progressPercent}%` }} /></div><b>{student.progressPercent}%</b></div> : <span className="student-no-course">Sem curso</span>}</td><td><Link className="student-row-action" href={`/admin/students/${student.id}`}>Abrir perfil <span>→</span></Link></td></tr>;
}

function StudentMobileCard({ student }: { student: Student }) {
  const activity = student.lastActivityAt || student.lastLoginAt;
  return <article className="student-mobile-card"><div className="student-mobile-head"><div className="student-identity"><span>{initials(student.name)}</span><div><b>{student.name}</b><small>{student.email}</small></div></div><span className={`status ${student.status === "BLOCKED" ? "blocked" : ""}`}>{student.status === "ACTIVE" ? "Ativo" : "Bloqueado"}</span></div><dl><div><dt>Cursos</dt><dd>{student.activeCourses}</dd></div><div><dt>Última atividade</dt><dd>{fmt(activity)}</dd></div><div><dt>Progresso</dt><dd>{student.activeCourses ? `${student.progressPercent}%` : "Sem curso"}</dd></div></dl>{student.activeCourses > 0 && <div className="student-mobile-progress"><span style={{ width: `${student.progressPercent}%` }} /></div>}<Link className="student-row-action" href={`/admin/students/${student.id}`}>Abrir perfil <span>→</span></Link></article>;
}
