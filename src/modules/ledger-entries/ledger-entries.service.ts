import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { toWireInstant } from "../../common/time/time";
import type { LedgerEntry } from "../../contracts";

/** The ledger accounts on the wire (the database's names with a dash). */
export const LEDGER_ACCOUNTS = [
  "customer-cash", "provider-clearing", "revenue-tickets", "revenue-extras", "revenue-keeps", "revenue-pass", "revenue-pro", "revenue-vault",
  "revenue-concierge", "revenue-creator", "vat-payable", "provider-fees", "refunds", "royalties-payable", "payouts",
] as const;
const DAY_MS = 86_400_000;
const startOf = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/**
 * E-64: ledger rows for staff, newest first, by cursor. Read only. A row is ids, an account, a direction, kobo and a memo of
 * references: nothing about a person. The window is whole UTC days, `from` first day to `to` last day (the same day the settlement check uses).
 */
@Injectable()
export class LedgerEntriesService {
  constructor(private readonly db: PrismaService) {}

  async list(q: { account?: string; from: string; to: string; cursor?: string; limit: number }): Promise<Page<LedgerEntry>> {
    const from = startOf(q.from);
    const to = new Date(startOf(q.to).getTime() + DAY_MS);
    if (to.getTime() <= from.getTime()) throw AppError.validation({ to: "Must not be before from." });
    if (to.getTime() - from.getTime() > 366 * DAY_MS) throw AppError.validation({ to: "Ask for at most a year at a time." });
    if (q.account !== undefined && !(LEDGER_ACCOUNTS as readonly string[]).includes(q.account)) {
      throw AppError.validation({ account: `Must be one of ${LEDGER_ACCOUNTS.join(", ")}.` });
    }
    const where: Prisma.LedgerEntryWhereInput[] = [{ createdAt: { gte: from, lt: to } }];
    if (q.account) where.push({ account: q.account.replace(/-/g, "_") as never });
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.push({ id: { lt: c.id } });
    }
    const rows = await this.db.ledgerEntry.findMany({ where: { AND: where }, orderBy: { id: "desc" }, take: q.limit + 1 });
    const page = toPage(rows, q.limit, (r) => ({ key: r.id, id: r.id }));
    return {
      items: page.items.map((r) => ({
        id: r.id,
        journalId: r.journalId,
        account: r.account.replace(/_/g, "-") as LedgerEntry["account"],
        direction: r.direction,
        amountKobo: Number(r.amountKobo),
        currency: r.currency,
        paymentId: r.paymentId,
        refundId: r.refundId,
        payoutId: r.payoutId,
        // a memo is references; an address in it (nothing writes one) is cut out all the same
        memo: r.memo.replace(/\S+@\S+/g, "").trim(),
        createdAt: toWireInstant(r.createdAt),
        from: toWireInstant(from),
        to: toWireInstant(new Date(to.getTime() - 1)),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
