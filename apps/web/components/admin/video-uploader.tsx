"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const MuxUploader = lazy(() => import("@mux/mux-uploader-react"));

type VideoState = {
  provider?: "PANDA"|"MUX"|null;
  videoStatus: "EMPTY"|"UPLOADING"|"PROCESSING"|"READY"|"ERROR";
  videoError?: string|null;
  durationSec?: number|null;
  videoResource?: { id:string; provider:"PANDA"|"MUX"; providerAssetId:string; thumbnailUrl?:string|null }|null;
  videoUploadId?:string|null;
  videoAssetId?:string|null;
  videoPlaybackId?:string|null;
};
type PandaVideo={providerAssetId:string;thumbnailUrl?:string|null;durationSec?:number|null;status:string;metadata?:{title?:string|null;pandaStatus?:string|null}|null};
type PandaLibrary={videos:PandaVideo[];page:number;limit:number;hasMore:boolean};
export type VideoIntegrationStatus={video:{active:"PANDA"|"MUX";panda:{configured:boolean}}};

const pandaStatusLabel:Record<string,string>={READY:"Pronto",PROCESSING:"Processando",UPLOADING:"Enviando",ERROR:"Erro"};
function formatDuration(seconds?:number|null){if(!seconds)return "";const minutes=Math.floor(seconds/60);return `${minutes}:${String(seconds%60).padStart(2,"0")}`;}

