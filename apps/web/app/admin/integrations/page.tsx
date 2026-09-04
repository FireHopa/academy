"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";

type Status = {
  video:{active:"PANDA"|"MUX";panda:{configured:boolean;drmConfigured:boolean;drmRequired:boolean};mux:{configured:boolean}};
  themembers:{enabled:boolean;mode:string;apiConfigured:boolean;coursesApiConfigured:boolean;checkoutWebhookConfigured:boolean;platformWebhookConfigured:boolean;accessAutomation:{enabled:boolean;grantEvents:string[];revokeEvents:string[]}};
};
type PandaDiagnostics={connected:boolean;drm_enabled:boolean;webhook_configured:boolean;videos_linked:number;processing_videos:number;error_videos:number};
type PandaTestResponse={ok:boolean;diagnostics:PandaDiagnostics};
type Course={id:string;title:string;status:string};
type Product={id:string;externalId:string;productCode?:string|null;checkoutReferenceId?:string|null;title:string;status?:string|null;lastSyncedAt:string;courses:Array<{course:{id:string;title:string;slug:string;status:string}}>};
type Event={id:string;eventType:string;status:string;receivedAt:string;error?:string|null};
type RemoteLesson={id:string;title:string;subtitle?:string|null;slug:string;blocked:boolean;published:boolean};
type RemoteModule={id:string;title:string;description?:string|null;slug:string;blocked:boolean;published:boolean;lessons:RemoteLesson[]};
type RemoteCourse={id:string;title:string;description?:string|null;status?:string|null;slug:string;blocked:boolean;published:boolean;modules:RemoteModule[];localCourse?:{id:string;title:string;slug:string;status:string;sourceSyncedAt?:string|null}|null};
type RemoteCatalog={courses:RemoteCourse[];totals:{courses:number;modules:number;lessons:number};fetchedAt:string};
type ImportCourseResult={ok:boolean;message:string;localCourse:{id:string;title:string;slug:string;status:string};courseCreated:boolean;modulesCreated:number;modulesUpdated:number;lessonsCreated:number;lessonsUpdated:number};

