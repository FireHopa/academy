"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const MuxUploader = lazy(() => import("@mux/mux-uploader-react"));

type VideoProvider = "PANDA" | "MUX" | "YOUTUBE";
type VideoState = {
  provider?: VideoProvider | null;
  videoStatus: "EMPTY" | "UPLOADING" | "PROCESSING" | "READY" | "ERROR";
  videoError?: string | null;
  durationSec?: number | null;
  videoResource?: { id: string; provider: VideoProvider; providerAssetId: string; thumbnailUrl?: string | null } | null;
  videoUploadId?: string | null;
  videoAssetId?: string | null;
  videoPlaybackId?: string | null;
};
type PandaVideo = { providerAssetId: string; thumbnailUrl?: string | null; durationSec?: number | null; status: string; metadata?: { title?: string | null; pandaStatus?: string | null } | null };
type PandaLibrary = { videos: PandaVideo[]; page: number; limit: number; hasMore: boolean };
export type VideoIntegrationStatus = { video: { active: "PANDA" | "MUX"; panda: { configured: boolean }; youtube?: { enabled: boolean } } };

type YoutubeWindow = Window & typeof globalThis & {
  YT?: any;
  onYouTubeIframeAPIReady?: () => void;
};

const pandaStatusLabel: Record<string, string> = { READY: "Pronto", PROCESSING: "Processando", UPLOADING: "Enviando", ERROR: "Erro" };
const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
let youtubeApiPromise: Promise<any> | null = null;

function formatDuration(seconds?: number | null) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function parseYoutubeId(input: string) {
  const raw = input.trim();
  if (!raw) return null;
  if (youtubeIdPattern.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    let candidate = "";
    if (host === "youtu.be" || host === "www.youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") candidate = url.searchParams.get("v") || "";
      else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0] || "")) candidate = parts[1] || "";
      }
    }
    return youtubeIdPattern.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function loadYoutubeIframeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("YouTube indisponível neste ambiente"));
  const w = window as YoutubeWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error("O YouTube demorou demais para responder. Tente novamente."));
    }, 15000);

    w.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } catch {}
      window.clearTimeout(timeout);
      if (w.YT?.Player) resolve(w.YT);
      else {
        youtubeApiPromise = null;
        reject(new Error("Não foi possível carregar o player do YouTube."));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        youtubeApiPromise = null;
        reject(new Error("Não foi possível acessar a API de reprodução do YouTube."));
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

async function readYoutubeDuration(videoId: string) {
  const YT = await loadYoutubeIframeApi();
  return new Promise<number>((resolve, reject) => {
    const mount = document.createElement("div");
    mount.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:320px;height:180px;opacity:0;pointer-events:none";
    document.body.appendChild(mount);
    let player: any = null;
    const timeout = window.setTimeout(() => finish(new Error("Não foi possível validar a duração do vídeo.")), 15000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      try { player?.destroy?.(); } catch {}
      try { mount.remove(); } catch {}
    };
    const finish = (error?: Error, duration?: number) => {
      cleanup();
      if (error) reject(error);
      else if (duration && duration > 0) resolve(duration);
      else reject(new Error("O YouTube não informou a duração deste vídeo."));
    };

    player = new YT.Player(mount, {
      width: 320,
      height: 180,
      videoId,
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: (event: any) => {
          const duration = Math.round(Number(event.target.getDuration()) || 0);
          finish(undefined, duration);
        },
        onError: (event: any) => {
          const code = Number(event?.data);
          const message = code === 100
            ? "Este vídeo foi removido ou está privado."
            : code === 101 || code === 150
              ? "Este vídeo não permite reprodução incorporada em outros sites."
              : "Não foi possível validar este vídeo do YouTube.";
          finish(new Error(message));
        },
      },
    });
  });
}

