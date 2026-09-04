"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import { StudentIcon } from "./student-icon";
import { UserAvatar } from "./user-avatar";
import { BrandLogo } from "./brand-logo";
import { GoogleText } from "./google-text";
import { FEATURES } from "../lib/features";
import { type StudentNotification, useStudentSession } from "./student-session";

const notificationDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));

export function Nav() {
  const router = useRouter();
  const notificationRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { profile, notifications, unread, refreshNotifications, readNotification, readAllNotifications } = useStudentSession();

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      const target = event.target as Node;
      if (!notificationRef.current?.contains(target)) setNotificationsOpen(false);
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setNotificationsOpen(false); setAccountOpen(false); }
    }
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/catalog?q=${encodeURIComponent(q)}` : "/catalog");
  }

  async function read(item: StudentNotification) {
    try { await readNotification(item.id); }
    catch { /* O contexto restaura o resumo quando a atualização falha. */ }
  }

  async function readAll() {
    try { await readAllNotifications(); }
    catch { await refreshNotifications().catch(() => undefined); }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch { setLoggingOut(false); }
  }

  return <nav className="nav">
    <Link className="brand student-brand" href="/browse" aria-label="Casa do Ads"><BrandLogo variant="mark" height={42} decorative/><strong>Casa do Ads</strong></Link>
    <div className="navlinks">
      <Link href="/browse">Início</Link>
      <Link href="/catalog">Cursos</Link>
      {FEATURES.categoriesAndPaths && <Link href="/paths">Trilhas</Link>}
      <Link href="/library">Minha biblioteca</Link>
      <Link href="/history">Histórico</Link>
    </div>
    <div className="nav-right">
      <form className="nav-search" onSubmit={search}>
        <input aria-label="Buscar cursos" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar"/>
      </form>

      <div className="nav-action-menu" ref={notificationRef}>
        <button className={`nav-icon-button ${notificationsOpen ? "active" : ""}`} type="button" aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen(open => !open); setAccountOpen(false); if (!notificationsOpen) void refreshNotifications().catch(() => undefined); }}>
          <StudentIcon name="bell" size={21}/>
          {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
        </button>
        {notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Notificações recentes">
          <div className="notification-popover-head"><div><strong>Notificações</strong><span>{unread ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia"}</span></div>{unread > 0 && <button type="button" onClick={() => void readAll()}>Marcar como lidas</button>}</div>
          <div className="notification-popover-list">
            {notifications.slice(0, 5).map(item => {
              const copy = <><i className={item.readAt ? "" : "unread"}/><div><div><strong><GoogleText>{item.title}</GoogleText></strong><time>{notificationDate(item.createdAt)}</time></div><p><GoogleText>{item.message}</GoogleText></p></div></>;
              return item.linkUrl
                ? <Link key={item.id} href={item.linkUrl} className={item.readAt ? "" : "unread"} onClick={() => { void read(item); setNotificationsOpen(false); }}>{copy}</Link>
                : <button key={item.id} type="button" className={item.readAt ? "" : "unread"} onClick={() => void read(item)}>{copy}</button>;
            })}
            {!notifications.length && <div className="notification-popover-empty"><StudentIcon name="bell" size={24}/><span>Nenhuma notificação por enquanto.</span></div>}
          </div>
          <Link className="notification-popover-footer" href="/notifications" onClick={() => setNotificationsOpen(false)}>Ver todas as notificações<StudentIcon name="chevron" size={16}/></Link>
        </div>}
      </div>

      <div className="nav-action-menu" ref={accountRef}>
        <button className="nav-avatar-button" type="button" aria-label="Abrir menu da conta" aria-expanded={accountOpen} onClick={() => { setAccountOpen(open => !open); setNotificationsOpen(false); }}>
          <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} seed={profile?.id} size={36}/>
        </button>
        {accountOpen && <div className="account-popover">
          <div className="account-popover-user"><UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} seed={profile?.id} size={48}/><div><strong>{profile?.name || "Minha conta"}</strong><span>{profile?.email || ""}</span></div></div>
          <div className="account-popover-links">
            <Link href="/account" onClick={() => setAccountOpen(false)}><StudentIcon name="settings" size={18}/><span>Configurações da conta</span><StudentIcon name="chevron" size={15}/></Link>
            <Link href="/account/profile" onClick={() => setAccountOpen(false)}><StudentIcon name="profile" size={18}/><span>Editar perfil e avatar</span><StudentIcon name="chevron" size={15}/></Link>
          </div>
          <button className="account-popover-logout" type="button" disabled={loggingOut} onClick={() => void logout()}><StudentIcon name="logout" size={18}/>{loggingOut ? "Saindo..." : "Sair da conta"}</button>
        </div>}
      </div>
    </div>
  </nav>;
}
