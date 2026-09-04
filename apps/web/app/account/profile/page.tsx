"use client";

import { FormEvent, useEffect, useState } from "react";
import { AccountLayout } from "@/components/account-layout";
import { AvatarPicker } from "@/components/avatar-picker";
import { StudentIcon } from "@/components/student-icon";
import { apiFetch } from "@/lib/api";
import { useStudentSession } from "@/components/student-session";

export default function ProfilePage() {
  const { profile, profileLoading, profileError, refreshProfile, updateProfile } = useStudentSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setEmail(profile.email);
  }, [profile]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch("/account/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      setMessage("Nome atualizado.");
      await refreshProfile();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar perfil"); }
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch("/account/change-email", { method: "POST", body: JSON.stringify({ newEmail: email, currentPassword: emailPassword }) });
      setEmailPassword("");
      setMessage("E-mail atualizado e sessão renovada.");
      await refreshProfile();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar e-mail"); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirm) { setError("As novas senhas não coincidem."); return; }
    try {
      await apiFetch("/account/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setMessage("Senha alterada. As outras sessões foram invalidadas.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar senha"); }
  }

  return <AccountLayout active="profile" eyebrow="Personalização e acesso" title="Perfil e acesso" description="Personalize como sua conta aparece e mantenha seus dados de entrada atualizados.">
    {error && <div className="form-error account-feedback">{error}</div>}
    {message && <div className="auth-success compact account-feedback">{message}</div>}
    {!profile && profileLoading && <div className="account-loading">Carregando seus dados...</div>}
    {!profile && !profileLoading && <div className="form-error account-feedback">{profileError || "Não foi possível carregar seus dados."} <button className="mini-button" type="button" onClick={() => void refreshProfile().catch(() => undefined)}>Tentar novamente</button></div>}
    {profile && <>
      <AvatarPicker name={name || profile.name} seed={profile.id} value={profile.avatarUrl} onChange={avatarUrl => updateProfile({ avatarUrl })}/>
      <div className="account-section-title"><div><h2>Dados e credenciais</h2><p>As alterações sensíveis exigem sua senha atual.</p></div></div>
      <div className="account-settings-columns">
        <form className="account-panel account-form-card" onSubmit={saveProfile}>
          <div className="account-panel-heading"><span className="account-panel-icon"><StudentIcon name="profile"/></span><div><h2>Dados pessoais</h2><p>Nome exibido dentro da plataforma.</p></div></div>
          <label className="field"><span>Nome completo</span><input required minLength={2} value={name} onChange={event => setName(event.target.value)}/></label>
          <button className="btn btn-primary" type="submit">Salvar nome</button>
        </form>
        <form className="account-panel account-form-card" onSubmit={changeEmail}>
          <div className="account-panel-heading"><span className="account-panel-icon"><StudentIcon name="settings"/></span><div><h2>E-mail de acesso</h2><p>Também será usado para recuperar sua senha.</p></div></div>
          <label className="field"><span>Novo e-mail</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)}/></label>
          <label className="field"><span>Senha atual</span><input required minLength={8} type="password" autoComplete="current-password" value={emailPassword} onChange={event => setEmailPassword(event.target.value)}/></label>
          <button className="btn btn-secondary" type="submit">Alterar e-mail</button>
        </form>
        <form className="account-panel account-form-card password-card" onSubmit={changePassword}>
          <div className="account-panel-heading"><span className="account-panel-icon"><StudentIcon name="security"/></span><div><h2>Alterar senha</h2><p>Use pelo menos 10 caracteres e evite senhas repetidas.</p></div></div>
          <div className="password-fields">
            <label className="field"><span>Senha atual</span><input required minLength={8} type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></label>
            <label className="field"><span>Nova senha</span><input required minLength={10} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)}/></label>
            <label className="field"><span>Confirmar nova senha</span><input required minLength={10} type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)}/></label>
          </div>
          <button className="btn btn-secondary" type="submit">Trocar senha</button>
        </form>
      </div>
      <div className="account-meta-panel"><span>Conta criada em <strong>{new Date(profile.createdAt).toLocaleDateString("pt-BR")}</strong></span>{profile.termsAcceptedAt && <span>Termos {profile.termsVersion || "v1"} aceitos em <strong>{new Date(profile.termsAcceptedAt).toLocaleDateString("pt-BR")}</strong></span>}</div>
    </>}
  </AccountLayout>;
}
