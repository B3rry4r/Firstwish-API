import { Injectable } from "@nestjs/common";
import type { Prisma, StoredFile as FileRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { StoragePort } from "../../common/ports/storage.port";
import { toWireInstant } from "../../common/time/time";
import type { InternalSignedUrlsSignedReadBody, SignedUrl } from "../../contracts";
import { IMAGE_WIDTHS, isUuid, READ_TTL_SECONDS, variantsOf } from "./file-rules";
import { photoNotShown, PhotoCleaner } from "./photo-cleaner";
import { businessAccessOf } from "./vault-access";

/**
 * Who reads. "owner": the file's owner, checked here as a query condition. "allowed": a caller that has already proved the reader
 * may see the wish or shoot that holds the file (the receiver's read, B10); it gets only files that passed screening, never a held one.
 * "staff" (HP12): a staff member who may moderate reads a photo held by screening; the caller checks the role and writes the audit row.
 * "vault" (X27): a Vault file read by its business's owner (a held file too) or by one of the business's logins (passed files only).
 */
export type Reader = { type: "owner"; accountId: string } | { type: "allowed" } | { type: "vault"; accountId: string } | { type: "staff" };

/** E-173's SignedUrl ({url, expiresAt}, X20) and which file and size it is for. */
export interface SignedRead extends SignedUrl {
  fileId: string;
  variant: string;
}

/** IM1: one size of a picture as a view gives it: the signed address of w320, w768 or w1600, or (sized false: the job has not made it, or failed) the clean full-size copy. */
export interface SizedRead {
  width: number;
  variant: string;
  url: string;
  expiresAt: string;
  sized: boolean;
}

/** E-173 port:signed-urls#signedRead: a signed GET good for 10 minutes, for someone allowed to see the file. */
@Injectable()
export class SignedUrlsService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StoragePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly cleaner: PhotoCleaner,
  ) {}

  /** `ttlSeconds` (R3: a render's files live as long as the render may run) replaces the ten minutes; nothing else passes it. */
  async signedRead(input: InternalSignedUrlsSignedReadBody, reader: Reader, ttlSeconds: number = READ_TTL_SECONDS): Promise<SignedRead> {
    if (!isUuid(input.fileId)) throw AppError.notFound("No such file.");
    let where: Prisma.StoredFileWhereInput;
    if (reader.type === "owner") where = { id: input.fileId, ownerAccountId: reader.accountId, status: { in: ["ready", "screening"] } };
    else if (reader.type === "vault") {
      const access = await businessAccessOf(this.db, reader.accountId);
      where = {
        id: input.fileId,
        purpose: "vault_file",
        OR: [
          { businessId: { in: access.owned }, status: { in: ["ready", "screening"] } },
          { businessId: { in: access.member }, status: "ready" },
        ],
      };
    } else if (reader.type === "staff") where = { id: input.fileId, status: { in: ["ready", "screening"] } };
    else where = { id: input.fileId, status: "ready" };
    const file = await this.db.storedFile.findFirst({ where });
    if (!file) throw AppError.notFound("No such file.");
    await this.cleanFirst(file, reader);
    return this.grant(file, input.variant ?? "original", ttlSeconds);
  }

  /**
   * IM1: the address of a picture is given only for bytes that are clean. A picture not yet clean (stored before round 23) is made clean now, and the
   * read waits for it. One that cannot be opened (a HEIC stored before, a damaged file) is given to no one but its own owner (the owner reads their
   * own file; a Vault's owner, theirs): everyone else gets the plain words (a 404 that the reads which leave out a file they cannot give leave out).
   */
  private async cleanFirst(file: FileRow, reader: Reader): Promise<void> {
    if (!file.contentType.startsWith("image/") || file.cleanAt) return;
    if (await this.cleaner.cleanStored(file)) {
      file.cleanAt = this.clock.now();
      return;
    }
    if (reader.type === "owner" || reader.type === "vault") {
      const mine = reader.type === "owner" ? file.ownerAccountId === reader.accountId : file.businessId !== null && (await businessAccessOf(this.db, reader.accountId)).owned.includes(file.businessId);
      if (mine) return;
    }
    throw photoNotShown();
  }

  private async grant(file: FileRow, variant: string, ttlSeconds: number): Promise<SignedRead> {
    let key = file.objectKey;
    if (variant !== "original") {
      const v = variantsOf(file).find((x) => `w${x.width}` === variant);
      if (!v) throw AppError.notFound("No such size of this file.");
      key = v.key;
    }
    const expiresAt = new Date(this.clock.now().getTime() + ttlSeconds * 1000);
    // X20: the row records the read granted (file, size, expiry); the link itself is never stored.
    await this.db.signedUrl.create({ data: { id: this.ids.id(), fileId: file.id, variant, expiresAt } });
    const url = await this.storage.signDownload(key, ttlSeconds);
    return { fileId: file.id, variant, url, expiresAt: toWireInstant(expiresAt) };
  }

  /**
   * IM1: the full-size clean copy and the three sizes (w320, w768, w1600) of one picture, for the views that show it (the owner's wish read, the public
   * link, the render read). A size the job has not made yet, or could not make, is the clean full-size copy (sized false): never nothing, never the
   * untouched original (none is kept). Same readers and rules as signedRead.
   */
  async signedSet(input: InternalSignedUrlsSignedReadBody, reader: Reader, ttlSeconds: number = READ_TTL_SECONDS): Promise<{ read: SignedRead; sizes: SizedRead[] }> {
    const read = await this.signedRead(input, reader, ttlSeconds);
    const file = await this.db.storedFile.findUnique({ where: { id: read.fileId } });
    const have = file ? variantsOf(file) : [];
    const sizes: SizedRead[] = [];
    for (const width of IMAGE_WIDTHS) {
      if (file && have.some((v) => v.width === width)) {
        const g = await this.grant(file, `w${width}`, ttlSeconds);
        sizes.push({ width, variant: g.variant, url: g.url, expiresAt: g.expiresAt, sized: true });
      } else sizes.push({ width, variant: `w${width}`, url: read.url, expiresAt: read.expiresAt, sized: false });
    }
    return { read, sizes };
  }
}
