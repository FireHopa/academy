export type TrustProxySetting = false | true | number | string;

export function resolveTrustProxy(raw: unknown): TrustProxySetting {
  if (typeof raw === "boolean") return raw ? 1 : false;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : false;
  const value = String(raw ?? "").trim();
  if (!value || ["false", "off", "no", "0"].includes(value.toLowerCase())) return false;
  if (["true", "on", "yes"].includes(value.toLowerCase())) return 1;
  if (/^\d+$/.test(value)) return Math.max(1, Number(value));
  return value;
}
