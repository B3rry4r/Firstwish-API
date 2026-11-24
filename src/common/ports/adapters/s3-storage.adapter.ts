import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../../env/env";
import { SignUpload, SignedUpload, StoragePort, StoredObject } from "../storage.port";
import { Clock, SystemClock } from "../clock.port";
import { type PortPing, pingWith } from "../ping";

export const R2_HOST_SUFFIX = "r2.cloudflarestorage.com";

export interface S3Config {
  driver: "r2" | "spaces";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** The only difference between the r2 and spaces adapters: where the endpoint, region, bucket and keys come from. */
export function s3ConfigFor(env: Env): S3Config {
  if (env.STORAGE_DRIVER === "r2") {
    return {
      driver: "r2",
      endpoint: `https://${env.R2_ACCOUNT_ID}.${R2_HOST_SUFFIX}`,
      region: "auto",
      bucket: env.R2_BUCKET as string,
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    };
  }
  if (env.STORAGE_DRIVER === "spaces") {
    return {
      driver: "spaces",
      endpoint: env.SPACES_ENDPOINT as string,
      region: env.SPACES_REGION as string,
      bucket: env.SPACES_BUCKET as string,
      accessKeyId: env.SPACES_ACCESS_KEY_ID as string,
      secretAccessKey: env.SPACES_SECRET_ACCESS_KEY as string,
    };
  }
  throw new Error("STORAGE_DRIVER must be r2 or spaces");
}

/** S3-compatible storage (Cloudflare R2 or DigitalOcean Spaces). Signing happens locally; no network call. */
export class S3Storage extends StoragePort {
  private readonly client: S3Client;

  constructor(
    readonly config: S3Config,
    private readonly clock: Clock = new SystemClock(),
  ) {
    super();
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: false,
      // J5: R2 and Spaces do not take the SDK's default CRC32 checksum; a presigned PUT must not carry x-amz-checksum-* parameters.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async signUpload(input: SignUpload): Promise<SignedUpload> {
    // X26: the signature covers the content type and the exact length, so the PUT cannot carry another type or size.
    const cmd = new PutObjectCommand({ Bucket: this.config.bucket, Key: input.key, ContentType: input.contentType, ContentLength: input.contentLength });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: input.expiresInSeconds, signableHeaders: new Set(["content-type", "content-length"]) });
    const headers = { "content-type": input.contentType, "content-length": String(input.contentLength) };
    return { url, method: "PUT", headers, expiresAt: new Date(this.clock.now().getTime() + input.expiresInSeconds * 1000) };
  }

  async signDownload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  /** FB4: one authenticated read: the bucket's own head. NOT RUN against R2 or Spaces: the owner gives the keys later. */
  ping(): Promise<PortPing> {
    return pingWith(() => this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket })), [this.config.secretAccessKey, this.config.accessKeyId]);
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  async readStart(key: string, bytes: number): Promise<Buffer | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      if (!r.Body) return Buffer.alloc(0);
      return Buffer.from(await r.Body.transformToByteArray());
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  async readObject(key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (r.ContentLength !== undefined && r.ContentLength > maxBytes) {
        // the body is never read: the connection is dropped
        (r.Body as { destroy?: () => void } | undefined)?.destroy?.();
        throw new Error(`The stored file is larger than the ${maxBytes} bytes this read allows.`);
      }
      if (!r.Body) return Buffer.alloc(0);
      const bytes = Buffer.from(await r.Body.transformToByteArray());
      if (bytes.length > maxBytes) throw new Error(`The stored file is larger than the ${maxBytes} bytes this read allows.`);
      return bytes;
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.length }));
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const source = `${this.config.bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`;
    await this.client.send(new CopyObjectCommand({ Bucket: this.config.bucket, Key: toKey, CopySource: source }));
  }
}

function isMissing(e: unknown): boolean {
  return e instanceof S3ServiceException && (e.$metadata.httpStatusCode === 404 || e.name === "NotFound" || e.name === "NoSuchKey");
}
