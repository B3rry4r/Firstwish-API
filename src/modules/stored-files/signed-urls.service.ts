import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { StoragePort } from "../../common/ports/storage.port";
import { toWireInstant } from "../../common/time/time";
import type { InternalSignedUrlsSignedReadBody, SignedUrl } from "../../contracts";
import { isUuid, READ_TTL_SECONDS, variantsOf } from "./file-rules";
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

/** E-173 port:signed-urls#signedRead: a signed GET good for 10 minutes, for someone allowed to see the file. */
@Injectable()
export class SignedUrlsService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StoragePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
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
    const variant = input.variant ?? "original";
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
}
