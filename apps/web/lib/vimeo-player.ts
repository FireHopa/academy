type VimeoPlayer = {
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
  ready(): Promise<void>;
  getDuration(): Promise<number>;
  setCurrentTime(seconds: number): Promise<number>;
  pause(): Promise<void>;
  play(): Promise<void>;
  destroy(): Promise<void>;
};
type VimeoApi = { Player: new (element: HTMLIFrameElement) => VimeoPlayer };
let pending: Promise<VimeoApi> | null = null;

export function loadVimeoPlayer(): Promise<VimeoApi> {
  const host = window as Window & { Vimeo?: VimeoApi };
  if (host.Vimeo?.Player) return Promise.resolve(host.Vimeo);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://player.vimeo.com/api/player.js";
    script.async = true;
    const fail = () => { window.clearTimeout(timeout); script.remove(); pending = null; reject(new Error("Não foi possível carregar o player do Vimeo.")); };
    const timeout = window.setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (host.Vimeo?.Player) resolve(host.Vimeo); else fail();
    };
    document.head.appendChild(script);
  });
  return pending;
}

export type { VimeoPlayer };
