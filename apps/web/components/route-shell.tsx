"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const StudentArea = dynamic(() => import("./student-area").then(module => module.StudentArea));
const studentRoots = ["/browse", "/catalog", "/library", "/history", "/notifications", "/paths", "/course", "/account"];

function studentRoute(pathname: string) {
  return studentRoots.some(root => pathname === root || pathname.startsWith(`${root}/`));
}

export function RouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return studentRoute(pathname) ? <StudentArea>{children}</StudentArea> : children;
}
