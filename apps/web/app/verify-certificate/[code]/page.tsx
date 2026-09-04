import { CertificateVerifier } from "@/components/certificate-verifier";

export default async function VerifyCertificateCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CertificateVerifier initialCode={code} />;
}
