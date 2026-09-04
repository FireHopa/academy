import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verificar certificado | Casa do Ads",
  description: "Valide a autenticidade de um certificado emitido pela Casa do Ads.",
  robots: { index: false, follow: false },
};

export default function VerifyCertificateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
