import { ReactNode } from "react";
import { AccountShell } from "@/components/account-shell";

export default function AccountRouteLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
