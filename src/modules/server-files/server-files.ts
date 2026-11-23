import { Injectable, Module } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { Inject } from "@nestjs/common";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator, CodeGenerator } from "../../common/ports/ids.port";
import { StoragePort } from "../../common/ports/storage.port";
import { stagingKeyOf } from "../stored-files/file-rules";

export type ServerFilePurpose = "qr-card" | "render" | "export";

/**
 * Makes a file on the server and keeps it as a stored file the account owns. The bytes go to storage outside any database
 * transaction (Y4); the row is written after, and a file that could not be kept is removed again. A signed upload never names
 * the final key (Y1): the bytes go to the staging key and are copied.
 */
export abstract class ServerFileWriter {
  abstract write(input: { ownerAccountId: string; purpose: ServerFilePurpose; contentType: string; bytes: Buffer; kind: "image" | "video" | null }): Promise<string>;
  /**
   * R1: the same, for a file on disk (a rendered video is tens of MB): the file is STREAMED to storage and its hash made on the way,
   * so it is never whole in memory. `bytes` is the file's size. The file is not removed here; the caller owns it.
   */
  abstract writeFile(input: { ownerAccountId: string; purpose: ServerFilePurpose; contentType: string; path: string; bytes: number; kind: "image" | "video" | null }): Promise<string>;
}

@Injectable()
export class StorageServerFileWriter extends ServerFileWriter {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StoragePort,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async write(input: { ownerAccountId: string; purpose: ServerFilePurpose; contentType: string; bytes: Buffer; kind: "image" | "video" | null }): Promise<string> {
    return this.keep(input, input.bytes.length, async (url) => fetch(url.url, { method: url.method, headers: url.headers, body: new Uint8Array(input.bytes) }), () => createHash("sha256").update(input.bytes).digest("hex"));
  }

  async writeFile(input: { ownerAccountId: string; purpose: ServerFilePurpose; contentType: string; path: string; bytes: number; kind: "image" | "video" | null }): Promise<string> {
    const hash = createHash("sha256");
    return this.keep(
      { ...input },
      input.bytes,
      async (url) => {
        const file = createReadStream(input.path);
        file.on("data", (c) => hash.update(c));
        // a stream body: undici reads it piece by piece; the length is the one the signature bound
        try {
          return await fetch(url.url, { method: url.method, headers: url.headers, body: Readable.toWeb(file), duplex: "half" });
        } finally {
          file.destroy();
        }
      },
      () => hash.digest("hex"),
    );
  }

  private async keep(
    input: { ownerAccountId: string; purpose: ServerFilePurpose; contentType: string; kind: "image" | "video" | null },
    size: number,
    put: (signed: { url: string; method: string; headers: Record<string, string> }) => Promise<Response>,
    sha: () => string,
  ): Promise<string> {
    const id = this.ids.id();
    const objectKey = `${input.purpose}/${id}/${this.codes.token(16)}`;
    const staging = stagingKeyOf(objectKey);
    const signed = await this.storage.signUpload({ key: staging, contentType: input.contentType, contentLength: size, expiresInSeconds: 300 });
    const res = await put(signed);
    if (!res.ok) throw new Error(`storage refused the file (${res.status})`);
    try {
      await this.storage.copy(staging, objectKey);
      await this.db.storedFile.create({
        data: {
          id,
          ownerAccountId: input.ownerAccountId,
          purpose: input.purpose === "qr-card" ? "qr_card" : input.purpose,
          objectKey,
          contentType: input.contentType,
          bytes: BigInt(size),
          sha256: sha(),
          status: "ready",
          variants: [],
          driver: this.env.STORAGE_DRIVER ?? "r2",
          kind: input.kind,
          createdAt: this.clock.now(),
        },
      });
    } catch (e) {
      await this.storage.delete(objectKey).catch(() => undefined);
      throw e;
    } finally {
      await this.storage.delete(staging).catch(() => undefined);
    }
    return id;
  }
}

@Module({ providers: [{ provide: ServerFileWriter, useClass: StorageServerFileWriter }], exports: [ServerFileWriter] })
export class ServerFilesModule {}
