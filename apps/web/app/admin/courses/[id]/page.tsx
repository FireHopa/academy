"use client";

import { FormEvent, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import VideoUploader, { type VideoIntegrationStatus } from "../../../../components/admin/video-uploader";
import { ImageUploadField } from "../../../../components/admin/image-upload-field";
import { AdminIcon } from "../../../../components/admin/admin-icon";
import { SortableHandle, SortableList } from "../../../../components/admin/sortable-list";
import { GoogleText } from "../../../../components/google-text";

type Lesson = {
  id: string;
  title: string;
  description?: string;
  position: number;
  durationSec?: number | null;
  published: boolean;
  preview: boolean;
  videoUploadId?: string | null;
  videoAssetId?: string | null;
  videoPlaybackId?: string | null;
  videoStatus: "EMPTY" | "UPLOADING" | "PROCESSING" | "READY" | "ERROR";
  videoError?: string | null;
  videoResource?: { id:string; provider:"PANDA"|"MUX"|"YOUTUBE"; providerAssetId:string; thumbnailUrl?:string|null; status?:string; durationSec?:number|null; error?:string|null } | null;
};

type CourseModule = {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
};

type Course = {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  heroImageUrl?: string;
  cardImageUrl?: string;
  status: string;
  featured: boolean;
  certificateEnabled: boolean;
  certificateTitle?: string | null;
  modules: CourseModule[];
};

export default function CourseEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [moduleTitle, setModuleTitle] = useState("");
  const [newLessonFor, setNewLessonFor] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [reordering, setReordering] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());
  const [videoIntegration, setVideoIntegration] = useState<VideoIntegrationStatus | null>(null);

  const load = () =>
    apiFetch<Course>(`/admin/courses/${id}`)
      .then(data => {
        setCourse(data);
        setExpandedModules(current => new Set([...current].filter(moduleId => data.modules.some(module => module.id === moduleId))));
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    apiFetch<VideoIntegrationStatus>("/admin/integrations/status")
      .then(setVideoIntegration)
      .catch(cause => setError(cause instanceof Error ? cause.message : "Não foi possível carregar a configuração de vídeo"));
  }, [id]);

  async function saveCourse(e: FormEvent) {
    e.preventDefault();
    if (!course) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/courses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: course.title,
          shortDescription: course.shortDescription || "",
          description: course.description || "",
          heroImageUrl: course.heroImageUrl || "",
          cardImageUrl: course.cardImageUrl || "",
          featured: course.featured,
          certificateEnabled: course.certificateEnabled,
          certificateTitle: course.certificateTitle || "",
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!course) return;
    try {
      await apiFetch(`/admin/courses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar status");
    }
  }

  async function addModule(e: FormEvent) {
    e.preventDefault();
    if (!moduleTitle.trim()) return;
    try {
      const created = await apiFetch<CourseModule>(`/admin/courses/${id}/modules`, {
        method: "POST",
        body: JSON.stringify({ title: moduleTitle }),
      });
      setModuleTitle("");
      setExpandedModules(current => new Set(current).add(created.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar módulo");
    }
  }

  async function renameModule(module: CourseModule) {
    const title = window.prompt("Novo nome do módulo", module.title)?.trim();
    if (!title || title === module.title) return;
    await apiFetch(`/admin/modules/${module.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    await load();
  }

  async function addLesson(e: FormEvent, moduleId: string) {
    e.preventDefault();
    if (!lessonTitle.trim()) return;
    try {
      await apiFetch(`/admin/modules/${moduleId}/lessons`, {
        method: "POST",
        body: JSON.stringify({ title: lessonTitle, published: false }),
      });
      setLessonTitle("");
      setNewLessonFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar aula");
    }
  }

  async function renameLesson(lesson: Lesson) {
    const title = window.prompt("Novo nome da aula", lesson.title)?.trim();
    if (!title || title === lesson.title) return;
    await apiFetch(`/admin/lessons/${lesson.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    await load();
  }

  function toggleModule(moduleId: string) {
    setExpandedModules(current => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  async function toggleLesson(lesson: Lesson) {
    await apiFetch(`/admin/lessons/${lesson.id}`, {
      method: "PATCH",
      body: JSON.stringify({ published: !lesson.published }),
    });
    await load();
  }

  async function deleteLesson(lesson: Lesson) {
    if (!window.confirm(`Excluir a aula “${lesson.title}”?`)) return;
    await apiFetch(`/admin/lessons/${lesson.id}`, { method: "DELETE" });
    await load();
  }

  async function deleteModule(module: CourseModule) {
    if (!window.confirm(`Excluir o módulo “${module.title}” e todas as aulas dele?`)) return;
    await apiFetch(`/admin/modules/${module.id}`, { method: "DELETE" });
    await load();
  }

  async function deleteCourse() {
    if (!course || deleting) return;
    const confirmation = window.prompt(
      `Esta ação é permanente e removerá módulos, aulas, matrículas, progresso e certificados vinculados.\n\nDigite exatamente “${course.title}” para confirmar:`,
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== course.title.trim()) {
      setError("O nome digitado não corresponde ao curso. A exclusão foi cancelada.");
      return;
    }

    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/admin/courses/${id}`, { method: "DELETE" });
      router.push("/admin/courses");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o curso");
      setDeleting(false);
    }
  }

  async function reorderModules(items: CourseModule[]) {
    if (!course || reordering) return;
    const previous = course.modules;
    const ordered = items.map((module, index) => ({ ...module, position: index + 1 }));
    setCourse(current => current ? { ...current, modules: ordered } : current);
    setReordering("modules");
    setError("");
    try {
      await apiFetch(`/admin/courses/${id}/modules/reorder`, {
        method: "PUT",
        body: JSON.stringify({ items: ordered.map(module => ({ id: module.id, position: module.position })) }),
      });
    } catch (cause) {
      setCourse(current => current ? { ...current, modules: previous } : current);
      setError(cause instanceof Error ? cause.message : "Não foi possível reordenar os módulos");
    } finally {
      setReordering(null);
    }
  }

  async function reorderLessons(module: CourseModule, items: Lesson[]) {
    if (reordering) return;
    const previous = module.lessons;
    const ordered = items.map((lesson, index) => ({ ...lesson, position: index + 1 }));
    setCourse(current => current ? { ...current, modules: current.modules.map(item => item.id === module.id ? { ...item, lessons: ordered } : item) } : current);
    setReordering(`lessons:${module.id}`);
    setError("");
    try {
      await apiFetch(`/admin/modules/${module.id}/lessons/reorder`, {
        method: "PUT",
        body: JSON.stringify({ items: ordered.map(lesson => ({ id: lesson.id, position: lesson.position })) }),
      });
    } catch (cause) {
      setCourse(current => current ? { ...current, modules: current.modules.map(item => item.id === module.id ? { ...item, lessons: previous } : item) } : current);
      setError(cause instanceof Error ? cause.message : "Não foi possível reordenar as aulas");
    } finally {
      setReordering(null);
    }
  }

  if (!course) {
    return (
      <p>{error || "Carregando curso..."}</p>
    );
  }

  return (
    <>
      <div className="editor-head">
        <div>
          <Link className="back-link" href="/admin/courses">← Cursos</Link>
          <h1><GoogleText>{course.title}</GoogleText></h1>
          <p>/{course.slug}</p>
        </div>
        <div className="actions">
          <span className={`status ${course.status === "DRAFT" ? "draft" : ""}`}>
            {course.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
          </span>
          <button className="btn btn-secondary" onClick={togglePublish}>
            {course.status === "PUBLISHED" ? "Voltar para rascunho" : "Publicar curso"}
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="editor-grid">
        <div>
          <form className="editor-card" onSubmit={saveCourse}>
            <div className="section-head">
              <h2>Informações do curso</h2>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>

            <label className="field">
              <span>Título</span>
              <input value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Descrição curta</span>
              <input value={course.shortDescription || ""} onChange={(e) => setCourse({ ...course, shortDescription: e.target.value })} />
            </label>
            <label className="field">
              <span>Descrição completa</span>
              <textarea rows={5} value={course.description || ""} onChange={(e) => setCourse({ ...course, description: e.target.value })} />
            </label>
            <div className="two-cols">
              <ImageUploadField
                label="Capa horizontal"
                help="Recomendado: 1280 × 720px, proporção 16:9."
                value={course.cardImageUrl}
                seed={`course-card:${course.id}`}
                uploadPath={`/admin/courses/${id}/images/card`}
                directPreset="course-card"
                onChange={cardImageUrl => setCourse(current => current ? { ...current, cardImageUrl } : current)}
                onExternalUrlSave={cardImageUrl => apiFetch(`/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify({ cardImageUrl }) })}
              />
              <ImageUploadField
                label="Banner do curso"
                help="Recomendado: 1920 × 1080px, proporção 16:9."
                value={course.heroImageUrl}
                seed={`course-hero:${course.id}`}
                uploadPath={`/admin/courses/${id}/images/hero`}
                directPreset="course-hero"
                onChange={heroImageUrl => setCourse(current => current ? { ...current, heroImageUrl } : current)}
                onExternalUrlSave={heroImageUrl => apiFetch(`/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify({ heroImageUrl }) })}
              />
            </div>
            <label className="check-field">
              <input type="checkbox" checked={course.featured} onChange={(e) => setCourse({ ...course, featured: e.target.checked })} />
              <span>Destacar este curso na Home</span>
            </label>
            <div className="certificate-admin-box">
              <label className="check-field">
                <input type="checkbox" checked={course.certificateEnabled} onChange={(e) => setCourse({ ...course, certificateEnabled: e.target.checked })} />
                <span>Emitir certificado quando o aluno concluir 100% das aulas publicadas</span>
              </label>
              {course.certificateEnabled && <label className="field">
                <span>Título exibido no certificado</span>
                <input value={course.certificateTitle || ""} onChange={(e) => setCourse({ ...course, certificateTitle: e.target.value })} placeholder="Ex.: Formação em mídia paga + Inteligência Artificial" />
              </label>}
            </div>
          </form>

          <div className="editor-card">
            <div className="section-head course-content-head">
              <div>
                <h2>Aulas do curso</h2>
                <p>Arraste módulos e aulas pela alça para mudar a ordem.</p>
              </div>
            </div>

            <form className="inline-form module-create module-create-top" onSubmit={addModule}>
              <input required value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="Nome do novo módulo" />
              <button className="btn btn-primary">＋ Criar módulo</button>
            </form>

            <SortableList
              items={course.modules}
              getId={module => module.id}
              getLabel={module => `Módulo ${module.title}`}
              disabled={reordering !== null}
              onReorder={reorderModules}
              renderItem={(module, moduleIndex, moduleSort) => {
                const expanded = expandedModules.has(module.id);
                const contentId = `module-content-${module.id}`;
                return <section {...moduleSort.itemProps} className={`module-admin ${expanded ? "is-open" : "is-collapsed"} ${moduleSort.stateClassName}`.trim()} key={module.id}>
                <div className="module-admin-head">
                  <div className="module-admin-title">
                    <SortableHandle label={`módulo ${module.title}`} {...moduleSort.handleProps}/>
                    <button className="module-collapse-toggle" type="button" onClick={() => toggleModule(module.id)} aria-expanded={expanded} aria-controls={contentId}>
                      <span>
                        <small>MÓDULO {moduleIndex + 1}</small>
                        <h3><GoogleText>{module.title}</GoogleText></h3>
                        <em>{module.lessons.length} {module.lessons.length === 1 ? "aula" : "aulas"}</em>
                      </span>
                      <AdminIcon name="chevron" size={18}/>
                    </button>
                  </div>
                  <div className="compact-actions">
                    <button type="button" onClick={() => renameModule(module)}>Renomear módulo</button>
                    <button type="button" className="danger-link" onClick={() => deleteModule(module)}>Excluir</button>
                  </div>
                </div>

                {expanded && <div className="module-admin-content" id={contentId}>
                <div className="lesson-admin-list">
                  <SortableList
                    items={module.lessons}
                    getId={lesson => lesson.id}
                    getLabel={lesson => `Aula ${lesson.title}`}
                    disabled={reordering !== null}
                    onReorder={items => reorderLessons(module, items)}
                    renderItem={(lesson, lessonIndex, lessonSort) => <div {...lessonSort.itemProps} className={`lesson-admin ${lessonSort.stateClassName}`.trim()} key={lesson.id}>
                      <SortableHandle label={`aula ${lesson.title}`} {...lessonSort.handleProps}/>
                      <div className="lesson-order">{lessonIndex + 1}</div>
                      <div className="lesson-admin-main">
                        <b><GoogleText>{lesson.title}</GoogleText></b>
                        <span>{lesson.published ? "Aula publicada" : "Aula em rascunho"} · {lesson.videoStatus === "READY" ? (lesson.videoResource?.provider === "YOUTUBE" ? "vídeo YouTube pronto" : "vídeo DRM pronto") : lesson.videoStatus === "PROCESSING" ? "vídeo processando" : lesson.videoStatus === "UPLOADING" ? "upload iniciado" : lesson.videoStatus === "ERROR" ? "erro no vídeo" : "sem vídeo"}</span>
                      </div>
                      <div className="compact-actions lesson-secondary-actions">
                        <button type="button" onClick={() => renameLesson(lesson)}>Renomear aula</button>
                        <button type="button" className="danger-link" onClick={() => deleteLesson(lesson)}>Excluir</button>
                      </div>
                      <div className="lesson-feature-actions">
                        <button
                          type="button"
                          className={`lesson-visibility-toggle ${lesson.published ? "is-visible" : "is-hidden"}`}
                          onClick={() => toggleLesson(lesson)}
                          aria-label={lesson.published ? "Ocultar aula" : "Publicar aula"}
                          title={lesson.published ? "Aula visível. Clique para ocultar." : "Aula oculta. Clique para publicar."}
                        ><AdminIcon name={lesson.published ? "eye" : "eyeOff"} size={18}/></button>
                        <Link className="lesson-content-link" href={`/admin/lessons/${lesson.id}`}><AdminIcon name="content" size={17}/><span>Editar aula</span></Link>
                      </div>
                      <div className="lesson-video-row">
                        <VideoUploader lessonId={lesson.id} initial={lesson} integration={videoIntegration} onChanged={load} />
                      </div>
                    </div>}
                  />
                  {!module.lessons.length && <div className="empty-inline">Nenhuma aula neste módulo.</div>}
                </div>

                {newLessonFor === module.id ? (
                  <form className="inline-form" onSubmit={(e) => addLesson(e, module.id)}>
                    <input autoFocus required value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Nome da aula" />
                    <button className="btn btn-primary">Adicionar</button>
                    <button className="btn btn-secondary" type="button" onClick={() => setNewLessonFor(null)}>Cancelar</button>
                  </form>
                ) : (
                  <button className="add-link" onClick={() => { setNewLessonFor(module.id); setLessonTitle(""); }}>
                    ＋ Adicionar aula
                  </button>
                )}
                </div>}
              </section>;
              }}
            />
            {!course.modules.length && <div className="empty-inline empty-modules">Nenhum módulo criado ainda.</div>}
          </div>

          <section className="editor-card course-danger-zone">
            <div>
              <small>AÇÃO PERMANENTE</small>
              <h2>Excluir curso</h2>
              <p>Remove o curso e todos os módulos, aulas, matrículas, progresso e certificados vinculados. Esta ação não pode ser desfeita.</p>
            </div>
            <button className="btn btn-danger" type="button" disabled={deleting} onClick={() => void deleteCourse()}>
              {deleting ? "Excluindo..." : "Excluir curso"}
            </button>
          </section>
        </div>

        <aside className="editor-side">
          <div className="side-card">
            <h3>Segurança do vídeo</h3>
            <p>
              Cada aula recebe vídeos pela Biblioteca Panda. A API Key permanece exclusiva no servidor, e o player só é liberado após validar matrícula, dispositivo e sessão.
            </p>
            <div className="security-note">Vídeo: Panda Video + DRM/Watermark + autorização por sessão. Nenhuma API Key, URL privada ou arquivo MP4 público é exposto.</div>
          </div>
        </aside>
      </div>
    </>
  );
}
