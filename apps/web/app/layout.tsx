import "./globals.css";
import type { Metadata } from "next";
import { RouteShell } from "@/components/route-shell";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";

export const metadata: Metadata = {
  title: "Casa do Ads",
  description: "Plataforma de cursos com experiência de streaming",
  icons: {
    icon: "/brand/casa-do-ads-mark.png",
    apple: "/brand/casa-do-ads-mark.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><WebVitalsReporter /><RouteShell>{children}</RouteShell></body>
    </html>
  );
}
