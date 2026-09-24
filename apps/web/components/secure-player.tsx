"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GoogleText } from "@/components/google-text";
import { ApiError, API_URL, apiFetch } from "@/lib/api";
import { getDeviceLabel, getOrCreateDeviceFingerprint } from "@/lib/device";

const MuxPlayer = lazy(() => import("@mux/mux-player-react"));

type Playback =
  | { provider: "PANDA"; playerUrl: string; videoExternalId: string }
  | { provider: "MUX"; playbackId: string; tokens: { playback: string; drm: string } }
  | { provider: "YOUTUBE"; videoId: string; embedUrl: string };
type Access = {
  playback: Playback;
  viewer: { id: string; name: string; email: string };
  playbackSession: { id: string; startedAt: string; heartbeatSec: number; device: { id: string; label?: string | null } };
  lesson: { id: string; title: string; description?: string | null; durationSec?: number | null };
  course: { id: string; title: string; slug: string; modules: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string; durationSec?: number | null; videoStatus: string }> }> };
  resources: LessonResources;
};
type LessonResources = {
  lesson:{id:string;title:string;description?:string|null};
  chapters:Array<{id:string;title:string;startSec:number;position:number}>;
  materials:Array<{id:string;title:string;type:string;url:string;position:number}>;
  transcript:{content:string;language:string;updatedAt:string}|null;
  progress:{positionSec:number;completed:boolean;completedAt?:string|null}|null;
};
type ConflictState = { message: string; activeSessions: Array<{ deviceLabel?: string; lessonTitle?: string }> };
type ProgressResponse = { progress:{completed:boolean;positionSec:number}; certificate?:{code:string}|null };