function DiagnosticItem({label,value,tone="neutral"}:{label:string;value:string|number;tone?:"ok"|"warning"|"error"|"neutral"}){
  return <div className={`panda-diagnostic-item ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function visibilityLabel(published:boolean,blocked:boolean){
  if(blocked)return "Bloqueado";
  return published?"Publicado":"Rascunho";
}

export default function IntegrationsPage(){
  const [status,setStatus]=useState<Status|null>(null);
  const [pandaDiagnostics,setPandaDiagnostics]=useState<PandaDiagnostics|null>(null);
  const [pandaDiagnosticError,setPandaDiagnosticError]=useState("");
  const [products,setProducts]=useState<Product[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [events,setEvents]=useState<Event[]>([]);
  const [remoteCatalog,setRemoteCatalog]=useState<RemoteCatalog|null>(null);
  const [remoteLoading,setRemoteLoading]=useState(false);
  const [remoteError,setRemoteError]=useState("");
  const [openRemoteCourses,setOpenRemoteCourses]=useState<Set<string>>(()=>new Set());
  const [openRemoteModules,setOpenRemoteModules]=useState<Set<string>>(()=>new Set());
  const [importingCourseId,setImportingCourseId]=useState("");
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const [s,p,c,e]=await Promise.all([
        apiFetch<Status>("/admin/integrations/status"),
        apiFetch<Product[]>("/admin/integrations/themembers/products"),
        apiFetch<Course[]>("/admin/courses"),
        apiFetch<Event[]>("/admin/integrations/themembers/events?limit=20"),
      ]);
      setStatus(s);setProducts(p);setCourses(c);setEvents(e);
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha ao carregar integrações");}
  }
  async function loadPandaDiagnostics(){
    setPandaDiagnosticError("");
    try{const result=await apiFetch<{panda:PandaDiagnostics}>("/admin/integrations/panda/diagnostics");setPandaDiagnostics(result.panda);}
    catch(cause){setPandaDiagnostics(current=>current?{...current,connected:false}:current);setPandaDiagnosticError(cause instanceof Error?cause.message:"Falha ao carregar diagnóstico Panda");}
  }
  async function loadRemoteCatalog(){
    setRemoteLoading(true);setRemoteError("");
    try{
      const result=await apiFetch<RemoteCatalog>("/admin/integrations/themembers/courses");
      setRemoteCatalog(result);
      setOpenRemoteCourses(current=>new Set([...current].filter(id=>result.courses.some(course=>course.id===id))));
      const validModules=new Set(result.courses.flatMap(course=>course.modules.map(module=>module.id)));
      setOpenRemoteModules(current=>new Set([...current].filter(id=>validModules.has(id))));
    }catch(cause){setRemoteError(cause instanceof Error?cause.message:"Falha ao consultar cursos da TheMembers");}
    finally{setRemoteLoading(false);}
  }

  useEffect(()=>{void load();void loadPandaDiagnostics();},[]);

  async function action(name:string,fn:()=>Promise<any>){
    setBusy(name);setMessage("");setError("");
    try{const result=await fn();setMessage(typeof result?.message==="string"?result.message:(result?.ok?`${name} concluído.`:"Concluído."));await load();}
    catch(cause){setError(cause instanceof Error?cause.message:"Falha na integração");}
    finally{setBusy("");}
  }
  async function testPandaConnection(){
    setBusy("Teste Panda");setMessage("");setPandaDiagnosticError("");
    try{const result=await apiFetch<PandaTestResponse>("/admin/integrations/panda/test",{method:"POST"});setPandaDiagnostics(result.diagnostics);setMessage("Conexão e diagnóstico Panda atualizados.");}
    catch(cause){setPandaDiagnostics(current=>current?{...current,connected:false}:current);setPandaDiagnosticError(cause instanceof Error?cause.message:"A Panda não respondeu ao teste");}
    finally{setBusy("");}
  }
  async function toggleCourse(product:Product,courseId:string){
    const current=new Set(product.courses.map(item=>item.course.id));current.has(courseId)?current.delete(courseId):current.add(courseId);
    await action(`Mapeamento de ${product.title}`,()=>apiFetch(`/admin/integrations/themembers/products/${product.id}/courses`,{method:"PUT",body:JSON.stringify({courseIds:[...current]})}));
  }
  function toggleTree(setter:typeof setOpenRemoteCourses,id:string){
    setter(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
  }
  async function importRemoteCourse(course:RemoteCourse){
    setImportingCourseId(course.id);setMessage("");setError("");
    try{
      const result=await apiFetch<ImportCourseResult>(`/admin/integrations/themembers/courses/${encodeURIComponent(course.id)}/import`,{method:"POST"});
      setMessage(result.message);
      await Promise.all([load(),loadRemoteCatalog()]);
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha ao importar curso da TheMembers");}
    finally{setImportingCourseId("");}
  }

  const published=useMemo(()=>courses.filter(course=>course.status!=="ARCHIVED"),[courses]);
  const pandaReady=Boolean(status?.video.panda.configured&&pandaDiagnostics?.connected&&pandaDiagnostics.drm_enabled&&pandaDiagnostics.webhook_configured);
  const themembersConfigured=Boolean(status?.themembers.apiConfigured||status?.themembers.coursesApiConfigured);
  const diagnosticPlaceholder=pandaDiagnosticError?"Indisponível":"Verificando";
  const diagnosticCountPlaceholder=pandaDiagnosticError?"N/D":"...";

  return <>
    <div className="eyebrow">Configurações</div>
    <h1 className="admin-title">Integrações</h1>
    <p className="admin-lead">Panda cuida do vídeo. TheMembers fornece produtos, acessos e permite consultar e importar a estrutura dos cursos.</p>
    {error&&<div className="form-error"><GoogleText>{error}</GoogleText></div>}
    {message&&<div className="video-ready-note"><GoogleText>{message}</GoogleText></div>}

    <div className="integration-grid">
      <section className="integration-card panda-integration-card">
        <div className="integration-head"><div><span className="integration-icon">▶</span><div><h2>Panda Video</h2><p>Streaming, biblioteca e DRM/Watermark.</p></div></div><span className={`status ${pandaReady?"":"draft"}`}>{pandaReady?"Operacional":pandaDiagnostics?"Atenção":pandaDiagnosticError?"Indisponível":"Verificando"}</span></div>
        <dl className="integration-meta"><div><dt>Provedor ativo</dt><dd>{status?.video.active||"..."}</dd></div><div><dt>API</dt><dd>{status?.video.panda.configured?"Configurada":"Falta PANDA_API_KEY"}</dd></div><div><dt>Escopo</dt><dd>Conta e vídeos vinculados</dd></div></dl>
        <div className="panda-diagnostics" aria-live="polite"><DiagnosticItem label="Conexão" value={pandaDiagnostics?(pandaDiagnostics.connected?"Online":"Offline"):diagnosticPlaceholder} tone={pandaDiagnostics?(pandaDiagnostics.connected?"ok":"error"):"neutral"}/><DiagnosticItem label="DRM" value={pandaDiagnostics?(pandaDiagnostics.drm_enabled?"Ativo":"Pendente"):diagnosticPlaceholder} tone={pandaDiagnostics?(pandaDiagnostics.drm_enabled?"ok":"warning"):"neutral"}/><DiagnosticItem label="Webhook" value={pandaDiagnostics?(pandaDiagnostics.webhook_configured?"Configurado":"Pendente"):diagnosticPlaceholder} tone={pandaDiagnostics?(pandaDiagnostics.webhook_configured?"ok":"warning"):"neutral"}/><DiagnosticItem label="Vídeos vinculados" value={pandaDiagnostics?.videos_linked??diagnosticCountPlaceholder}/><DiagnosticItem label="Processando" value={pandaDiagnostics?.processing_videos??diagnosticCountPlaceholder} tone={pandaDiagnostics?(pandaDiagnostics.processing_videos>0?"warning":"ok"):"neutral"}/><DiagnosticItem label="Com erro" value={pandaDiagnostics?.error_videos??diagnosticCountPlaceholder} tone={pandaDiagnostics?(pandaDiagnostics.error_videos>0?"error":"ok"):"neutral"}/></div>
        {pandaDiagnosticError&&<div className="panda-diagnostic-error">{pandaDiagnosticError}</div>}
        <button className="btn btn-secondary" disabled={!!busy||!status?.video.panda.configured} onClick={testPandaConnection}>{busy==="Teste Panda"?"Testando...":"Testar conexão"}</button>
        <p className="integration-note">O teste consulta a API Panda em tempo real. Os contadores consideram apenas vídeos Panda vinculados a pelo menos uma aula.</p>
      </section>

      <section className="integration-card">
        <div className="integration-head"><div><span className="integration-icon">TM</span><div><h2>TheMembers</h2><p>Produtos, acessos e estrutura dos cursos.</p></div></div><span className={`status ${themembersConfigured?"":"draft"}`}>{themembersConfigured?"Configurado":"Pendente"}</span></div>
        <dl className="integration-meta"><div><dt>Modo de produtos</dt><dd>{status?.themembers.mode||"..."}</dd></div><div><dt>API de cursos v1</dt><dd>{status?.themembers.coursesApiConfigured?"Configurada":"Falta API Token v1"}</dd></div><div><dt>Webhook Checkout</dt><dd>{status?.themembers.checkoutWebhookConfigured?"OK":"Pendente"}</dd></div><div><dt>Automação de acesso</dt><dd>{status?.themembers.accessAutomation.enabled?"Ativa":"Desligada por segurança"}</dd></div></dl>
        <div className="actions"><button className="btn btn-secondary" disabled={!!busy||!themembersConfigured} onClick={()=>action("Teste TheMembers",()=>apiFetch("/admin/integrations/themembers/test",{method:"POST"}))}>Testar conexão</button><button className="btn btn-secondary" disabled={!!busy||!status?.themembers.apiConfigured} onClick={()=>action("Sincronização de produtos",()=>apiFetch("/admin/integrations/themembers/sync-products",{method:"POST"}))}>Sincronizar produtos</button><button className="btn btn-primary" disabled={remoteLoading||Boolean(importingCourseId)||!status?.themembers.coursesApiConfigured} onClick={()=>void loadRemoteCatalog()}>{remoteLoading?"Consultando...":"Consultar cursos e aulas"}</button></div>
        <p className="integration-note">A importação cria o curso como rascunho e traz módulos, aulas e textos disponíveis. Vídeos, materiais e progresso não são copiados.</p>
      </section>
    </div>

    <div className="section-head"><div><div className="eyebrow">TheMembers API v1</div><h2>Estrutura criada na TheMembers</h2><p>Cursos, módulos e aulas retornados diretamente pela integração.</p></div>{remoteCatalog&&<button className="btn btn-secondary" disabled={remoteLoading||Boolean(importingCourseId)} onClick={()=>void loadRemoteCatalog()}>Atualizar estrutura</button>}</div>
    {remoteError&&<div className="form-error"><GoogleText>{remoteError}</GoogleText></div>}
    {status&&!status.themembers.coursesApiConfigured&&<div className="empty-panel">Configure <b>THEMEMBERS_API_TOKEN</b> com um API Token v1 para consultar a estrutura.</div>}
    {status?.themembers.coursesApiConfigured&&!remoteCatalog&&!remoteLoading&&!remoteError&&<div className="empty-panel">Clique em “Consultar cursos e aulas” para carregar a estrutura da TheMembers.</div>}
    {remoteLoading&&!remoteCatalog&&<div className="empty-panel">Consultando a TheMembers...</div>}
    {remoteCatalog&&<>
      <div className="themembers-catalog-summary"><div><span>Cursos</span><b>{remoteCatalog.totals.courses}</b></div><div><span>Módulos</span><b>{remoteCatalog.totals.modules}</b></div><div><span>Aulas</span><b>{remoteCatalog.totals.lessons}</b></div><small>Atualizado em {new Date(remoteCatalog.fetchedAt).toLocaleString("pt-BR")}</small></div>
      <div className="themembers-course-tree">{remoteCatalog.courses.map(course=>{
        const open=openRemoteCourses.has(course.id);
        const lessons=course.modules.reduce((total,module)=>total+module.lessons.length,0);
        return <section className="themembers-tree-course" key={course.id}>
          <div className="themembers-tree-course-row">
            <button className="themembers-tree-head" type="button" aria-expanded={open} onClick={()=>toggleTree(setOpenRemoteCourses,course.id)}><span className="themembers-tree-chevron">›</span><span><strong><GoogleText>{course.title}</GoogleText></strong><small>ID {course.id} · {course.modules.length} módulos · {lessons} aulas</small></span><em className={course.blocked||!course.published?"warning":""}>{visibilityLabel(course.published,course.blocked)}</em></button>
            <div className="themembers-tree-import-actions">
              {course.localCourse&&<span className="themembers-imported-badge">Importado</span>}
              <button className={`btn ${course.localCourse?"btn-secondary":"btn-primary"}`} type="button" disabled={Boolean(importingCourseId)} onClick={()=>void importRemoteCourse(course)}>{importingCourseId===course.id?"Importando...":course.localCourse?"Atualizar importação":"Importar curso"}</button>
              {course.localCourse&&<Link className="btn btn-secondary" href={`/admin/courses/${course.localCourse.id}`}>Abrir curso</Link>}
            </div>
          </div>
          {open&&<div className="themembers-tree-modules">{course.modules.map(module=>{
            const moduleOpen=openRemoteModules.has(module.id);
            return <div className="themembers-tree-module" key={module.id}><button type="button" aria-expanded={moduleOpen} onClick={()=>toggleTree(setOpenRemoteModules,module.id)}><span className="themembers-tree-chevron">›</span><span><b><GoogleText>{module.title}</GoogleText></b><small>ID {module.id} · {module.lessons.length} {module.lessons.length===1?"aula":"aulas"}</small></span><em className={module.blocked||!module.published?"warning":""}>{visibilityLabel(module.published,module.blocked)}</em></button>{moduleOpen&&<div className="themembers-tree-lessons">{module.lessons.map((lesson,index)=><div key={lesson.id}><span>{String(index+1).padStart(2,"0")}</span><span><b><GoogleText>{lesson.title}</GoogleText></b><small>{lesson.subtitle&&<><GoogleText>{lesson.subtitle}</GoogleText> · </>}ID {lesson.id}</small></span><em className={lesson.blocked||!lesson.published?"warning":""}>{visibilityLabel(lesson.published,lesson.blocked)}</em></div>)}{!module.lessons.length&&<div className="themembers-tree-empty">Nenhuma aula retornada neste módulo.</div>}</div>}</div>;
          })}{!course.modules.length&&<div className="themembers-tree-empty">Nenhum módulo retornado neste curso.</div>}</div>}
        </section>;
      })}{!remoteCatalog.courses.length&&<div className="empty-panel">Nenhum curso encontrado na TheMembers.</div>}</div>
    </>}

    <div className="section-head"><div><div className="eyebrow">TheMembers</div><h2>Produtos → Cursos Casa do Ads</h2></div></div>
    {!products.length?<div className="empty-cell">Nenhum produto sincronizado ainda.</div>:<div className="product-mapping-list">{products.map(product=><section className="mapping-card" key={product.id}><div><h3><GoogleText>{product.title}</GoogleText></h3><small>ID API: {product.externalId}{product.productCode?` · product_id: ${product.productCode}`:""}</small></div><label className="field"><span>Reference ID do Checkout <small>(opcional)</small></span><input key={`${product.id}-${product.checkoutReferenceId||""}`} defaultValue={product.checkoutReferenceId||""} placeholder="Cole aqui se o webhook usar um ID diferente" onBlur={event=>{const value=event.currentTarget.value.trim();if(value!==(product.checkoutReferenceId||""))action(`Reference ID de ${product.title}`,()=>apiFetch(`/admin/integrations/themembers/products/${product.id}/reference`,{method:"PUT",body:JSON.stringify({checkoutReferenceId:value||undefined})}));}} disabled={!!busy}/><small className="field-help">A plataforma tenta casar automaticamente reference_id, product.id e IDs sincronizados. Preencha apenas se uma compra aparecer como product_not_synced.</small></label><div className="course-check-grid">{published.map(course=>{const checked=product.courses.some(item=>item.course.id===course.id);return <label key={course.id} className={checked?"course-check checked":"course-check"}><input type="checkbox" checked={checked} onChange={()=>toggleCourse(product,course.id)} disabled={!!busy}/><span><GoogleText>{course.title}</GoogleText></span></label>;})}</div></section>)}</div>}

    <div className="section-head"><div><div className="eyebrow">Auditoria</div><h2>Últimos webhooks TheMembers</h2></div></div>
    <table className="table"><thead><tr><th>Evento</th><th>Status</th><th>Recebido</th><th>Observação</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{event.eventType}</td><td><span className={`status ${event.status==="FAILED"?"draft":""}`}>{event.status}</span></td><td>{new Date(event.receivedAt).toLocaleString("pt-BR")}</td><td><GoogleText>{event.error||"-"}</GoogleText></td></tr>)}{!events.length&&<tr><td colSpan={4} className="empty-cell">Nenhum webhook recebido.</td></tr>}</tbody></table>
  </>;
}
