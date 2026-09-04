import { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import styles from "@/components/admin/admin-shell.module.css";

export default function AdminRouteLayout({ children }: { children: ReactNode }) {
  return <AdminShell styles={styles}>{children}</AdminShell>;
}
