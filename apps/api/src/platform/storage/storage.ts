import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileStorage } from "../ports";

export interface S3Config {
  endpoint?: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO y otros S3 compatibles suelen necesitar rutas en vez de subdominios de bucket. */
  forcePathStyle: boolean;
}

const UPLOAD_TTL_SECONDS = 600;
const DOWNLOAD_TTL_SECONDS = 120;

/** Almacenamiento S3-compatible (producción: bucket UE; local: MinIO). ARCHITECTURE §12. */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  presignUpload(key: string, contentType: string, maxBytes: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: maxBytes,
      }),
      {
        expiresIn: UPLOAD_TTL_SECONDS,
        signableHeaders: new Set(["content-type", "content-length"]),
      },
    );
  }

  presignDownload(key: string, filename: string): Promise<string> {
    const safe = filename.replace(/[^\w.\- ]+/g, "_");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safe}"`,
      }),
      { expiresIn: DOWNLOAD_TTL_SECONDS },
    );
  }

  async head(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { size: out.ContentLength ?? 0, contentType: out.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/** Para tests y desarrollo sin S3: guarda objetos en memoria con URLs falsas pero verificables. */
export class MemoryFileStorage implements FileStorage {
  readonly objects = new Map<string, { size: number; contentType: string }>();

  async presignUpload(key: string, _contentType: string, maxBytes: number): Promise<string> {
    return `https://storage.test/upload/${encodeURIComponent(key)}?max=${maxBytes}`;
  }
  async presignDownload(key: string, filename: string): Promise<string> {
    return `https://storage.test/download/${encodeURIComponent(key)}?name=${encodeURIComponent(filename)}`;
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.size, contentType: o.contentType } : null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  /** Simula que el cliente subió el objeto con la URL firmada. */
  simulateUpload(key: string, size: number, contentType: string): void {
    this.objects.set(key, { size, contentType });
  }
}

export const STORAGE_TTL = { upload: UPLOAD_TTL_SECONDS, download: DOWNLOAD_TTL_SECONDS };