export default function VideoUploader({ lessonId, initial, integration, onChanged }: { lessonId: string; initial: VideoState; integration: VideoIntegrationStatus | null; onChanged?: () => void }) {
  const [state, setState] = useState<VideoState>(initial);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [library, setLibrary] = useState<PandaLibrary | null>(null);
  const [query, setQuery] = useState("");
  const [pandaStatus, setPandaStatus] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeChecking, setYoutubeChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeProvider = integration?.video.active ?? "PANDA";
  const pandaConfigured = integration?.video.panda.configured ?? null;
  const youtubeId = useMemo(() => parseYoutubeId(youtubeUrl), [youtubeUrl]);

  useEffect(() => setState(initial), [initial]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function refresh() {
    try {
      const next = await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/status`);
      setState(next);
      if (["READY", "ERROR", "EMPTY"].includes(next.videoStatus)) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        onChanged?.();
      }
    } catch {}
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(refresh, 3500);
  }

  async function prepareMuxUpload() {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ endpoint: string; uploadId: string }>(`/admin/lessons/${lessonId}/video/upload`, { method: "POST" });
      setEndpoint(result.endpoint);
      setState({ ...state, videoUploadId: result.uploadId, videoStatus: "UPLOADING", videoError: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao preparar upload");
    } finally { setBusy(false); }
  }

  async function loadPanda(page = 1) {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query.trim()) params.set("title", query.trim());
      if (pandaStatus) params.set("status", pandaStatus);
      setLibrary(await apiFetch<PandaLibrary>(`/admin/integrations/panda/videos?${params.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a Biblioteca Panda");
    } finally { setBusy(false); }
  }

  async function attachPanda(videoId: string) {
    setBusy(true); setError("");
    try {
      const next = await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/panda/attach`, { method: "POST", body: JSON.stringify({ videoId }) });
      setState(next); setLibrary(null); onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao vincular vídeo Panda");
    } finally { setBusy(false); }
  }

  async function attachYoutube() {
    if (!youtubeId) {
      setError("Cole uma URL válida do YouTube.");
      return;
    }
    setBusy(true); setYoutubeChecking(true); setError("");
    try {
      const durationSec = await readYoutubeDuration(youtubeId);
      const next = await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/youtube/attach`, {
        method: "POST",
        body: JSON.stringify({ url: youtubeUrl.trim(), durationSec }),
      });
      setState(next);
      setYoutubeUrl("");
      setLibrary(null);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao vincular vídeo do YouTube");
    } finally {
      setYoutubeChecking(false); setBusy(false);
    }
  }

  async function refreshPanda() {
    setBusy(true);
    try {
      setState(await apiFetch<VideoState>(`/admin/lessons/${lessonId}/video/panda/refresh`, { method: "POST" }));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar vídeo");
    } finally { setBusy(false); }
  }

  const currentProvider = state.provider ?? state.videoResource?.provider ?? null;
  async function removeVideo() {
    const message = currentProvider === "PANDA"
      ? "Desvincular este vídeo da aula? O arquivo NÃO será apagado do Panda."
      : currentProvider === "YOUTUBE"
        ? "Desvincular este vídeo do YouTube da aula? O vídeo no YouTube não será alterado."
        : "Remover este vídeo da aula?";
    if (!window.confirm(message)) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/admin/lessons/${lessonId}/video`, { method: "DELETE" });
      setEndpoint(null); setState({ videoStatus: "EMPTY" }); setLibrary(null); setYoutubeUrl(""); onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover vídeo");
    } finally { setBusy(false); }
  }

  const label = { EMPTY: "Sem vídeo", UPLOADING: "Enviando", PROCESSING: "Processando", READY: "Pronto", ERROR: "Erro" }[state.videoStatus];

  return <div className="video-admin-box">
    <div className="video-admin-head">
      <div><strong>Vídeo da aula</strong><span className={`video-pill ${state.videoStatus.toLowerCase()}`}>{label}</span>{currentProvider && <span className="video-provider-badge">{currentProvider}</span>}</div>
      {state.durationSec ? <small>{formatDuration(state.durationSec)}</small> : null}
    </div>

    {state.videoResource?.thumbnailUrl && <img src={state.videoResource.thumbnailUrl} alt="Thumbnail" style={{ width: 180, maxWidth: "100%", borderRadius: 8, margin: "10px 0" }} />}
    {state.videoStatus === "READY" && currentProvider === "YOUTUBE" && <div className="video-ready-note">▶ YouTube incorporado. Matrícula, dispositivo e sessão continuam validados pela Casa do Ads; a proteção do arquivo em si segue as regras do YouTube.</div>}
    {state.videoStatus === "READY" && currentProvider !== "YOUTUBE" && <div className="video-ready-note">🔒 Vídeo vinculado ao provedor. A liberação final continua passando por matrícula, dispositivo e sessão da Casa do Ads.</div>}
    {state.videoStatus === "PROCESSING" && <div className="video-processing">O provedor ainda está processando o vídeo.</div>}
    {state.videoStatus === "ERROR" && <div className="form-error">{state.videoError || "Erro ao processar vídeo."}</div>}
    {error && <div className="form-error">{error}</div>}

    {state.videoStatus === "EMPTY" && <div className="video-source-stack">
      {activeProvider === "PANDA" && <div className="panda-library-picker">
        <div className="video-source-title"><strong>Panda Video</strong><span>Biblioteca protegida</span></div>
        <p className="muted">Faça o upload no Panda e vincule o vídeo pela biblioteca.</p>
        {pandaConfigured === false && <div className="form-error">Configure a PANDA_API_KEY no servidor antes de abrir a biblioteca.</div>}
        <div className="inline-form">
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); loadPanda(1); } }} placeholder="Buscar vídeo por título" maxLength={120} />
          <select value={pandaStatus} onChange={e => setPandaStatus(e.target.value)} aria-label="Filtrar por status">
            <option value="">Todos os status</option><option value="CONVERTED">Prontos</option><option value="CONVERTING">Processando</option><option value="DRAFT">Rascunhos</option><option value="FAILED">Com falha</option><option value="BLOCKED">Bloqueados</option><option value="DELETING">Em exclusão</option>
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => loadPanda(1)} disabled={busy || pandaConfigured === false}>{busy ? "Carregando..." : "Abrir Biblioteca Panda"}</button>
        </div>
      </div>}

      {activeProvider === "MUX" && !endpoint && <div className="video-source-option">
        <div className="video-source-title"><strong>Upload protegido</strong><span>Mux</span></div>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={prepareMuxUpload}>{busy ? "Preparando..." : "Selecionar vídeo"}</button>
      </div>}

      <div className="video-source-divider"><span>ou</span></div>
      <div className="youtube-url-picker">
        <div className="video-source-title"><strong>YouTube</strong><span>Cole a URL do vídeo</span></div>
        <div className="inline-form youtube-url-form">
          <input value={youtubeUrl} onChange={e => { setYoutubeUrl(e.target.value); setError(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); attachYoutube(); } }} placeholder="https://www.youtube.com/watch?v=..." maxLength={500} />
          <button type="button" className="btn btn-secondary" onClick={attachYoutube} disabled={busy || !youtubeId}>{youtubeChecking ? "Validando vídeo..." : "Vincular YouTube"}</button>
        </div>
        {youtubeId && <div className="youtube-url-preview">
          <img src={`https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`} alt="Prévia do vídeo do YouTube" />
          <div><strong>Link reconhecido</strong><span>ID {youtubeId}</span><small>A duração e a permissão de incorporação serão validadas antes de salvar.</small></div>
        </div>}
        <p className="muted youtube-help">Use vídeos públicos ou não listados com incorporação permitida. Vídeos privados ou com bloqueio de embed não poderão ser vinculados.</p>
      </div>
    </div>}

    {library && <>
      <div className="panda-video-grid">{library.videos.map(video => {
        const title = video.metadata?.title || "Vídeo sem título";
        return <button type="button" className="panda-video-card" key={video.providerAssetId} onClick={() => attachPanda(video.providerAssetId)} disabled={busy || video.status === "ERROR"}>
          {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={`Thumbnail de ${title}`} /> : <div className="panda-video-placeholder">▶</div>}
          <span><b>{title}</b><small>{pandaStatusLabel[video.status] || video.status}{video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ""}</small></span>
        </button>;
      })}{!library.videos.length && <div className="empty-inline">Nenhum vídeo encontrado com estes filtros.</div>}</div>
      {(library.page > 1 || library.hasMore) && <div className="panda-library-pagination"><button type="button" className="mini-button" disabled={busy || library.page <= 1} onClick={() => loadPanda(library.page - 1)}>Página anterior</button><span>Página {library.page}</span><button type="button" className="mini-button" disabled={busy || !library.hasMore} onClick={() => loadPanda(library.page + 1)}>Próxima página</button></div>}
    </>}

    {endpoint && <div className="mux-uploader-wrap"><Suspense fallback={<div className="video-processing">Carregando componente de upload...</div>}><MuxUploader endpoint={endpoint} pausable onSuccess={() => { setEndpoint(null); setState({ ...state, videoStatus: "PROCESSING" }); startPolling(); }} onUploadError={(event) => setError((event as CustomEvent)?.detail?.message || "Falha no upload")} /></Suspense></div>}

    {state.videoStatus !== "EMPTY" && <div className="video-actions">{currentProvider === "PANDA" && <button type="button" className="mini-button" onClick={refreshPanda} disabled={busy}>Atualizar do Panda</button>}<button type="button" className="danger-text" disabled={busy} onClick={removeVideo}>{currentProvider === "PANDA" || currentProvider === "YOUTUBE" ? "Desvincular vídeo" : "Remover vídeo"}</button></div>}
  </div>;
}
