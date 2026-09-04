import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// npm workspaces executa o Next a partir de apps/web. Carregamos explicitamente
// o .env local do app (se existir) e o .env da raiz do monorepo.
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });
loadEnv({ path: resolve(process.cwd(), "../../.env"), override: false });

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
