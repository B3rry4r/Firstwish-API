import type { PortPing } from "./ping";

export interface SignUpload {
  key: string;
  contentType: string;
  /** X26: the exact size in bytes the PUT must carry; the signature binds it with the content type. */
  contentLength: number;
  expiresInSeconds: number;
}
export interface SignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}
export interface StoredObject {
  size: number;
  contentType: string | null;
}

/**
 * File storage: one S3-style port. Buckets are private; the browser uploads with a signed PUT and reads with a short-lived signed GET.
 * Adapters r2 and spaces are the same S3 adapter with different configuration.
 */
export abstract class StoragePort {
  abstract signUpload(input: SignUpload): Promise<SignedUpload>;
  abstract signDownload(key: string, expiresInSeconds: number): Promise<string>;
  /** Size and type of a stored object, or null when there is none. */
  abstract head(key: string): Promise<StoredObject | null>;
  /** The first `bytes` bytes of an object (for screening by file signature), or null when there is none. */
  abstract readStart(key: string, bytes: number): Promise<Buffer | null>;
  /**
   * The whole object, or null when there is none. `maxBytes` bounds the read: an object larger than that is refused (rejects) before its
   * bytes are read, so a caller that must hold the bytes (a resize) never holds more than it chose to.
   */
  abstract readObject(key: string, maxBytes: number): Promise<Buffer | null>;
  abstract delete(key: string): Promise<void>;
  /** Copies an object inside storage (Y1: a confirmed upload moves from its staging key to a final key no PUT was signed for). */
  abstract copy(fromKey: string, toKey: string): Promise<void>;
  /**
   * CA2: the server writes an object itself (a QR card the server drew), with no signed upload. The caller decides the key and
   * the type from its own bytes; never called inside a database transaction.
   */
  abstract putObject(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** FB4: one cheap authenticated read. Answers ok, or the provider's error; a stand-in answers "stand-in". Never carries a secret. */
  abstract ping(): Promise<PortPing>;
}
