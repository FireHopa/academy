"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountLayout } from "@/components/account-layout";
import { GoogleText } from "@/components/google-text";
import { apiFetch } from "@/lib/api";
import { getOrCreateDeviceFingerprint } from "@/lib/device";

type Device = {
  id: string;
  fingerprint: string;
  label?: string | null;
  lastSeenAt: string;
  createdAt: string;
  activeSessions: Array<{ id: string; lessonId: string; startedAt: string; lastSeenAt: string }>;
};
type DeviceResponse = { maxDevices: number; maxConcurrentStreams: number; devices: Device[] };
type SessionResponse = {
  sessions: Array<{
    id: string;
    startedAt: string;
    lastSeenAt: string;
    device?: { id: string; label?: string | null } | null;
    lesson: { id: string; title: string };
  }>;
};

function dateText(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function SecurityPage() {
  const [devices, setDevices] = useState<DeviceResponse | null>(null);
  const [sessions, setSessions] = useState<SessionResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [currentFingerprint, setCurrentFingerprint] = useState("");

  const load = useCallback(async () => {
    try {
      const [deviceData, sessionData] = await Promise.all([
        apiFetch<DeviceResponse>("/security/devices"),
        apiFetch<SessionResponse>("/security/playback-sessions"),
      ]);
      setDevices(deviceData);
      setSessions(sessionData);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar a segurança da conta"); }
  }, []);

  useEffect(() => { setCurrentFingerprint(getOrCreateDeviceFingerprint()); load(); }, [load]);

  async function revoke(device: Device) {
    const isCurrent = device.fingerprint === currentFingerprint;
    if (!window.confirm(isCurrent ? "Remover este aparelho? A reprodução atual será encerrada." : `Remover ${device.label || "este aparelho"}?`)) return;
    setBusy(device.id);
    try { await apiFetch(`/security/devices/${device.id}`, { method: "DELETE" }); await load(); }
    finally { setBusy(""); }
  }

  async function endSession(sessionId: string) {
    setBusy(sessionId);
    try { await apiFetch(`/security/playback-sessions/${sessionId}/end`, { method: "POST", body: "{}" }); await load(); }
    finally { setBusy(""); }
  }

  return (
    <AccountLayout active="security" eyebrow="Proteção da conta" title="Segurança e dispositivos" description="Controle onde sua conta pode assistir aos cursos e encerre acessos que não reconhece.">
      <section className="security-page account-security-page">
        {devices && <div className="security-overview"><div><span>Dispositivos autorizados</span><strong>{devices.devices.length}/{devices.maxDevices}</strong></div><div><span>Reproduções ativas</span><strong>{sessions?.sessions.length || 0}/{devices.maxConcurrentStreams}</strong></div><p>Os limites protegem sua conta contra compartilhamentos e acessos não autorizados.</p></div>}

        {error && <div className="form-error">{error}</div>}

        <section className="security-section">
          <div className="section-head top"><div><h2>Dispositivos autorizados</h2><p>Remover um aparelho encerra imediatamente as sessões dele no sistema.</p></div></div>
          <div className="device-list">
            {!devices && <div className="empty-panel">Carregando...</div>}
            {devices?.devices.map((device) => {
              const current = device.fingerprint === currentFingerprint;
              return <div className="device-card" key={device.id}>
                <div className="device-icon">▣</div>
                <div className="device-copy">
                  <strong>{device.label || "Navegador"} {current && <span className="current-device">Este aparelho</span>}</strong>
                  <span>Último acesso: {dateText(device.lastSeenAt)}</span>
                  <span>{device.activeSessions.length ? `${device.activeSessions.length} reprodução ativa` : "Sem reprodução ativa"}</span>
                </div>
                <button className="btn btn-secondary" disabled={busy === device.id} onClick={() => revoke(device)}>{busy === device.id ? "Removendo..." : "Remover"}</button>
              </div>;
            })}
          </div>
        </section>

        <section className="security-section">
          <div className="section-head"><div><h2>Reproduções ativas</h2><p>Sessões sem heartbeat são encerradas automaticamente.</p></div></div>
          <div className="device-list">
            {sessions && sessions.sessions.length === 0 && <div className="empty-panel">Nenhuma reprodução ativa.</div>}
            {sessions?.sessions.map((session) => <div className="device-card" key={session.id}>
              <div className="device-icon">▶</div>
              <div className="device-copy">
                <strong><GoogleText>{session.lesson.title}</GoogleText></strong>
                <span>{session.device?.label || "Dispositivo"}</span>
                <span>Ativa desde {dateText(session.startedAt)}</span>
              </div>
              <button className="btn btn-secondary" disabled={busy === session.id} onClick={() => endSession(session.id)}>{busy === session.id ? "Encerrando..." : "Encerrar"}</button>
            </div>)}
          </div>
        </section>
      </section>
    </AccountLayout>
  );
}
