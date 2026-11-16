import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { StaffRole } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { normaliseDateOnly, toWireInstant } from "../../common/time/time";
import type { Overview } from "../../contracts";
import { RoleAccessService } from "../role-access/role-access.service";
import { LINES, lineOfPurpose, maskEmail } from "./mask";
import { NumbersService } from "./numbers.service";
import { QueuesService } from "./queues.service";
import { TableProbe } from "./table-probe";

const DAY = 86_400_000;

/**
 * The Overview (E-82): the day's counts, what was taken today, what waits, what failed. Every number is read from the tables when
 * asked, and only the parts the caller's role opens are in the answer; a part whose bundle is absent is left out, never a zero.
 * The day is a UTC calendar day (`?day=YYYY-MM-DD`, today by default).
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly access: RoleAccessService,
    private readonly probe: TableProbe,
    private readonly queues: QueuesService,
    private readonly numbers: NumbersService,
  ) {}

  async read(roles: readonly StaffRole[], dayText?: string): Promise<Overview> {
    const now = this.clock.now();
    let day = now.toISOString().slice(0, 10);
    if (dayText !== undefined) {
      const d = normaliseDateOnly(dayText);
      if (!d) throw AppError.validation({ day: "Must be a date, YYYY-MM-DD." });
      day = d;
    }
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(from.getTime() + DAY);
    const wishes = (await this.access.opens(roles, "/admin/wishes")) && (await this.probe.has("wish"));
    const money = (await this.access.opens(roles, "/admin/payments")) && (await this.probe.has("payment"));
    const messages = (await this.access.opens(roles, "/admin/messages")) && (await this.probe.has("message_delivery"));

    const out: Record<string, unknown> = { day };
    const today: Record<string, number> = {};
    if (wishes) {
      const [r] = await this.db.$queryRaw<{ sealed: bigint; opened: bigint }[]>`
        SELECT count(*) FILTER (WHERE "sealedAt" >= ${from} AND "sealedAt" < ${to}) AS sealed,
               count(*) FILTER (WHERE "openedAt" >= ${from} AND "openedAt" < ${to}) AS opened FROM wish`;
      today.sealed = Number(r.sealed);
      today.opened = Number(r.opened);
    }
    if (money) {
      const [r] = await this.db.$queryRaw<{ paid: bigint }[]>`
        SELECT count(*) AS paid FROM payment WHERE "verifiedAt" >= ${from} AND "verifiedAt" < ${to} AND status::text IN ('succeeded', 'refunded', 'partly-refunded')`;
      today.paid = Number(r.paid);
    }
    if (Object.keys(today).length) out.today = today;
    if (money && (await this.probe.has("ledger_entry"))) {
      const earned = await this.numbers.earned(from, to);
      out.takings = LINES.map((l) => ({ line: l.line, amount: earned[l.line] }));
    }
    out.queues = await this.queues.read(roles);
    if (money) {
      const rows = await this.db.payment.findMany({ where: { status: "failed" }, orderBy: { id: "desc" }, take: 20 });
      out.failedPayments = rows.map((p) => ({
        ref: p.providerReference, what: p.purpose, line: lineOfPurpose(p.purpose), amount: Number(p.amountKobo), state: "failed", at: toWireInstant(p.createdAt), person: p.accountId ?? "",
      }));
    }
    if (messages) {
      const rows = await this.db.messageDelivery.findMany({ where: { status: "failed" }, orderBy: { id: "desc" }, take: 20 });
      out.failedMessages = rows.map((m) => ({ id: m.id, what: m.templateKey, channel: "email", to: maskEmail(m.to), state: "failed", at: toWireInstant(m.createdAt) }));
    }
    return out as unknown as Overview;
  }
}
