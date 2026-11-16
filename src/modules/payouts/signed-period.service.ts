import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";

/** The price book's Signed line is 30 days ({ signed: true, days: 30 }); a grant that names no days is read the same way. */
export const SIGNED_DEFAULT_DAYS = 30;

/**
 * WW8 (GG6): the timed job that ends a creator's Signed period. Each purchase of the Signed line is a grant (purchase_grant: its
 * start, its end when the handler wrote one, else the start plus the `days` the price book line gave). Signed stands while one grant
 * that is not revoked or refused has not reached its end. When none stands, the creator stops being signed (CreatorState.signed and
 * Creator.signed become false). Run again: nothing changes (a creator already not signed is not touched).
 */
@Injectable()
export class SignedPeriodService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Ends every Signed period whose end has passed. Answers how many creators stopped being signed. */
  async endDue(): Promise<number> {
    const signed = await this.db.$queryRaw<{ accountId: string }[]>`
      SELECT "accountId"::text AS "accountId" FROM creator_state WHERE signed = true AND "accountId" IS NOT NULL ORDER BY id`;
    let ended = 0;
    for (const d of signed) if (await this.endOne(d.accountId)) ended += 1;
    return ended;
  }

  private async endOne(accountId: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      try {
        await lockAccount(tx, accountId);
      } catch (e) {
        if (e instanceof AppError && (e.code === "account_erased" || e.code === "not_found")) return false;
        throw e;
      }
      const now = this.clock.now();
      const rows = await tx.$queryRaw<{ id: string; signed: boolean | null }[]>`SELECT id::text AS id, signed FROM creator_state WHERE "accountId" = ${accountId}::uuid FOR UPDATE`;
      if (!rows[0] || rows[0].signed !== true) return false;
      const standing = await tx.$queryRaw<{ n: number }[]>`
        SELECT 1 AS n FROM purchase_grant g
         WHERE g."accountId" = ${accountId}::uuid AND g.sku = 'creator.signed' AND g."revokedAt" IS NULL AND g."refusedReason" IS NULL
           AND COALESCE(g."endsAt", g."startsAt" + make_interval(days => COALESCE(NULLIF(g.detail->>'days', '')::int, ${SIGNED_DEFAULT_DAYS}::int))) > ${now}
         LIMIT 1`;
      if (standing.length) return false;
      await tx.$executeRaw`UPDATE creator_state SET signed = false, version = version + 1 WHERE id = ${rows[0].id}::uuid`;
      await tx.$executeRaw`UPDATE creator SET signed = false, version = version + 1 WHERE "accountId" = ${accountId}::uuid AND signed = true`;
      return true;
    });
  }
}
