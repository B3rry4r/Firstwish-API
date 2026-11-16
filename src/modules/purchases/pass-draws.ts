import { Injectable, Module } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";

type Tx = Prisma.TransactionClient;
export type PassCounter = "wishes" | "upgrades";
export type PassDrawKind = "wish" | "upgrade";

/**
 * Drawing from an account's Pass (GG3, GG5). It stands apart from PassService so the wish bundle can draw in the transaction of the
 * wish it is sealing or upgrading without the wish bundle and the purchases bundle needing each other.
 */
@Injectable()
export class PassDrawService {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Draws one wish or one upgrade for ONE wish: the counter first (one conditional statement), then the draw row, whose unique key
   * (wish, kind) keeps a wish from drawing twice. Answers "drawn", "already" (this wish has drawn this kind: nothing more is taken)
   * or "none" (no live Pass with one left). Run it with the wish row locked, in the wish's own transaction.
   */
  async drawFor(tx: Tx, accountId: string, wishId: string, kind: PassDrawKind): Promise<"drawn" | "already" | "none"> {
    if (await tx.passDraw.findUnique({ where: { wishId_kind: { wishId, kind } }, select: { id: true } })) return "already";
    const membershipId = await this.counter(tx, accountId, kind === "wish" ? "wishes" : "upgrades");
    if (!membershipId) return "none";
    await tx.passDraw.create({ data: { id: this.ids.id(), accountId, wishId, membershipId, kind, createdAt: this.clock.now() } });
    return "drawn";
  }

  async counter(tx: Tx, accountId: string, counter: PassCounter): Promise<string | null> {
    const now = this.clock.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows =
        counter === "wishes"
          ? await tx.$queryRaw<{ id: string }[]>`
              UPDATE pass_membership pm SET "wishesUsed" = COALESCE(pm."wishesUsed", 0) + 1, version = pm.version + 1
                FROM purchase_grant g
               WHERE g."paymentId" = pm."paymentId" AND g.sku = 'pass.year' AND g."revokedAt" IS NULL
                 AND COALESCE(pm."wishesUsed", 0) < (g.detail->>'wishes')::int
                 AND pm.id = (SELECT p2.id FROM pass_membership p2 JOIN purchase_grant g2 ON g2."paymentId" = p2."paymentId" AND g2.sku = 'pass.year' AND g2."revokedAt" IS NULL
                               WHERE p2."accountId" = ${accountId}::uuid AND p2.state = 'active' AND p2.since <= ${now}::timestamptz
                                 AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz
                                 AND COALESCE(p2."wishesUsed", 0) < (g2.detail->>'wishes')::int
                               ORDER BY p2.since, p2.id LIMIT 1)
              RETURNING pm.id::text AS id`
          : await tx.$queryRaw<{ id: string }[]>`
              UPDATE pass_membership pm SET "upgradesUsed" = COALESCE(pm."upgradesUsed", 0) + 1, version = pm.version + 1
                FROM purchase_grant g
               WHERE g."paymentId" = pm."paymentId" AND g.sku = 'pass.year' AND g."revokedAt" IS NULL
                 AND COALESCE(pm."upgradesUsed", 0) < (g.detail->>'upgrades')::int
                 AND pm.id = (SELECT p2.id FROM pass_membership p2 JOIN purchase_grant g2 ON g2."paymentId" = p2."paymentId" AND g2.sku = 'pass.year' AND g2."revokedAt" IS NULL
                               WHERE p2."accountId" = ${accountId}::uuid AND p2.state = 'active' AND p2.since <= ${now}::timestamptz
                                 AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz
                                 AND COALESCE(p2."upgradesUsed", 0) < (g2.detail->>'upgrades')::int
                               ORDER BY p2.since, p2.id LIMIT 1)
              RETURNING pm.id::text AS id`;
      if (rows.length) return rows[0].id;
      // The row picked was drawn empty by a rival between the pick and the update: look once more for another with a place left.
      const left = await this.hasPlace(tx, accountId, counter, now);
      if (!left) return null;
    }
    return null;
  }

  private async hasPlace(tx: Tx, accountId: string, counter: PassCounter, now: Date): Promise<boolean> {
    const col = counter === "wishes" ? "wishes" : "upgrades";
    const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pass_membership p JOIN purchase_grant g ON g."paymentId" = p."paymentId" AND g.sku = 'pass.year' AND g."revokedAt" IS NULL
        WHERE p."accountId" = $1::uuid AND p.state = 'active' AND p.since <= $2::timestamptz AND (("validUntil" #>> '{}'))::timestamptz > $2::timestamptz
          AND COALESCE(p."${col}Used", 0) < (g.detail->>'${col}')::int`,
      accountId,
      now,
    );
    return (rows[0]?.n ?? 0) > 0;
  }

}

/** Imported by the wish bundle and the purchases bundle. */
@Module({ providers: [PassDrawService], exports: [PassDrawService] })
export class PassDrawsModule {}
