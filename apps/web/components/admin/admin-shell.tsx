"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AdminIcon, type AdminIconName } from "./admin-icon";
import { BrandLogo } from "../brand-logo";
import { FEATURES } from "../../lib/features";

type AdminUser = {
  name: string;
  email: string;
  role: string;
};

type NavigationItem = {
  href: string;
  label: string;
  icon: AdminIconName;
};

const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  { label: "Principal", items: [{ href: "/admin", label: "Visão geral", icon: "dashboard" }] },
  {
    label: "Cursos e aulas",
    items: [
      { href: "/admin/courses", label: "Cursos", icon: "courses" },
      ...(FEATURES.categoriesAndPaths
        ? [{ href: "/admin/organization", label: "Categorias e trilhas", icon: "organization" as AdminIconName }]
        : []),
    ],
  },
  { label: "Pessoas", items: [{ href: "/admin/students", label: "Alunos", icon: "students" }] },
  { label: "Configurações", items: [{ href: "/admin/integrations", label: "Integrações", icon: "integrations" }, { href: "/admin/audit", label: "Auditoria", icon: "shield" }] },
];

function currentPage(path: string) {
  if (path.startsWith("/admin/lessons/")) return "Editar aula";
  if (path.startsWith("/admin/courses/")) return "Editar curso";
  if (path.startsWith("/admin/students/")) return "Perfil do aluno";
  if (path.startsWith("/admin/courses")) return "Cursos";
  if (path.startsWith("/admin/students")) return "Alunos";
  if (path.startsWith("/admin/organization")) return "Categorias e trilhas";
  if (path.startsWith("/admin/integrations")) return "Integrações";
  if (path.startsWith("/admin/audit")) return "Auditoria";
  return "Visão geral";
}

export function AdminShell({ children, styles }: { children: ReactNode; styles: Record<string, string> }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [access, setAccess] = useState<"checking" | "ready" | "redirecting">("checking");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ user: AdminUser }>("/auth/me")
      .then(({ user: authenticatedUser }) => {
        if (!active) return;
        if (authenticatedUser.role !== "ADMIN") {
          setAccess("redirecting");
          router.replace("/browse");
          return;
        }
        setUser(authenticatedUser);
        setAccess("ready");
      })
      .catch(() => {
        if (!active) return;
        setAccess("redirecting");
        router.replace("/login");
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => { setMobileOpen(false); }, [path]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const initials = useMemo(() => {
    const value = user?.name?.trim() || "Administrador";
    return value.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }, [user]);

  function isActive(href: string) {
    return href === "/admin" ? path === href : path.startsWith(href);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (access !== "ready") {
    return (
      <main className={styles.accessState} aria-live="polite">
        <div className={styles.accessMark}><AdminIcon name="shield" size={26}/></div>
        <strong>{access === "checking" ? "Validando acesso administrativo" : "Redirecionando"}</strong>
        <span>Aguarde um instante.</span>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#admin-content">Ir para o conteúdo</a>

      <button
        aria-label="Fechar menu administrativo"
        className={`${styles.overlay} ${mobileOpen ? styles.overlayVisible : ""}`}
        onClick={() => setMobileOpen(false)}
        tabIndex={mobileOpen ? 0 : -1}
        type="button"
      />

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`} aria-label="Navegação administrativa" id="admin-navigation">
        <div className={styles.sidebarHeader}>
          <Link className={styles.logo} href="/admin" onClick={() => setMobileOpen(false)}>
            <BrandLogo className={styles.logoImage} variant="mark" height={38} decorative/>
            <span className={styles.logoCopy}><strong>Casa do Ads</strong><small>Administração</small></span>
          </Link>
          <button aria-label="Fechar menu" className={styles.closeButton} onClick={() => setMobileOpen(false)} type="button">
            <AdminIcon name="close"/>
          </button>
        </div>

        <nav className={styles.navigation}>
          {navigation.map(group => (
            <div className={styles.navGroup} key={group.label}>
              <div className={styles.navLabel}>{group.label}</div>
              {group.items.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <AdminIcon name={item.icon}/>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link className={styles.previewLink} href="/browse" target="_blank" rel="noreferrer">
            <AdminIcon name="eye"/>
            <span>Visualizar como aluno</span>
          </Link>
          <div className={styles.userCard}>
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.userCopy}>
              <strong>{user?.name || "Administrador"}</strong>
              <small>{user?.email}</small>
            </span>
            <button aria-label="Sair da conta" className={styles.logoutButton} disabled={loggingOut} onClick={logout} type="button">
              <AdminIcon name="logout"/>
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topbarStart}>
            <button
              aria-controls="admin-navigation"
              aria-expanded={mobileOpen}
              aria-label="Abrir menu administrativo"
              className={styles.menuButton}
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <AdminIcon name="menu"/>
            </button>
            <div className={styles.breadcrumb}>
              <span>Administração</span>
              <AdminIcon name="chevron" size={15}/>
              <strong>{currentPage(path)}</strong>
            </div>
          </div>
          <div className={styles.topbarEnd}>
            <Link className={styles.topbarPreview} href="/browse" target="_blank" rel="noreferrer">
              <AdminIcon name="eye" size={18}/>
              <span>Ver área do aluno</span>
            </Link>
            <div className={styles.topbarUser} title={user?.email}>
              <span className={styles.topbarAvatar}>{initials}</span>
              <span><strong>{user?.name || "Administrador"}</strong><small>Administrador</small></span>
            </div>
          </div>
        </header>

        <main className={styles.content} id="admin-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
