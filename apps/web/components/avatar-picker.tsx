"use client";

import { DragEvent, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { StudentIcon } from "./student-icon";
import { AVATAR_PRESETS, avatarPresetFromUrl, defaultAvatarPreset, UserAvatar } from "./user-avatar";

type AvatarUser = { id: string; name: string; email: string; avatarUrl: string | null };
type AvatarPickerProps = {
  name: string;
  seed: string;
  value: string | null;
  onChange: (avatarUrl: string | null) => void;
};

const MAX_BYTES = 8 * 1024 * 1024;
const VALID_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AvatarPicker({ name, seed, value, onChange }: AvatarPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = avatarPresetFromUrl(value) ?? (!value ? defaultAvatarPreset(seed || name) : null);

  function updated(avatarUrl: string | null, feedback: string) {
    onChange(avatarUrl);
    setMessage(feedback);
  }

  async function selectPreset(avatarPreset: string) {
    if (busy) return;
    setBusy(avatarPreset);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<{ user: AvatarUser }>("/account/avatar/preset", { method: "PUT", body: JSON.stringify({ avatarPreset }) });
      updated(result.user.avatarUrl, "Avatar atualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o avatar.");
    } finally { setBusy(""); }
  }

  function validate(file: File) {
    if (!VALID_TYPES.has(file.type)) return "Envie uma imagem JPG, PNG ou WebP.";
    if (file.size > MAX_BYTES) return "A imagem deve ter no máximo 8 MB.";
    return "";
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    const validation = validate(file);
    if (validation) { setError(validation); return; }
    setBusy("upload");
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiFetch<{ url: string; width: number; height: number; size: number; user: AvatarUser }>("/account/avatar/upload", { method: "POST", body: form });
      updated(result.user.avatarUrl, "Sua foto foi enviada e ajustada para o perfil.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar sua foto.");
    } finally {
      setBusy("");
      setDragging(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!value || busy || !window.confirm("Remover a foto e voltar para um avatar colorido?")) return;
    setBusy("remove");
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<{ user: AvatarUser }>("/account/avatar", { method: "DELETE" });
      updated(result.user.avatarUrl, "Foto removida. Um avatar colorido foi aplicado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover sua foto.");
    } finally { setBusy(""); }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void upload(event.dataTransfer.files?.[0]);
  }

  return <section className="account-panel avatar-editor">
    <div className="account-panel-heading">
      <span className="account-panel-icon"><StudentIcon name="photo"/></span>
      <div><h2>Imagem do perfil</h2><p>Escolha um avatar da coleção ou envie sua própria foto.</p></div>
    </div>
    <div className="avatar-editor-layout">
      <div className={`avatar-upload-zone ${dragging ? "dragging" : ""}`} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <UserAvatar name={name} avatarUrl={value} seed={seed} size={122}/>
        <div><strong>Seu perfil</strong><span>A imagem aparece no topo e nas configurações da conta.</span></div>
        <input id={inputId} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={event => void upload(event.target.files?.[0])}/>
        <button className="btn btn-secondary avatar-upload-button" type="button" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}><StudentIcon name="upload" size={18}/>{busy === "upload" ? "Enviando..." : "Enviar minha foto"}</button>
        {value && <button className="avatar-remove-button" type="button" disabled={Boolean(busy)} onClick={() => void remove()}>{busy === "remove" ? "Removendo..." : "Remover foto"}</button>}
        <small>JPG, PNG ou WebP. Até 8 MB.</small>
      </div>
      <div className="avatar-collection">
        <div className="avatar-collection-head"><strong>Escolha seu avatar</strong><span>Você pode trocar quando quiser</span></div>
        <div className="avatar-preset-grid">
          {AVATAR_PRESETS.map(preset => {
            const active = selected?.id === preset.id && !value?.startsWith("http");
            return <button key={preset.id} type="button" className={active ? "active" : ""} aria-label={`Usar avatar ${preset.label}`} aria-pressed={active} disabled={Boolean(busy)} onClick={() => void selectPreset(preset.id)}>
              <UserAvatar name={name} avatarUrl={`avatar:${preset.id}`} seed={seed} size={66}/>
              <span>{preset.label}</span>
              {active && <i><StudentIcon name="check" size={13}/></i>}
            </button>;
          })}
        </div>
      </div>
    </div>
    {error && <div className="form-error avatar-feedback">{error}</div>}
    {message && <div className="auth-success compact avatar-feedback">{message}</div>}
  </section>;
}
