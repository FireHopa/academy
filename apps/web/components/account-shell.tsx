"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { apiFetch } from "@/lib/api";
import { StudentIcon } from "./student-icon";
import { useStudentSession } from "./student-session";
import { UserAvatar } from "./user-avatar";

type AccountSection = "overview" | "profile" | "security" | "certificates";
const items: Array<{ id: AccountSection; href: string; label: string; icon: "home" | "profile" | "security" | "certificate" }> = [
  { id: "overview", href: "/account", label: "Visão geral", icon: "home" },
  { id: "profile", href: "/account/profile", label: "Perfil e acesso", icon: "profile" },
  { id: "security", href: "/account/security", label: "Segurança", icon: "security" },
  { id: "certificates", href: "/account/certificates", label: "Certificados", icon: "certificate" },
];

function activeSection(pathname: string): AccountSection {
  if (pathname.startsWith("/account/profile")) return "profile";
  if (pathname.startsWith("/account/security")) return "security";
  if (pathname.startsWith("/account/certificates")) return "certificates";
  return "overview";
}

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, profileLoading } = useStudentSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const active = activeSection(pathname);

  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Não foi possível sair da conta");
      setLoggingOut(false);
    }
  }

  return <section className="account-area">
    <aside className="account-sidebar">
      <div className="account-sidebar-user">
        <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} seed={profile?.id} size={58}/>
        <div><strong>{profile?.name || "Minha conta"}</strong><span>{profile?.email || (profileLoading ? "Carregando dados..." : "Dados indisponíveis")}</span></div>
      </div>
      <nav className="account-sidebar-nav" aria-label="Configurações da conta">
        {items.map(item => <Link key={item.id} href={item.href} className={active === item.id ? "active" : ""} aria-current={active === item.id ? "page" : undefined}>
          <StudentIcon name={item.icon} size={19}/><span>{item.label}</span><StudentIcon name="chevron" size={16}/>
        </Link>)}
      </nav>
      <div className="account-sidebar-footer">
        {logoutError && <small>{logoutError}</small>}
        <button type="button" onClick={() => void logout()} disabled={loggingOut}><StudentIcon name="logout" size={19}/>{loggingOut ? "Saindo..." : "Sair da conta"}</button>
      </div>
    </aside>
    {children}
  </section>;
}
