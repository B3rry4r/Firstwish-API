import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { StaffRole } from "../../common/auth/principal";
import { Clock } from "../../common/ports/clock.port";
import { toWireInstant } from "../../common/time/time";
import type { Queue } from "../../contracts";
import { ReportsService } from "../moderation/reports.service";
import { RoleAccessService } from "../role-access/role-access.service";
import { SupportService } from "../support/support.service";
import { TableProbe } from "./table-probe";

interface Counted {
  count: number;
  oldest: Date | null;
}
interface Part {
  key: string;
  label: string;
  href: string;
  /** The admin section that opens it, or the roles that may (the jobs queue has no section). */
  section?: string;
  roles?: StaffRole[];
  /** The tables its bundle owns: when one is missing the part is left out. */
  tables: string[];
  read: () => Promise<Counted>;
}

const one = (rows: { n: bigint | number; oldest: Date | null }[]): Counted => ({ count: Number(rows[0]?.n ?? 0), oldest: rows[0]?.oldest ?? null });

/**
 * What waits for someone: one read, changes nothing. Each part is a count and the time of the oldest thing waiting.
 * Counts another bundle already gives (reports, support) come from its service; the rest are read here from the tables.
 * A part the caller's role does not open, or whose bundle is absent, is left out of the answer (never a zero).
 */
@Injectable()
export class QueuesService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly access: RoleAccessService,
    private readonly probe: TableProbe,
    private readonly reports: ReportsService,
    private readonly support: SupportService,
  ) {}

  private parts(): Part[] {
    const db = this.db;
    const now = (): Date => this.clock.now();
    let memo: ReturnType<ReportsService["counts"]> | null = null;
    const counts = (): ReturnType<ReportsService["counts"]> => (memo ??= this.reports.counts());
    const oldestOf = async (where: "other" | "this-is-me" | "flagged"): Promise<Date | null> =>
      one(
        where === "flagged"
          ? await db.$queryRaw`SELECT 0 AS n, min("createdAt") AS oldest FROM screening_result WHERE verdict = 'review' AND "finalVerdict" IS NULL`
          : where === "this-is-me"
            ? await db.$queryRaw`SELECT 0 AS n, min("createdAt") AS oldest FROM report WHERE status = 'open' AND reason = 'this-is-me'`
            : await db.$queryRaw`SELECT 0 AS n, min("createdAt") AS oldest FROM report WHERE status = 'open' AND reason <> 'this-is-me'`,
      ).oldest;
    return [
      { key: "reports", label: "Reports to act on", href: "/admin/moderation?queue=report", section: "/admin/moderation", tables: ["report"], read: async () => ({ count: (await counts()).reports, oldest: await oldestOf("other") }) },
      {
        key: "flagged", label: "Photos flagged by screening", href: "/admin/moderation?queue=flagged", section: "/admin/moderation", tables: ["screening_result"],
        read: async () => ({ count: (await counts()).flagged, oldest: await oldestOf("flagged") }),
      },
      { key: "takedown", label: "Takedown requests", href: "/admin/moderation?queue=takedown", section: "/admin/moderation", tables: ["report"], read: async () => ({ count: (await counts()).takedowns, oldest: await oldestOf("this-is-me") }) },
      {
        key: "publish", label: "Publish requests for Now Showing", href: "/admin/showing", section: "/admin/showing", tables: ["publish_request"],
        read: async () => one(await db.$queryRaw`SELECT count(*) AS n, min("createdAt") AS oldest FROM publish_request WHERE status = 'waiting'`),
      },
      {
        key: "styles", label: "Styles sent in by creators", href: "/admin/styles/review", section: "/admin/styles/review", tables: ["style_submission"],
        read: async () => one(await db.$queryRaw`SELECT count(*) AS n, min("createdAt") AS oldest FROM style_submission WHERE status = 'review'`),
      },
      {
        key: "support", label: "Support threads needing a reply", href: "/admin/support", section: "/admin/support", tables: ["support_thread"],
        read: async () => ({ count: (await this.support.counts()).open, oldest: one(await db.$queryRaw`SELECT count(*) AS n, min("updatedAt") AS oldest FROM support_thread WHERE status = 'open'`).oldest }),
      },
      {
        key: "taken", label: "Wishes taken down", href: "/admin/wishes?state=down", section: "/admin/wishes", tables: ["wish"],
        read: async () => one(await db.$queryRaw`SELECT count(*) AS n, min("removedAt") AS oldest FROM wish WHERE status = 'removed' AND "erasedAt" IS NULL`),
      },
      {
        key: "refunds", label: "Refunds due", href: "/admin/payments?flag=refund_due", section: "/admin/payments", tables: ["payment"],
        read: async () => one(await db.$queryRaw`SELECT count(*) AS n, min("updatedAt") AS oldest FROM payment WHERE 'refund_due' = ANY(flags) AND status IN ('succeeded', 'partly-refunded')`),
      },
      {
        key: "concierge", label: "Concierge orders late", href: "/admin/concierge", section: "/admin/concierge", tables: ["concierge_order", "concierge_order_ext"],
        read: async () =>
          one(await db.$queryRaw`
            SELECT count(*) AS n, min(e."dueAt") AS oldest FROM concierge_order o JOIN concierge_order_ext e ON e."orderId" = o.id
             WHERE o.status IN ('paid', 'making') AND e."dueAt" IS NOT NULL AND e."dueAt" < ${now()}`),
      },
      {
        key: "jobs", label: "Jobs that failed", href: "/admin/jobs", roles: ["ops", "owner"], tables: ["job"],
        read: async () => one(await db.$queryRaw`SELECT count(*) AS n, min("runAt") AS oldest FROM job WHERE status IN ('failed', 'dead')`),
      },
    ];
  }

  /** The queues this staff member's roles open, in a fixed order. */
  async read(roles: readonly StaffRole[]): Promise<Queue[]> {
    const out: Queue[] = [];
    for (const p of this.parts()) {
      const allowed = p.roles ? p.roles.some((r) => roles.includes(r)) : await this.access.opens(roles, p.section as string);
      if (!allowed) continue;
      let present = true;
      for (const t of p.tables) present = present && (await this.probe.has(t));
      if (!present) continue;
      const c = await p.read();
      out.push({ key: p.key, label: p.label, count: c.count, href: p.href, oldest: c.oldest ? toWireInstant(c.oldest) : null });
    }
    return out;
  }
}
