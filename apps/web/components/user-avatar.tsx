"use client";

import { CSSProperties, useEffect, useState } from "react";
import styles from "./user-avatar.module.css";

export type AvatarPreset = {
  id: string;
  label: string;
  from: string;
  to: string;
  accent: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "aurora", label: "Aurora", from: "#6f52ed", to: "#db3c91", accent: "#ffd5ef" },
  { id: "ocean", label: "Oceano", from: "#075985", to: "#06b6d4", accent: "#cffafe" },
  { id: "sunset", label: "Pôr do sol", from: "#c2410c", to: "#f59e0b", accent: "#ffedd5" },
  { id: "forest", label: "Floresta", from: "#166534", to: "#65a30d", accent: "#dcfce7" },
  { id: "cosmos", label: "Cosmos", from: "#312e81", to: "#7c3aed", accent: "#ddd6fe" },
  { id: "energy", label: "Energia", from: "#be123c", to: "#fb7185", accent: "#ffe4e6" },
  { id: "ruby", label: "Rubi", from: "#7f1d1d", to: "#dc2626", accent: "#fecaca" },
  { id: "neon", label: "Neon", from: "#0f766e", to: "#84cc16", accent: "#d9f99d" },
  { id: "sky", label: "Céu", from: "#1d4ed8", to: "#60a5fa", accent: "#dbeafe" },
  { id: "gold", label: "Dourado", from: "#92400e", to: "#eab308", accent: "#fef3c7" },
];

export function avatarPresetFromUrl(avatarUrl?: string | null) {
  if (!avatarUrl?.startsWith("avatar:")) return null;
  return AVATAR_PRESETS.find(item => item.id === avatarUrl.slice(7)) ?? null;
}

export function defaultAvatarPreset(seed: string) {
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return AVATAR_PRESETS[Math.abs(hash) % AVATAR_PRESETS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) || "AP").toUpperCase();
}

type UserAvatarProps = {
  name?: string | null;
  avatarUrl?: string | null;
  seed?: string;
  size?: number;
  className?: string;
};

export function UserAvatar({ name = "Aluno", avatarUrl, seed, size = 40, className = "" }: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [avatarUrl]);
  const preset = avatarPresetFromUrl(avatarUrl) ?? defaultAvatarPreset(seed || name || "academy");
  const externalImage = Boolean(avatarUrl && !avatarUrl.startsWith("avatar:") && !imageFailed);
  const style = {
    width: size,
    height: size,
    fontSize: size,
    "--avatar-from": preset.from,
    "--avatar-to": preset.to,
    "--avatar-accent": preset.accent,
  } as CSSProperties;

  return <span className={`${styles.avatar} ${className}`} style={style} aria-label={`Avatar ${preset.label}`}>
    <span className={styles.initials}>{initials(name || "Aluno")}</span>
    <svg className={styles.mark} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2Z"/></svg>
    {externalImage && <img className={styles.image} src={avatarUrl!} alt="" onError={() => setImageFailed(true)}/>} 
  </span>;
}
