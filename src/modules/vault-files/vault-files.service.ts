import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import type { UserPrincipal } from "../../common/auth/principal";
import { decodeCursor, DEFAULT_LIMIT, toPage } from "../../common/pagination/cursor";
import type { GetBusinessVaultFilesQuery, GetBusinessVaultFilesResponse, PatchBusinessVaultFilesByIdResponse } from "../../contracts";
import { isUuid } from "../stored-files/file-rules";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { notInBusiness } from "../../common/auth/login-removed";
import { businessAccessOf } from "../stored-files/vault-access";

/** IB3: the longest name a file may be given. */
const FILE_NAME_MAX = 100;

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

  /** E-214: newest first; each with a signed GET good for 10 minutes. A held file shows to the business's owner only. */
  async list(p: UserPrincipal, q: GetBusinessVaultFilesQuery): Promise<GetBusinessVaultFilesResponse> {
    // X27: the business's owner, or one of its logins. An owner sees held files too; a member sees only files that passed screening.
    const access = await businessAccessOf(this.db, p.accountId);
    const businessId = access.owned[0] ?? access.member[0];
    if (!businessId) throw await notInBusiness(this.db, p.accountId, "Vault files need a business.");
    const isOwner = access.owned.includes(businessId);
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.StoredFileWhereInput = { businessId, purpose: "vault_file", status: isOwner ? { in: ["ready", "screening"] } : "ready" };
    if (q.cursor) {
      const at = decodeCursor(q.cursor).id;
      if (!isUuid(at)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.id = { lt: at };
    }
    const rows = await this.db.storedFile.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    const items = [];
    for (const r of page.items) {
      const read = await this.reads.signedRead({ fileId: r.id }, { type: "vault", accountId: p.accountId });
      items.push({ id: r.id, name: r.shownName || `vault-${r.id.slice(-12)}.${EXT[r.contentType] ?? "bin"}`, size: Number(r.bytes), url: read.url });
    }
    return { items, nextCursor: page.nextCursor };
  }

  /**
   * IB3 (E-278): the name a Vault file shows under. The business's owner and its live logins; a file of another business (or one that is not a
   * Vault file) is 404, and so is a held file for a login (it sees only files that passed screening). The stored object keeps its own name.
   */
  async rename(p: UserPrincipal, id: string, nameIn: unknown): Promise<PatchBusinessVaultFilesByIdResponse> {
    if (!isUuid(id)) throw AppError.notFound("No such file.");
    const name = typeof nameIn === "string" ? nameIn.trim().replace(/\s+/g, " ") : "";
    // eslint-disable-next-line no-control-regex
    if (!name || name.length > FILE_NAME_MAX || /[\\/\u0000-\u001f]/.test(name)) throw AppError.validation({ name: `Must be a file name of 1 to ${FILE_NAME_MAX} characters, with no slash.` });
    const access = await businessAccessOf(this.db, p.accountId);
    if (!access.owned.length && !access.member.length) throw await notInBusiness(this.db, p.accountId, "Vault files need a business.");
    const n = await this.db.storedFile.updateMany({
      where: {
        id,
        purpose: "vault_file",
        OR: [
          { businessId: { in: access.owned }, status: { in: ["ready", "screening"] } },
          { businessId: { in: access.member }, status: "ready" },
        ],
      },
      data: { shownName: name },
    });
    if (n.count === 0) throw AppError.notFound("No such file.");
    const row = await this.db.storedFile.findUniqueOrThrow({ where: { id } });
    const read = await this.reads.signedRead({ fileId: id }, { type: "vault", accountId: p.accountId });
    return { id, name: row.shownName || `vault-${id.slice(-12)}.${EXT[row.contentType] ?? "bin"}`, size: Number(row.bytes), url: read.url };
  }
}
