const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
export const API_URL = configuredApiUrl || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");
export const API_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  code?: string;
  details: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const rawMessage = body.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(". ")
      : typeof rawMessage === "string"
        ? rawMessage
        : "Não foi possível concluir a operação";
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : undefined;
    this.details = body;
  }
}

export class ApiTimeoutError extends Error {
  constructor() {
    super("A solicitação demorou mais que o esperado. Tente novamente.");
    this.name = "ApiTimeoutError";
  }
}

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = API_TIMEOUT_MS, signal: externalSignal, ...requestInit } = init;
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    const response = await fetch(`${API_URL}/api${path}`, {
      ...requestInit,
      credentials: "include",
      headers,
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = new ApiError(response.status, body);
      if (typeof window !== "undefined" && error.code === "ONBOARDING_REQUIRED" && window.location.pathname !== "/onboarding") {
        window.location.assign("/onboarding");
      }
      throw error;
    }
    return body as T;
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}
