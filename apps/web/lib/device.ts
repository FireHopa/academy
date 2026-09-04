const DEVICE_KEY = "academy_device_id";

export function getOrCreateDeviceFingerprint() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing && existing.length >= 16) return existing;
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function getDeviceLabel() {
  if (typeof navigator === "undefined") return "Navegador";
  const ua = navigator.userAgent;
  const browser = ua.includes("Edg/") ? "Edge"
    : ua.includes("Chrome/") ? "Chrome"
      : ua.includes("Firefox/") ? "Firefox"
        : ua.includes("Safari/") ? "Safari"
          : "Navegador";
  const system = ua.includes("Windows") ? "Windows"
    : ua.includes("Android") ? "Android"
      : /iPhone|iPad|iPod/.test(ua) ? "iPhone/iPad"
        : ua.includes("Mac OS") ? "Mac"
          : ua.includes("Linux") ? "Linux"
            : "dispositivo";
  return `${browser} em ${system}`;
}
