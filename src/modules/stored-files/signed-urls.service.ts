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

/**
 * Who reads. "owner": the file's owner, checked here as a query condition. "allowed": a caller that has already proved the reader
 * may see the wish or shoot that holds the file (the receiver's read, B10); it gets only files that passed screening, never a held one.
 */
export type Reader = { type: "owner"; accountId: string } | { type: "allowed" };

/** E-173's SignedUrl plus the signed GET itself (HALT reported: the registry's SignedUrl has no url). */
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

  async signedRead(input: InternalSignedUrlsSignedReadBody, reader: Reader): Promise<SignedRead> {
    if (!isUuid(input.fileId)) throw AppError.notFound("No such file.");
    const where: Prisma.StoredFileWhereInput =
      reader.type === "owner"
        ? { id: input.fileId, ownerAccountId: reader.accountId, status: { in: ["ready", "screening"] } }
        : { id: input.fileId, status: "ready" };
    const file = await this.db.storedFile.findFirst({ where });
    if (!file) throw AppError.notFound("No such file.");
    const variant = input.variant ?? "original";
    let key = file.objectKey;
    if (variant !== "original") {
      const v = variantsOf(file).find((x) => `w${x.width}` === variant);
      if (!v) throw AppError.notFound("No such size of this file.");
      key = v.key;
    }
    await this.db.signedUrl.create({ data: { id: this.ids.id(), fileId: file.id, variant } });
    const url = await this.storage.signDownload(key, READ_TTL_SECONDS);
    return { fileId: file.id, variant, url, expiresAt: toWireInstant(new Date(this.clock.now().getTime() + READ_TTL_SECONDS * 1000)) };
  }
}
