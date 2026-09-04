"use client";

import { ReactNode } from "react";
import { Nav } from "./nav";
import { StudentSessionProvider } from "./student-session";

export function StudentArea({ children }: { children: ReactNode }) {
  return <StudentSessionProvider>
    <div className="page-shell">
      <Nav />
      {children}
    </div>
  </StudentSessionProvider>;
}
