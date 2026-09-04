"use client";

import { DragEvent, KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { contentBackgroundImage } from "@/lib/placeholders";
import styles from "./image-upload-field.module.css";

type UploadResult = { url: string; width: number; height: number; size: number };
type ImagePreset = "course-card" | "course-hero" | "path-hero" | "avatar";
type DirectUploadPlan = { direct: false } | {
  direct: true;
  method: "POST";
  uploadUrl: string;
  fields: Record<string, string>;
  publicUrl: string;
};

type ImageUploadFieldProps = {
  label: string;
  help: string;
  value?: string | null;
  seed: string;
  uploadPath: string;
  deletePath?: string;
  aspectRatio?: string;
  directPreset?: ImagePreset;
  onChange: (url: string) => void;
  onExternalUrlSave?: (url: string) => Promise<unknown>;
};

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRESET_DIMENSIONS: Record<ImagePreset, { width: number; height: number }> = {
  "course-card": { width: 1280, height: 720 },
  "course-hero": { width: 1920, height: 1080 },
  "path-hero": { width: 1920, height: 1080 },
  avatar: { width: 512, height: 512 },
};

async function optimizeForDirectUpload(file: File, preset: ImagePreset) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const target = PRESET_DIMENSIONS[preset];
    const scale = preset === "avatar"
      ? Math.max(target.width / bitmap.width, target.height / bitmap.height)
      : Math.min(1, target.width / bitmap.width, target.height / bitmap.height);
    const sourceWidth = preset === "avatar" ? target.width / scale : bitmap.width;
    const sourceHeight = preset === "avatar" ? target.height / scale : bitmap.height;
    const sourceX = preset === "avatar" ? Math.max(0, (bitmap.width - sourceWidth) / 2) : 0;
    const sourceY = preset === "avatar" ? Math.max(0, (bitmap.height - sourceHeight) / 2) : 0;
    const width = preset === "avatar" ? target.width : Math.max(1, Math.round(bitmap.width * scale));
    const height = preset === "avatar" ? target.height : Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Seu navegador não conseguiu preparar a imagem");
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Seu navegador não oferece conversão WebP")), "image/webp", 0.84);
    });
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

export function ImageUploadField({
  label,
  help,
  value,
  seed,
  uploadPath,
  deletePath = uploadPath,
  aspectRatio = "16 / 9",
  directPreset,
  onChange,
  onExternalUrlSave,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [urlDraft, setUrlDraft] = useState(value ?? "");

  useEffect(() => setUrlDraft(value ?? ""), [value]);

  function validate(file: File) {
    if (!ACCEPTED_TYPES.has(file.type)) return "Envie uma imagem JPG, PNG ou WebP.";
    if (file.size > MAX_BYTES) return "A imagem deve ter no máximo 8 MB.";
    return "";
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    const validation = validate(file);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (directPreset && onExternalUrlSave && typeof createImageBitmap === "function") {
        let uploadedUrl = "";
        try {
          const optimized = await optimizeForDirectUpload(file, directPreset);
          const plan = await apiFetch<DirectUploadPlan>("/admin/media/images/presign", {
            method: "POST",
            body: JSON.stringify({ preset: directPreset, size: optimized.blob.size }),
          });
          if (plan.direct) {
            const directForm = new FormData();
            Object.entries(plan.fields).forEach(([key, value]) => directForm.append(key, value));
            directForm.append("file", optimized.blob, "image.webp");
            const response = await fetch(plan.uploadUrl, { method: plan.method, body: directForm, mode: "cors" });
            if (!response.ok) throw new Error(`O armazenamento respondeu HTTP ${response.status}`);
            uploadedUrl = plan.publicUrl;
            await onExternalUrlSave(plan.publicUrl);
            onChange(plan.publicUrl);
            setUrlDraft(plan.publicUrl);
            setMessage(`Imagem otimizada no navegador para ${optimized.width} × ${optimized.height}px e enviada diretamente.`);
            return;
          }
        } catch {
          if (uploadedUrl) {
            await apiFetch("/admin/media/images", { method: "DELETE", body: JSON.stringify({ url: uploadedUrl }) }).catch(() => undefined);
          }
        }
      }

      const form = new FormData();
      form.append("file", file);
      const result = await apiFetch<UploadResult>(uploadPath, { method: "POST", body: form });
      onChange(result.url);
      setUrlDraft(result.url);
      setMessage(`Imagem enviada e otimizada para ${result.width} × ${result.height}px.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!value || busy || !window.confirm(`Remover a imagem de ${label.toLowerCase()}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(deletePath, { method: "DELETE" });
      onChange("");
      setUrlDraft("");
      setMessage("Imagem removida. O placeholder automático será usado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover a imagem.");
    } finally {
      setBusy(false);
    }
  }

  async function applyExternalUrl() {
    const next = urlDraft.trim();
    if (!/^https?:\/\//i.test(next)) {
      setError("Informe uma URL completa começando com http:// ou https://.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onExternalUrlSave?.(next);
      onChange(next);
      setMessage("URL externa aplicada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aplicar a URL.");
    } finally {
      setBusy(false);
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files?.[0]);
  }

  function openPicker(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  const backgroundImage = contentBackgroundImage(value, seed, ["linear-gradient(0deg,rgba(7,15,30,.76),rgba(7,15,30,.05) 72%)"]);

  return (
    <section className={styles.field}>
      <div className={styles.heading}>
        <div>
          <label htmlFor={inputId}>{label}</label>
          <p>{help}</p>
        </div>
        <span>{value ? "Imagem definida" : "Placeholder ativo"}</span>
      </div>

      <div
        className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
        style={{ aspectRatio, backgroundImage }}
        role="button"
        tabIndex={0}
        aria-busy={busy}
        onKeyDown={openPicker}
        onClick={() => !busy && inputRef.current?.click()}
        onDragEnter={event => { event.preventDefault(); setDragging(true); }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={event => void upload(event.target.files?.[0])}
        />
        <div className={styles.dropCopy}>
          <strong>{busy ? "Processando imagem..." : "Clique ou arraste uma imagem"}</strong>
          <small>JPG, PNG ou WebP, até 8 MB</small>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {value ? "Substituir imagem" : "Enviar imagem"}
        </button>
        {value && <button type="button" className={styles.remove} disabled={busy} onClick={() => void remove()}>Remover</button>}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      {onExternalUrlSave && <details className={styles.external}>
        <summary>Opção avançada: usar URL externa</summary>
        <div>
          <input type="url" value={urlDraft} onChange={event => setUrlDraft(event.target.value)} placeholder="https://..." disabled={busy} />
          <button type="button" disabled={busy || !urlDraft.trim()} onClick={() => void applyExternalUrl()}>Aplicar URL</button>
        </div>
      </details>}
    </section>
  );
}
