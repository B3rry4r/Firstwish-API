import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { Numbers, NumbersTarget } from "../../contracts";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { LINES, type LineKey } from "./mask";

export const PERIODS = ["month", "7d", "30d", "quarter"] as const;
export type Period = (typeof PERIODS)[number];
const DAY = 86_400_000;

/** The window of a period, ending now. "month" and "quarter" start at the calendar boundary (UTC). */
export function windowOf(period: Period, now: Date): { from: Date; to: Date; days: number } {
  let from: Date;
  if (period === "7d") from = new Date(now.getTime() - 7 * DAY);
  else if (period === "30d") from = new Date(now.getTime() - 30 * DAY);
  else if (period === "quarter") from = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  else from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to: now, days: Math.max(1, Math.ceil((now.getTime() - from.getTime()) / DAY)) };
}

type Count = { key: string; name: string; count: number; paid: number };

/** Numbers (E-79, E-80): every figure is worked out from the tables when asked; the only thing stored is the targets staff set. */
@Injectable()
export class NumbersService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
  ) {}

  /** Net earnings per line in kobo, from the ledger: credits less debits on each revenue account in [from, to). A refund's reversal takes it back. */
  async earned(from: Date, to: Date): Promise<Record<LineKey, number>> {
    const accounts = LINES.map((l) => l.account.replace("_", "-"));
    const rows = await this.db.$queryRaw<{ account: string; net: bigint }[]>`
      SELECT account::text AS account, sum(CASE direction::text WHEN 'credit' THEN "amountKobo" ELSE -"amountKobo" END) AS net
        FROM ledger_entry WHERE account::text = ANY(${accounts}::text[]) AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY account`;
    const by = new Map(rows.map((r) => [r.account, Number(r.net)]));
    return Object.fromEntries(LINES.map((l) => [l.line, by.get(l.account.replace("_", "-")) ?? 0])) as Record<LineKey, number>;
  }

  async targets(): Promise<Record<LineKey, number | null>> {
    const rows = await this.db.numbersTarget.findMany({ where: { period: "month" } });
    const by = new Map(rows.map((r) => [r.line as string, Number(r.targetKobo)]));
    return Object.fromEntries(LINES.map((l) => [l.line, by.get(l.line) ?? null])) as Record<LineKey, number | null>;
  }

  async read(period: Period = "month"): Promise<Numbers> {
    if (!PERIODS.includes(period)) throw AppError.validation({ period: `Must be one of ${PERIODS.join(", ")}.` });
    const { from, to, days } = windowOf(period, this.clock.now());
    const earned = await this.earned(from, new Date(to.getTime() + 1));
    const groupBy = async (col: "kind" | "occasion" | "styleSlug"): Promise<Count[]> => {
      const rows = await this.db.$queryRawUnsafe<{ key: string; count: bigint; paid: bigint }[]>(
        `SELECT "${col}" AS key, count(*) AS count, count("sealedAt") AS paid FROM wish WHERE "createdAt" >= $1 AND "createdAt" <= $2 GROUP BY "${col}" ORDER BY count(*) DESC, "${col}"`,
        from, to);
      return rows.map((r) => ({ key: r.key, name: r.key, count: Number(r.count), paid: Number(r.paid) }));
    };
    const [tot] = await this.db.$queryRaw<{ previews: bigint; paid: bigint }[]>`
      SELECT count(*) AS previews, count("sealedAt") AS paid FROM wish WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}`;
    const opens = await this.db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, count(*) AS count FROM wish_open
       WHERE first AND "createdAt" >= ${from} AND "createdAt" <= ${to} GROUP BY 1 ORDER BY 1`;
    const keeps = await this.db.$queryRaw<{ key: string; count: bigint }[]>`
      SELECT keep::text AS key, count(*) AS count FROM wish WHERE keep IS NOT NULL AND "createdAt" >= ${from} AND "createdAt" <= ${to} GROUP BY keep ORDER BY keep::text`;
    return {
      period,
      days,
      lines: LINES.map((l) => ({ line: l.line, name: l.name, definition: l.definition, amount: earned[l.line] })),
      targets: await this.targets(),
      previews: Number(tot?.previews ?? 0),
      paid: Number(tot?.paid ?? 0),
      opens: opens.map((o) => ({ day: o.day.toISOString().slice(0, 10), count: Number(o.count) })) as unknown as Numbers["opens"],
      kinds: await groupBy("kind"),
      occasions: await groupBy("occasion"),
      styles: await groupBy("styleSlug"),
      keeps: keeps.map((k) => ({ key: k.key, name: k.key, count: Number(k.count) })),
    };
  }

  /** E-80: sets one line's monthly target. One statement (insert or update), one audit row, one transaction. */
  async setTarget(body: { line: NumbersTarget["line"]; period: "month"; targetKobo: number; reason: string }, actor: AuditActor): Promise<NumbersTarget> {
    const reason = requireReason(body.reason);
    const staffId = actor.id as string;
    return this.db.$transaction(async (tx) => {
      const now = this.clock.now();
      // HF3: the target names the staff member who set it (a foreign key): a principal with no staff row is refused, not a 500.
      const known = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM staff_account WHERE id = ${staffId}::uuid`;
      if (!known.length) throw AppError.forbidden("Only a team member can set a target.");
      const rows = await tx.$queryRaw<{ targetKobo: bigint; setAt: Date }[]>`
        INSERT INTO numbers_target (id, line, period, "setAt", "setBy", "targetKobo")
        VALUES (${this.ids.id()}::uuid, ${body.line}::"NumbersTargetLine", ${body.period}::"NumbersTargetPeriod", ${now}, ${staffId}::uuid, ${BigInt(body.targetKobo)})
        ON CONFLICT (line, period) DO UPDATE SET "targetKobo" = EXCLUDED."targetKobo", "setAt" = EXCLUDED."setAt", "setBy" = EXCLUDED."setBy"
        RETURNING "targetKobo", "setAt"`;
      await this.audit.write(tx, { actor, section: "/admin/numbers", action: "numbers.target", target: { type: "NumbersTarget", id: `${body.line}:${body.period}` }, reason, changedFields: ["targetKobo"] });
      return { line: body.line, period: body.period, targetKobo: Number(rows[0].targetKobo), setAt: toWireInstant(rows[0].setAt), setBy: staffId };
    });
  }
}
