import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { constants } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type sharpType from "sharp";

const sharp: typeof sharpType = require("sharp");

export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type ImagePreset = "course-card" | "course-hero" | "path-hero" | "avatar";

export const IMAGE_PRESETS: Record<ImagePreset, { width: number; height: number }> = {
  "course-card": { width: 1280, height: 720 },
  "course-hero": { width: 1920, height: 1080 },
  "path-hero": { width: 1920, height: 1080 },
  avatar: { width: 512, height: 512 },
};

export function resolveUploadRoot(configuredPath?: string | null) {
  const projectRoot = process.env.INIT_CWD?.trim() || process.cwd();
  const target = configuredPath?.trim() || "storage/uploads";
  return isAbsolute(target) ? target : resolve(projectRoot, target);
}

type DirectUploadPlan = {
  direct: true;
  method: "POST";
  uploadUrl: string;
  fields: Record<string, string>;
  publicUrl: string;
  key: string;
  expiresInSec: number;
};

@Injectable()
export class ImageStorageService {
  private readonly root: string;
  private readonly imagesDir: string;
  private readonly publicBase: string;
  private readonly driver: "local" | "s3";
  private readonly bucket: string | null;
  private readonly s3: S3Client | null;

  constructor(private readonly config: ConfigService) {
    this.root = resolveUploadRoot(config.get<string>("UPLOAD_DIR"));
    this.imagesDir = resolve(this.root, "images");
    const configuredDriver = String(config.get("IMAGE_STORAGE_DRIVER") ?? "local").trim().toLowerCase();
    if (configuredDriver !== "local" && configuredDriver !== "s3") throw new Error("IMAGE_STORAGE_DRIVER deve ser local ou s3");
    this.driver = configuredDriver;
    const apiBase = (config.get<string>("NEXT_PUBLIC_API_URL") ?? "http://localhost:4000").replace(/\/$/, "");

    if (this.driver === "s3") {
      const region = String(config.get("S3_REGION") ?? "us-east-1").trim();
      const bucket = String(config.get("S3_BUCKET") ?? "").trim();
      const endpoint = config.get<string>("S3_ENDPOINT")?.trim();
      const accessKeyId = config.get<string>("S3_ACCESS_KEY_ID")?.trim();
      const secretAccessKey = config.get<string>("S3_SECRET_ACCESS_KEY")?.trim();
      const configuredPublicBase = String(config.get("S3_PUBLIC_URL") ?? config.get("IMAGE_CDN_URL") ?? "").trim();
      if (!bucket) throw new Error("IMAGE_STORAGE_DRIVER=s3 exige S3_BUCKET");
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error("Configure S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY juntos");
      if (endpoint && !configuredPublicBase) throw new Error("S3_ENDPOINT customizado exige S3_PUBLIC_URL ou IMAGE_CDN_URL");
      if (endpoint && !/^https?:\/\//i.test(endpoint)) throw new Error("S3_ENDPOINT deve ser uma URL HTTP ou HTTPS");
      if (config.get("NODE_ENV") === "production" && configuredPublicBase && !configuredPublicBase.startsWith("https://")) {
        throw new Error("S3_PUBLIC_URL ou IMAGE_CDN_URL deve usar HTTPS em produção");
      }

      const options: S3ClientConfig = {
        region,
        endpoint: endpoint || undefined,
        forcePathStyle: this.booleanConfig("S3_FORCE_PATH_STYLE", false),
        credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      };
      this.s3 = new S3Client(options);
      this.bucket = bucket;
      this.publicBase = (configuredPublicBase || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/$/, "");
    } else {
      this.s3 = null;
      this.bucket = null;
      this.publicBase = (config.get<string>("UPLOAD_PUBLIC_URL")?.trim() || `${apiBase}/uploads`).replace(/\/$/, "");
    }
  }

  async store(file: UploadedImageFile | undefined, preset: ImagePreset) {
    if (!file?.buffer?.length) throw new BadRequestException("Selecione uma imagem para enviar");
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) throw new BadRequestException("A imagem deve ter no máximo 8 MB");

    const dimensions = IMAGE_PRESETS[preset];
    const filename = `${randomUUID()}.webp`;
    const key = `images/${filename}`;
    try {
      const source = sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 });
      const metadata = await source.metadata();
      if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
        throw new BadRequestException("Formato inválido. Envie uma imagem JPG, PNG ou WebP");
      }

      const pipeline = source.rotate();
      const resized = preset === "avatar"
        ? pipeline.resize({ ...dimensions, fit: "cover", position: "attention" })
        : pipeline.resize({ ...dimensions, fit: "inside", withoutEnlargement: true });
      const result = await resized.webp({ quality: 84, effort: 5 }).toBuffer({ resolveWithObject: true });

      if (this.driver === "s3") {
        await this.s3!.send(new PutObjectCommand({
          Bucket: this.bucket!,
          Key: key,
          Body: result.data,
          ContentType: "image/webp",
          CacheControl: IMAGE_CACHE_CONTROL,
        }));
      } else {
        await mkdir(this.imagesDir, { recursive: true, mode: 0o750 });
        await writeFile(resolve(this.imagesDir, filename), result.data, { mode: 0o640 });
      }

      return {
        url: `${this.publicBase}/${key}`,
        width: result.info.width,
        height: result.info.height,
        size: result.info.size,
      };
    } catch (error) {
      await this.removeKey(key);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Não foi possível processar a imagem. Tente outro arquivo JPG, PNG ou WebP");
    }
  }

  async createDirectUpload(preset: ImagePreset, size: number): Promise<DirectUploadPlan | { direct: false }> {
    if (this.driver !== "s3") return { direct: false };
    if (!Number.isInteger(size) || size < 1 || size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadRequestException("A imagem otimizada deve ter no máximo 8 MB");
    }
    if (!IMAGE_PRESETS[preset]) throw new BadRequestException("Preset de imagem inválido");

    const key = `images/${randomUUID()}.webp`;
    const expiresInSec = this.numberConfig("S3_PRESIGN_EXPIRES_SEC", 300, 60, 900);
    try {
      const signed = await createPresignedPost(this.s3!, {
        Bucket: this.bucket!,
        Key: key,
        Expires: expiresInSec,
        Fields: { "Content-Type": "image/webp", "Cache-Control": IMAGE_CACHE_CONTROL },
        Conditions: [
          ["eq", "$Content-Type", "image/webp"],
          ["eq", "$Cache-Control", IMAGE_CACHE_CONTROL],
          ["content-length-range", 1, MAX_IMAGE_UPLOAD_BYTES],
        ],
      });
      return {
        direct: true,
        method: "POST",
        uploadUrl: signed.url,
        fields: signed.fields,
        publicUrl: `${this.publicBase}/${key}`,
        key,
        expiresInSec,
      };
    } catch {
      throw new ServiceUnavailableException("Não foi possível autorizar o upload direto agora");
    }
  }

  async removeManaged(url?: string | null) {
    const key = this.managedKey(url);
    if (key) await this.removeKey(key);
  }

  storageStatus() {
    return { driver: this.driver, directUpload: this.driver === "s3", publicBase: this.publicBase };
  }

  async assertReady() {
    if (this.driver === "s3") {
      await this.s3!.send(
        new HeadBucketCommand({ Bucket: this.bucket! }),
        { abortSignal: AbortSignal.timeout(1_500) },
      );
      return;
    }
    await mkdir(this.imagesDir, { recursive: true, mode: 0o750 });
    await access(this.imagesDir, constants.R_OK | constants.W_OK);
  }

  private managedKey(url?: string | null) {
    if (!url) return null;
    try {
      const base = new URL(`${this.publicBase}/`);
      const candidate = new URL(url);
      if (candidate.origin !== base.origin) return null;
      const basePath = base.pathname.replace(/\/$/, "");
      if (!candidate.pathname.startsWith(`${basePath}/images/`)) return null;
      const filename = candidate.pathname.slice(`${basePath}/images/`.length);
      if (!/^[a-f0-9-]+\.webp$/i.test(filename)) return null;
      return `images/${filename}`;
    } catch {
      return null;
    }
  }

  private async removeKey(key: string) {
    if (!/^images\/[a-f0-9-]+\.webp$/i.test(key)) return;
    if (this.driver === "s3") {
      await this.s3!.send(new DeleteObjectCommand({ Bucket: this.bucket!, Key: key })).catch(() => undefined);
      return;
    }
    const target = resolve(this.root, key);
    if (!target.startsWith(`${this.imagesDir}${sep}`)) return;
    await rm(target, { force: true }).catch(() => undefined);
  }

  private booleanConfig(key: string, fallback: boolean) {
    const value = this.config.get(key);
    return value == null ? fallback : ["1", "true", "yes", "sim"].includes(String(value).trim().toLowerCase());
  }

  private numberConfig(key: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(this.config.get(key) ?? fallback);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
  }
}
