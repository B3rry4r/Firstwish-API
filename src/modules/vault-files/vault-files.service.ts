import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import type { UserPrincipal } from "../../common/auth/principal";
import { decodeCursor, DEFAULT_LIMIT, toPage } from "../../common/pagination/cursor";
import type { GetBusinessVaultFilesQuery, GetBusinessVaultFilesResponse } from "../../contracts";
import { isUuid } from "../stored-files/file-rules";
import { SignedUrlsService } from "../stored-files/signed-urls.service";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** VaultFile: a view over the business's confirmed Vault files (stored_file, purpose vault-file). */
@Injectable()
export class VaultFilesService {
  constructor(
    private readonly db: PrismaService,
    private readonly reads: SignedUrlsService,
  ) {}

  /** E-214: newest first; each with a signed GET good for 10 minutes. A held file shows to its business owner only. */
  async list(p: UserPrincipal, q: GetBusinessVaultFilesQuery): Promise<GetBusinessVaultFilesResponse> {
    const biz = await this.db.business.findFirst({ where: { accountId: p.accountId }, select: { id: true } });
    if (!biz) throw AppError.forbidden("Vault files need a business.");
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.StoredFileWhereInput = { businessId: biz.id, ownerAccountId: p.accountId, purpose: "vault_file", status: { in: ["ready", "screening"] } };
    if (q.cursor) {
      const at = decodeCursor(q.cursor).id;
      if (!isUuid(at)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.id = { lt: at };
    }
    const rows = await this.db.storedFile.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    const items = [];
    for (const r of page.items) {
      const read = await this.reads.signedRead({ fileId: r.id }, { type: "owner", accountId: p.accountId });
      items.push({ id: r.id, name: `vault-${r.id.slice(-12)}.${EXT[r.contentType] ?? "bin"}`, size: Number(r.bytes), url: read.url });
    }
    return { items, nextCursor: page.nextCursor };
  }
}