type YoutubeWindow = Window & typeof globalThis & { YT?: any; onYouTubeIframeAPIReady?: () => void };
let youtubePlayerApiPromise: Promise<any> | null = null;
function loadYoutubePlayerApi(){
  if(typeof window==="undefined")return Promise.reject(new Error("YouTube indisponível"));
  const w=window as YoutubeWindow;if(w.YT?.Player)return Promise.resolve(w.YT);if(youtubePlayerApiPromise)return youtubePlayerApiPromise;
  youtubePlayerApiPromise=new Promise((resolve,reject)=>{const previous=w.onYouTubeIframeAPIReady;const timeout=window.setTimeout(()=>{youtubePlayerApiPromise=null;reject(new Error("O player do YouTube demorou demais para carregar."));},15000);w.onYouTubeIframeAPIReady=()=>{try{previous?.();}catch{}window.clearTimeout(timeout);if(w.YT?.Player)resolve(w.YT);else{youtubePlayerApiPromise=null;reject(new Error("Não foi possível iniciar o player do YouTube."));}};if(!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')){const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;script.onerror=()=>{window.clearTimeout(timeout);youtubePlayerApiPromise=null;reject(new Error("Não foi possível carregar o player do YouTube."));};document.head.appendChild(script);}});return youtubePlayerApiPromise;
}

function formatTime(total:number){const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=Math.floor(total%60);return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
function TranscriptText({content,query}:{content:string;query:string}){const paragraphs=content.split(/\n{2,}/).map(v=>v.trim()).filter(Boolean);const q=query.trim().toLocaleLowerCase("pt-BR");const visible=q?paragraphs.filter(p=>p.toLocaleLowerCase("pt-BR").includes(q)):paragraphs;function render(text:string){if(!q)return <GoogleText>{text}</GoogleText>;const lower=text.toLocaleLowerCase("pt-BR");const parts=[];let cursor=0,index=lower.indexOf(q);while(index>=0){parts.push(<GoogleText key={`text-${index}-${cursor}`}>{text.slice(cursor,index)}</GoogleText>);parts.push(<mark key={`${index}-${cursor}`}><GoogleText>{text.slice(index,index+q.length)}</GoogleText></mark>);cursor=index+q.length;index=lower.indexOf(q,cursor);}parts.push(<GoogleText key={`text-end-${cursor}`}>{text.slice(cursor)}</GoogleText>);return parts;}return <div className="transcript-text">{visible.map((p,i)=><p key={i}>{render(p)}</p>)}{q&&!visible.length&&<div className="empty-inline">Nenhum trecho encontrado para “{query}”.</div>}</div>;}

export default function SecurePlayer({ lessonId }: { lessonId: string }) {
  const [data,setData]=useState<Access|null>(null);const [resources,setResources]=useState<LessonResources|null>(null);const [error,setError]=useState("");const [errorCode,setErrorCode]=useState<string|undefined>();const [conflict,setConflict]=useState<ConflictState|null>(null);const [saving,setSaving]=useState(false);const [takingOver,setTakingOver]=useState(false);const [tab,setTab]=useState<"chapters"|"materials"|"transcript">("chapters");const [transcriptQuery,setTranscriptQuery]=useState("");const [certificateCode,setCertificateCode]=useState<string|null>(null);
  const lastSaved=useRef(0);const lastPosition=useRef(0);const muxRef=useRef<any>(null);const pandaRef=useRef<HTMLIFrameElement|null>(null);const youtubeHostRef=useRef<HTMLDivElement|null>(null);const youtubePlayerRef=useRef<any>(null);const sessionIdRef=useRef<string|null>(null);const heartbeatFailures=useRef(0);const resumeApplied=useRef(false);
  const devicePayload=useCallback(()=>({deviceFingerprint:getOrCreateDeviceFingerprint(),deviceLabel:getDeviceLabel()}),[]);

  const openPlayback=useCallback(async(takeover=false)=>{setError("");setErrorCode(undefined);setConflict(null);try{const response=await apiFetch<Access>(`/playback/lessons/${lessonId}/bootstrap${takeover?"/takeover":""}`,{method:"POST",body:JSON.stringify(devicePayload())});sessionIdRef.current=response.playbackSession.id;setResources(response.resources);setData(response);}catch(e){if(e instanceof ApiError){setErrorCode(e.code);if(e.code==="CONCURRENT_STREAM_LIMIT"){const sessions=Array.isArray(e.details.activeSessions)?e.details.activeSessions as ConflictState["activeSessions"]:[];setConflict({message:e.message,activeSessions:sessions});}setError(e.message);}else setError(e instanceof Error?e.message:"Não foi possível abrir esta aula");}},[devicePayload,lessonId]);
  useEffect(()=>{setData(null);setResources(null);setCertificateCode(null);setTranscriptQuery("");resumeApplied.current=false;openPlayback(false);},[openPlayback]);

  const endSession=useCallback((sessionId:string|null)=>{if(!sessionId)return;fetch(`${API_URL}/api/playback/sessions/${sessionId}/end`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}",keepalive:true}).catch(()=>{});},[]);
  const pausePlayer=useCallback(()=>{if(data?.playback.provider==="PANDA"){try{const origin=new URL(data.playback.playerUrl).origin;pandaRef.current?.contentWindow?.postMessage({type:"pause"},origin);}catch{}}else if(data?.playback.provider==="YOUTUBE"){try{youtubePlayerRef.current?.pauseVideo?.();}catch{}}else{try{muxRef.current?.pause?.();}catch{}}},[data]);

  useEffect(()=>{if(!data)return;const sessionId=data.playbackSession.id;sessionIdRef.current=sessionId;const heartbeatMs=Math.max(10000,data.playbackSession.heartbeatSec*1000);const heartbeat=async()=>{try{await apiFetch(`/playback/sessions/${sessionId}/heartbeat`,{method:"POST",body:JSON.stringify({positionSec:Math.floor(lastPosition.current)})});heartbeatFailures.current=0;}catch(e){const authFailure=e instanceof ApiError&&(e.status===401||e.status===403||e.code==="PLAYBACK_SESSION_ENDED");heartbeatFailures.current+=1;if(!authFailure&&heartbeatFailures.current<3)return;pausePlayer();sessionIdRef.current=null;setData(null);setErrorCode(e instanceof ApiError?e.code:"PLAYBACK_SESSION_ENDED");setError(e instanceof Error?e.message:"Esta reprodução perdeu a autorização.");}};const timer=window.setInterval(heartbeat,heartbeatMs);const onPageHide=()=>endSession(sessionId);window.addEventListener("pagehide",onPageHide);return()=>{window.clearInterval(timer);window.removeEventListener("pagehide",onPageHide);endSession(sessionId);if(sessionIdRef.current===sessionId)sessionIdRef.current=null;};},[data,endSession,pausePlayer]);

  async function persistProgress(currentTime:number,duration:number,forceComplete=false){lastPosition.current=currentTime;const now=Date.now();const completed=forceComplete||(duration>0&&currentTime/duration>=.92);const saveInterval=completed?5000:15000;if(!data||saving||resources?.progress?.completed||now-lastSaved.current<saveInterval)return;lastSaved.current=now;setSaving(true);try{if(completed&&sessionIdRef.current){await apiFetch(`/playback/sessions/${sessionIdRef.current}/heartbeat`,{method:"POST",body:JSON.stringify({positionSec:Math.floor(currentTime)})});heartbeatFailures.current=0;}const result=await apiFetch<ProgressResponse>(`/progress/${lessonId}`,{method:"PATCH",body:JSON.stringify({positionSec:Math.floor(currentTime),completed})});if(result.certificate?.code)setCertificateCode(result.certificate.code);setResources(current=>current?{...current,progress:{positionSec:result.progress.positionSec,completed:result.progress.completed,completedAt:result.progress.completed?(current.progress?.completedAt||new Date().toISOString()):null}}:current);}catch{}finally{setSaving(false);}}

  useEffect(()=>{if(!data||data.playback.provider!=="PANDA")return;let origin="";try{origin=new URL(data.playback.playerUrl).origin;}catch{return;}const onMessage=(event:MessageEvent)=>{if(event.source!==pandaRef.current?.contentWindow||event.origin!==origin)return;const payload=event.data as {message?:string;currentTime?:number};if(payload.message==="panda_timeupdate"&&typeof payload.currentTime==="number")persistProgress(payload.currentTime,data.lesson.durationSec||0);if(payload.message==="panda_ended")persistProgress(data.lesson.durationSec||lastPosition.current,data.lesson.durationSec||lastPosition.current,true);if(payload.message==="panda_ready"&&!resumeApplied.current&&resources?.progress&&!resources.progress.completed&&resources.progress.positionSec>5){pandaRef.current?.contentWindow?.postMessage({type:"currentTime",parameter:resources.progress.positionSec},origin);resumeApplied.current=true;}};window.addEventListener("message",onMessage);return()=>window.removeEventListener("message",onMessage);},[data,resources]);

  useEffect(()=>{if(!data||data.playback.provider!=="MUX"||resumeApplied.current||!resources?.progress||resources.progress.completed||resources.progress.positionSec<=5)return;const player=muxRef.current;if(!player||!Number.isFinite(player.duration)||player.duration<=0)return;if(resources.progress.positionSec<player.duration-10){player.currentTime=resources.progress.positionSec;resumeApplied.current=true;}},[resources,data]);

  useEffect(()=>{if(!data||data.playback.provider!=="YOUTUBE"||!youtubeHostRef.current)return;const youtubePlayback=data.playback;const lessonDurationSec=data.lesson.durationSec||0;let disposed=false;let timer:number|undefined;let player:any=null;loadYoutubePlayerApi().then((YT:any)=>{if(disposed||!youtubeHostRef.current)return;player=new YT.Player(youtubeHostRef.current,{videoId:youtubePlayback.videoId,playerVars:{playsinline:1,rel:0,enablejsapi:1,origin:window.location.origin},events:{onReady:(event:any)=>{youtubePlayerRef.current=event.target;const duration=Number(event.target.getDuration())||lessonDurationSec;const resume=resources?.progress&&!resources.progress.completed?resources.progress.positionSec:0;if(!resumeApplied.current&&resume>5&&(!duration||resume<duration-10)){event.target.seekTo(resume,true);resumeApplied.current=true;}timer=window.setInterval(()=>{try{const current=Number(event.target.getCurrentTime())||0;const total=Number(event.target.getDuration())||lessonDurationSec;lastPosition.current=current;if(event.target.getPlayerState()===YT.PlayerState.PLAYING)persistProgress(current,total);}catch{}},1000);},onStateChange:(event:any)=>{if(event.data===YT.PlayerState.ENDED){const duration=Number(event.target.getDuration())||lessonDurationSec||lastPosition.current;persistProgress(duration,duration,true);}},onError:()=>{setErrorCode("YOUTUBE_PLAYBACK_ERROR");setError("O YouTube não permitiu reproduzir este vídeo. Verifique se ele ainda está disponível e com incorporação habilitada.");}}});youtubePlayerRef.current=player;}).catch(error=>{if(!disposed){setErrorCode("YOUTUBE_PLAYBACK_ERROR");setError(error instanceof Error?error.message:"Não foi possível carregar o player do YouTube.");}});return()=>{disposed=true;if(timer)window.clearInterval(timer);if(youtubePlayerRef.current===player)youtubePlayerRef.current=null;try{player?.destroy?.();}catch{}};},[data]);

  const watermark=useMemo(()=>data?`${data.viewer.name} · ${data.viewer.email} · ID ${data.viewer.id}`:"",[data]);
  function seek(startSec:number){if(!data)return;if(data.playback.provider==="PANDA"){try{const origin=new URL(data.playback.playerUrl).origin;pandaRef.current?.contentWindow?.postMessage({type:"currentTime",parameter:startSec},origin);pandaRef.current?.contentWindow?.postMessage({type:"play"},origin);}catch{}}else if(data.playback.provider==="YOUTUBE"){try{youtubePlayerRef.current?.seekTo?.(startSec,true);youtubePlayerRef.current?.playVideo?.();}catch{}}else if(muxRef.current){muxRef.current.currentTime=startSec;muxRef.current.play?.();}}
  async function takeover(){setTakingOver(true);try{await openPlayback(true);}finally{setTakingOver(false);}}

  if(error)return <div className="secure-error"><h2>{errorCode==="DEVICE_LIMIT"?"Limite de dispositivos":errorCode==="CONCURRENT_STREAM_LIMIT"?"Conta em uso":"Não foi possível reproduzir"}</h2><p><GoogleText>{error}</GoogleText></p>{conflict?.activeSessions?.map((session,index)=><div className="session-conflict" key={index}><strong>{session.deviceLabel||"Outro dispositivo"}</strong><span><GoogleText>{session.lessonTitle||"Vídeo em reprodução"}</GoogleText></span></div>)}<div className="actions" style={{justifyContent:"center"}}>{errorCode==="CONCURRENT_STREAM_LIMIT"&&<button className="btn btn-primary" onClick={takeover} disabled={takingOver}>{takingOver?"Encerrando outra sessão...":"Encerrar outra reprodução e continuar"}</button>}{errorCode==="DEVICE_LIMIT"&&<Link className="btn btn-primary" href="/account/security">Gerenciar dispositivos</Link>}<Link className="btn btn-secondary" href="/browse">Voltar para os cursos</Link></div></div>;
  if(!data)return <div className="secure-loading">Validando aparelho, sessão e autorização do vídeo...</div>;

  const allLessons=data.course.modules.flatMap(m=>m.lessons);
  return <main className="watch-shell"><header className="watch-top"><Link href={`/course/${data.course.slug}`}>← Voltar ao curso</Link><strong style={{marginLeft:"auto"}}><GoogleText>{data.lesson.title}</GoogleText></strong></header><div className="watch-grid"><section>
    <div className="secure-player-shell">
      {data.playback.provider==="PANDA"?<iframe ref={pandaRef} src={data.playback.playerUrl} title={data.lesson.title} allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen" allowFullScreen style={{border:0,width:"100%",aspectRatio:"16 / 9",maxHeight:"78vh",display:"block"}}/>:data.playback.provider==="YOUTUBE"?<div className="youtube-player-shell"><div ref={youtubeHostRef}/></div>:<Suspense fallback={<div className="secure-loading">Carregando player protegido...</div>}><MuxPlayer
        ref={muxRef}
        playbackId={data.playback.playbackId}
        tokens={{playback:data.playback.tokens.playback,drm:data.playback.tokens.drm}}
        streamType="on-demand"
        metadata={{video_id:data.lesson.id,video_title:data.lesson.title,viewer_user_id:data.viewer.id}}
        onLoadedMetadata={event=>{
          const player=event.currentTarget as HTMLMediaElement;
          const resume=resources?.progress&&!resources.progress.completed?resources.progress.positionSec:0;
          if(!resumeApplied.current&&resume>5&&resume<player.duration-10){player.currentTime=resume;resumeApplied.current=true;}
        }}
        onTimeUpdate={event=>{
          const player=event.currentTarget as HTMLMediaElement;
          persistProgress(player.currentTime,player.duration);
        }}
        onEnded={event=>{
          const player=event.currentTarget as HTMLMediaElement;
          persistProgress(player.duration,player.duration,true);
        }}
        style={{width:"100%",aspectRatio:"16 / 9",maxHeight:"78vh"}}
      /></Suspense>}
      <div className="viewer-watermark" aria-hidden>{watermark}</div>
    </div>
    {certificateCode&&<div className="certificate-earned"><div><b>Curso concluído. Certificado emitido.</b><span>Seu certificado já está disponível na conta.</span></div><Link className="btn btn-primary" href={`/certificate/${certificateCode}`}>Ver certificado</Link></div>}
    <div className="watch-copy"><div className="eyebrow"><GoogleText>{data.course.title}</GoogleText></div><h2><GoogleText>{data.lesson.title}</GoogleText></h2><p><GoogleText>{resources?.lesson.description||data.lesson.description||"Aula protegida."}</GoogleText></p><div className="playback-security-line">Reprodução via <strong>{data.playback.provider}</strong> autorizada em <strong>{data.playbackSession.device.label||"este dispositivo"}</strong>.</div></div>
    <section className="lesson-resources"><div className="resource-tabs"><button className={tab==="chapters"?"active":""} onClick={()=>setTab("chapters")}>Capítulos <span>{resources?.chapters.length||0}</span></button><button className={tab==="materials"?"active":""} onClick={()=>setTab("materials")}>Materiais <span>{resources?.materials.length||0}</span></button><button className={tab==="transcript"?"active":""} onClick={()=>setTab("transcript")}>Transcrição</button></div>
      {tab==="chapters"&&<div className="chapter-list">{resources?.chapters.map(chapter=><button key={chapter.id} className="chapter-row" onClick={()=>seek(chapter.startSec)}><span>{formatTime(chapter.startSec)}</span><b><GoogleText>{chapter.title}</GoogleText></b><em>▶</em></button>)}{resources&&!resources.chapters.length&&<div className="empty-inline">Esta aula ainda não possui capítulos.</div>}</div>}
      {tab==="materials"&&<div className="material-grid">{resources?.materials.map(material=><a className="material-card" href={material.url} target="_blank" rel="noreferrer" key={material.id}><span><GoogleText>{material.type}</GoogleText></span><b><GoogleText>{material.title}</GoogleText></b><small>Abrir material ↗</small></a>)}{resources&&!resources.materials.length&&<div className="empty-inline">Nenhum material complementar nesta aula.</div>}</div>}
      {tab==="transcript"&&<div className="transcript-panel">{resources?.transcript?<><div className="transcript-search"><input value={transcriptQuery} onChange={e=>setTranscriptQuery(e.target.value)} placeholder="Buscar dentro da transcrição..."/><span>{resources.transcript.language}</span></div><TranscriptText content={resources.transcript.content} query={transcriptQuery}/></>:<div className="empty-inline">A transcrição desta aula ainda não foi adicionada.</div>}</div>}
    </section>
  </section><aside className="playlist"><h3 style={{marginTop:0}}>Conteúdo do curso</h3>{allLessons.map((lesson,index)=><Link href={`/watch/${lesson.id}`} className="lesson" key={lesson.id} style={{opacity:lesson.id===lessonId?1:.68}}><span className="lesson-num">{String(index+1).padStart(2,"0")}</span><div className="lesson-main"><strong><GoogleText>{lesson.title}</GoogleText></strong><span>{lesson.id===lessonId?"Reproduzindo":lesson.videoStatus==="READY"?"Disponível":"Em preparação"}</span></div><span className="lesson-time">{lesson.durationSec?`${Math.floor(lesson.durationSec/60)} min`:""}</span></Link>)}</aside></div></main>;
}