export default function VideoUploader({lessonId,initial,integration,onChanged}:{lessonId:string;initial:VideoState;integration:VideoIntegrationStatus|null;onChanged?:()=>void}){
  const [state,setState]=useState<VideoState>(initial);const [endpoint,setEndpoint]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [library,setLibrary]=useState<PandaLibrary|null>(null);const [query,setQuery]=useState("");const [pandaStatus,setPandaStatus]=useState("");const pollRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const activeProvider=integration?.video.active??"PANDA";const pandaConfigured=integration?.video.panda.configured??null;
  useEffect(()=>setState(initial),[initial]);
  useEffect(()=>()=>{if(pollRef.current)clearInterval(pollRef.current);},[]);

  async function refresh(){try{const next=await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/status`);setState(next);if(["READY","ERROR","EMPTY"].includes(next.videoStatus)){if(pollRef.current)clearInterval(pollRef.current);pollRef.current=null;onChanged?.();}}catch{}}
  function startPolling(){if(pollRef.current)clearInterval(pollRef.current);pollRef.current=setInterval(refresh,3500);}
  async function prepareMuxUpload(){setBusy(true);setError("");try{const result=await apiFetch<{endpoint:string;uploadId:string}>(`/admin/lessons/${lessonId}/video/upload`,{method:"POST"});setEndpoint(result.endpoint);setState({...state,videoUploadId:result.uploadId,videoStatus:"UPLOADING",videoError:null});}catch(e){setError(e instanceof Error?e.message:"Falha ao preparar upload");}finally{setBusy(false);}}
  async function loadPanda(page=1){setBusy(true);setError("");try{const params=new URLSearchParams({page:String(page)});if(query.trim())params.set("title",query.trim());if(pandaStatus)params.set("status",pandaStatus);setLibrary(await apiFetch<PandaLibrary>(`/admin/integrations/panda/videos?${params.toString()}`));}catch(e){setError(e instanceof Error?e.message:"Não foi possível carregar a Biblioteca Panda");}finally{setBusy(false);}}
  async function attach(videoId:string){setBusy(true);setError("");try{const next=await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/panda/attach`,{method:"POST",body:JSON.stringify({videoId})});setState(next);setLibrary(null);onChanged?.();}catch(e){setError(e instanceof Error?e.message:"Falha ao vincular vídeo Panda");}finally{setBusy(false);}}
  async function refreshPanda(){setBusy(true);try{setState(await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/panda/refresh`,{method:"POST"}));onChanged?.();}catch(e){setError(e instanceof Error?e.message:"Falha ao atualizar vídeo");}finally{setBusy(false);}}
  const currentProvider=state.provider??state.videoResource?.provider??null;
  async function removeVideo(){if(!window.confirm(currentProvider==="PANDA"?"Desvincular este vídeo da aula? O arquivo NÃO será apagado do Panda.":"Remover este vídeo da aula?"))return;setBusy(true);setError("");try{await apiFetch(`/admin/lessons/${lessonId}/video`,{method:"DELETE"});setEndpoint(null);setState({videoStatus:"EMPTY"});setLibrary(null);onChanged?.();}catch(e){setError(e instanceof Error?e.message:"Falha ao remover vídeo");}finally{setBusy(false);}}
  const label={EMPTY:"Sem vídeo",UPLOADING:"Enviando",PROCESSING:"Processando",READY:"Pronto",ERROR:"Erro"}[state.videoStatus];

  return <div className="video-admin-box"><div className="video-admin-head"><div><strong>Vídeo protegido</strong><span className={`video-pill ${state.videoStatus.toLowerCase()}`}>{label}</span>{currentProvider&&<span className="video-provider-badge">{currentProvider}</span>}</div>{state.durationSec?<small>{Math.floor(state.durationSec/60)}:{String(state.durationSec%60).padStart(2,"0")}</small>:null}</div>
    {state.videoResource?.thumbnailUrl&&<img src={state.videoResource.thumbnailUrl} alt="Thumbnail" style={{width:180,maxWidth:"100%",borderRadius:8,margin:"10px 0"}}/>}
    {state.videoStatus==="READY"&&<div className="video-ready-note">🔒 Vídeo vinculado ao provedor. A liberação final continua passando por matrícula, dispositivo e sessão da Casa do Ads.</div>}
    {state.videoStatus==="PROCESSING"&&<div className="video-processing">O provedor ainda está processando o vídeo.</div>}
    {state.videoStatus==="ERROR"&&<div className="form-error">{state.videoError||"Erro ao processar vídeo."}</div>}{error&&<div className="form-error">{error}</div>}

    {state.videoStatus==="EMPTY"&&activeProvider==="PANDA"&&<div className="panda-library-picker"><p className="muted">Por segurança, a API key do Panda não é enviada ao navegador. Faça o upload no Panda e vincule o vídeo pela biblioteca.</p>{pandaConfigured===false&&<div className="form-error">Configure a PANDA_API_KEY no servidor antes de abrir a biblioteca.</div>}<div className="inline-form"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();loadPanda(1);}}} placeholder="Buscar vídeo por título" maxLength={120}/><select value={pandaStatus} onChange={e=>setPandaStatus(e.target.value)} aria-label="Filtrar por status"><option value="">Todos os status</option><option value="CONVERTED">Prontos</option><option value="CONVERTING">Processando</option><option value="DRAFT">Rascunhos</option><option value="FAILED">Com falha</option><option value="BLOCKED">Bloqueados</option><option value="DELETING">Em exclusão</option></select><button type="button" className="btn btn-secondary" onClick={()=>loadPanda(1)} disabled={busy||pandaConfigured===false}>{busy?"Carregando...":"Abrir Biblioteca Panda"}</button></div></div>}
    {library&&<><div className="panda-video-grid">{library.videos.map(video=>{const title=video.metadata?.title||"Vídeo sem título";return <button type="button" className="panda-video-card" key={video.providerAssetId} onClick={()=>attach(video.providerAssetId)} disabled={busy||video.status==="ERROR"}>{video.thumbnailUrl?<img src={video.thumbnailUrl} alt={`Thumbnail de ${title}`}/>:<div className="panda-video-placeholder">▶</div>}<span><b>{title}</b><small>{pandaStatusLabel[video.status]||video.status}{video.durationSec?` · ${formatDuration(video.durationSec)}`:""}</small></span></button>;})}{!library.videos.length&&<div className="empty-inline">Nenhum vídeo encontrado com estes filtros.</div>}</div>{(library.page>1||library.hasMore)&&<div className="panda-library-pagination"><button type="button" className="mini-button" disabled={busy||library.page<=1} onClick={()=>loadPanda(library.page-1)}>Página anterior</button><span>Página {library.page}</span><button type="button" className="mini-button" disabled={busy||!library.hasMore} onClick={()=>loadPanda(library.page+1)}>Próxima página</button></div>}</>}

    {state.videoStatus==="EMPTY"&&activeProvider==="MUX"&&!endpoint&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={prepareMuxUpload}>{busy?"Preparando...":"Selecionar vídeo"}</button>}
    {endpoint&&<div className="mux-uploader-wrap"><Suspense fallback={<div className="video-processing">Carregando componente de upload...</div>}><MuxUploader endpoint={endpoint} pausable onSuccess={()=>{setEndpoint(null);setState({...state,videoStatus:"PROCESSING"});startPolling();}} onUploadError={(event)=>setError((event as CustomEvent)?.detail?.message||"Falha no upload")}/></Suspense></div>}

    {state.videoStatus!=="EMPTY"&&<div className="video-actions">{currentProvider==="PANDA"&&<button type="button" className="mini-button" onClick={refreshPanda} disabled={busy}>Atualizar do Panda</button>}<button type="button" className="danger-text" disabled={busy} onClick={removeVideo}>{currentProvider==="PANDA"?"Desvincular vídeo":"Remover vídeo"}</button></div>}
  </div>;
}
