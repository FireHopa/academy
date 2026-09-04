import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { json, static as serveStatic, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { pandaConfigValue, validatePandaDrmProductionConfig } from "./video/panda-drm.config";
import { resolveUploadRoot } from "./media/image-storage.service";
import { resolveTrustProxy } from "./common/trust-proxy";
import { JobWorkerService } from "./jobs/job-worker.service";
import { jobRuntimePolicy } from "./jobs/queue-connection";
import { randomUUID } from "node:crypto";
import { validateProductionMailConfig } from "./common/mail-config";
import cookieParser = require("cookie-parser");

function validateProductionConfig(config: ConfigService) {
  if (config.get("NODE_ENV") !== "production") return;
  const secret = config.get<string>("JWT_SECRET") ?? "";
  const webUrl = config.get<string>("WEB_URL") ?? "";
  if (secret.length < 32 || /troque|secret|changeme/i.test(secret)) throw new Error("JWT_SECRET inseguro: use pelo menos 32 caracteres aleatórios em produção.");
  if (!webUrl.startsWith("https://")) throw new Error("WEB_URL deve usar HTTPS em produção.");
  const apiUrl = config.get<string>("NEXT_PUBLIC_API_URL") ?? "";
  if (!apiUrl.startsWith("https://")) throw new Error("NEXT_PUBLIC_API_URL deve usar HTTPS em produção.");
  const termsVersion = config.get<string>("TERMS_VERSION") ?? "";
  const termsUrl = config.get<string>("NEXT_PUBLIC_TERMS_URL") ?? "";
  const privacyUrl = config.get<string>("NEXT_PUBLIC_PRIVACY_URL") ?? "";
  if (!termsVersion.trim()) throw new Error("TERMS_VERSION é obrigatório em produção.");
  if (!termsUrl.startsWith("https://") || !privacyUrl.startsWith("https://")) throw new Error("Termos e Política de Privacidade devem apontar para URLs HTTPS em produção.");
  const videoProvider = String(config.get("VIDEO_PROVIDER") ?? "panda").toLowerCase();
  if (videoProvider === "panda") {
    const requiredPanda = ["PANDA_API_KEY", "PANDA_WEBHOOK_TOKEN"];
    const missingPanda = requiredPanda.filter(key => !pandaConfigValue(config, key));
    if (missingPanda.length) throw new Error(`Configuração Panda incompleta em produção: ${missingPanda.join(", ")}.`);
    validatePandaDrmProductionConfig(config);
  } else if (videoProvider === "mux") {
    const requiredMux = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_DRM_CONFIGURATION_ID", "MUX_SIGNING_KEY_ID", "MUX_PRIVATE_KEY", "MUX_WEBHOOK_SECRET"];
    const missingMux = requiredMux.filter(key => !config.get<string>(key));
    if (missingMux.length) throw new Error(`Configuração Mux incompleta em produção: ${missingMux.join(", ")}.`);
  } else {
    throw new Error("VIDEO_PROVIDER deve ser panda ou mux.");
  }
  if (String(config.get("THEMEMBERS_ENABLED") ?? "false").toLowerCase() === "true") {
    if (!config.get("THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN")) throw new Error("THEMEMBERS_ENABLED=true exige THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN em produção.");
    if (String(config.get("THEMEMBERS_ACCESS_AUTOMATION") ?? "false").toLowerCase() === "true") {
      const mode = String(config.get("THEMEMBERS_API_MODE") ?? "legacy").toLowerCase();
      const apiOk = mode === "legacy"
        ? Boolean(config.get("THEMEMBERS_DEVELOPER_TOKEN") && config.get("THEMEMBERS_PLATFORM_TOKEN"))
        : Boolean(config.get("THEMEMBERS_API_TOKEN") && config.get("THEMEMBERS_PRODUCTS_ENDPOINT"));
      if (!apiOk) throw new Error("Automação TheMembers exige API de produtos configurada para mapear produto → curso.");
    }
  }
  validateProductionMailConfig(config);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false });
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  validateProductionConfig(config);

  app.use(json({ limit: "5mb", verify: (req: any, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
  app.use(urlencoded({ extended: true, limit: "256kb" }));
  app.use(cookieParser());
  app.use((req: any, res: any, next: any) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  const uploadRoot = resolveUploadRoot(config.get<string>("UPLOAD_DIR"));
  app.use("/uploads", serveStatic(uploadRoot, {
    fallthrough: false,
    index: false,
    maxAge: "30d",
    immutable: true,
    setHeaders: response => response.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
  }));
  app.use(helmet());

  const trustProxy = resolveTrustProxy(config.get("TRUST_PROXY"));
  if (trustProxy !== false) app.getHttpAdapter().getInstance().set("trust proxy", trustProxy);

  const webUrl = (config.get<string>("WEB_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  app.use((req: any, res: any, next: any) => {
    const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    const integrationWebhook = req.originalUrl?.startsWith("/api/webhooks/");
    if (!unsafe || integrationWebhook) return next();
    const origin = req.get("origin");
    const invalidOrigin = origin && origin.replace(/\/$/, "") !== webUrl;
    const missingOriginInProduction = !origin && config.get("NODE_ENV") === "production";
    if (invalidOrigin || missingOriginInProduction) {
      return res.status(403).json({ statusCode: 403, message: invalidOrigin ? "Origem da requisição não autorizada" : "Origem da requisição ausente" });
    }
    next();
  });

  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "api/health", method: RequestMethod.GET },
      { path: "health/live", method: RequestMethod.GET },
      { path: "api/health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
      { path: "api/health/ready", method: RequestMethod.GET },
    ],
  });
  app.enableCors({ origin: webUrl, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const jobPolicy = jobRuntimePolicy(config);
  if (jobPolicy.runWorkerInApi) {
    await app.get(JobWorkerService).start();
  }

  const port = Number(config.get("API_PORT") ?? 4000);
  const host = config.get<string>("API_HOST")?.trim() || "127.0.0.1";
  await app.listen(port, host);
}

bootstrap();
