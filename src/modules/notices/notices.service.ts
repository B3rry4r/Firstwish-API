import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma, type $Enums } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { normaliseEmail } from "../../common/normalise/email";
import { Clock } from "../../common/ports/clock.port";
import { EmailPort } from "../../common/ports/email.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { isPortTimeout } from "../../common/ports/time-limit";
import { isTimeZone } from "../../common/time/time";
import { ProviderError } from "../../common/ports/adapters/http";
import { JobContext, JobResult, JobsService } from "../jobs/jobs.service";
import {
  CODE_WORDING_FALLBACK, DELIVERY_TRIES, fill, fillSubject, scrubReason, isTemplateKey, MissingValueError, missingValues, NOTICE_HOUR_LOCAL, RETRY_WAIT_MS, scrubEmails, TEMPLATES, TemplateKey, type TemplateSpec,
} from "./catalog";
import { atLocalHour, dayText } from "./zoned";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
/** B06 schedules the "resting soon" job this long before a term ends. */
export const NOTICE_DAYS = 3;
export const LANG = "en-NG";

/** The purpose column's value (the database spells "auth-code" as auth_code in Prisma). */
function purposeColumn(p: TemplateSpec["purpose"]): $Enums.MessageDeliveryPurpose {
  return p.replace("-", "_") as $Enums.MessageDeliveryPurpose;
}

export interface SendNotice {
  template: TemplateKey;
  /** The account to write to (its email is read here; an erased account gets nothing). */
  toAccountId?: string;
  /** Or a bare address (the sign-in code to a person who has no account yet). */
  toEmail?: string;
  /** The values for the wording's placeholders. */
  data: Record<string, string | number>;
  /** The same key twice sends one email. Never put an email address in it. */
  key: string;
  /** The wish this is about, when there is one. */
  wishId?: string;
}

export type SendOutcome =
  | { status: "queued"; deliveryId: string }
  | { status: "existing"; deliveryId: string }
  | { status: "failed"; deliveryId: string; reason: string }
  | { status: "skipped"; deliveryId: null; reason: "muted" | "erased" };

interface Vars {
  accountId?: string;
  wishId?: string;
  data: Record<string, string | number>;
}

/**
 * B11: the one function that sends a notice (notices.send), and the jobs that carry it out.
 *
 * send() writes a MessageDelivery row (queued) and a send-message job in the caller's transaction; the job sends through the email
 * port (Resend in production) and marks the row delivered or failed with the provider's reason. Three tries, with waits of 1 and
 * 5 minutes (declared), then failed for staff. A 4xx from the provider is failed for good; a 5xx, a timeout or no answer retries.
 *
 * What identity must call for the sign-in code (identity is not edited here): in AuthCodesService.request, in place of
 * `this.email.send(...)`, call
 *   const r = await this.notices.send(tx, { template: "code", toEmail: destination, data: { code }, key: `auth-code:${id}` });
 * and after the transaction commits `await this.notices.deliverNow(r.deliveryId)` so the code goes at once, not at the next tick.
 */
@Injectable()
export class NoticesService implements OnModuleInit {
  private readonly log = new Logger("notices");

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly email: EmailPort,
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Not in tests (NODE_ENV=test), like the other handlers: specs share a database. A spec calls registerAll() itself. */
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.registerAll();
  }

  registerAll(): void {
    this.jobs.register("send-message", (c) => this.sendMessageJob(c));
    this.jobs.register("send-notice", (c) => this.restingJob(c));
  }

  /** Queues one notice. Pass the caller's transaction to make it commit with the caller's write. */
  async send(tx: Tx | undefined, input: SendNotice): Promise<SendOutcome> {
    if (!tx) return this.prisma.$transaction((t) => this.send(t, input));
    if (!isTemplateKey(input.template)) throw new Error(`notices.send: no message named ${String(input.template)}`);
    const key = input.key.trim();
    if (!key || key.length > 200) throw new Error("notices.send: the key is 1 to 200 characters");
    // II3: one send per key even when 20 callers arrive at once: message_delivery.idempotencyKey is unique, so the callers' inserts
    // queue on the index, the first one wins and every other finds its row.
    const existing = await tx.messageDelivery.findFirst({ where: { idempotencyKey: key }, select: { id: true } });
    if (existing) return { status: "existing", deliveryId: existing.id };

    const spec = TEMPLATES[input.template];
    let to: string;
    let accountId: string | undefined;
    if (input.toAccountId) {
      const a = await lockAccount(tx, input.toAccountId, { allowErased: true });
      if (a.erasedAt) return { status: "skipped", deliveryId: null, reason: "erased" };
      accountId = a.id;
      if (spec.mutable) {
        const prefs = await tx.noticePrefs.findUnique({ where: { accountId: a.id }, select: { muted: true } });
        if (Array.isArray(prefs?.muted) && (prefs.muted as unknown[]).includes(spec.key)) return { status: "skipped", deliveryId: null, reason: "muted" };
      }
      const acct = await tx.account.findUniqueOrThrow({ where: { id: a.id }, select: { contact: true } });
      to = normaliseEmail(acct.contact ?? "") ?? "";
    } else {
      to = normaliseEmail(input.toEmail ?? "") ?? "";
      if (!to) throw new Error("notices.send: toAccountId or a valid toEmail");
    }

    const id = this.ids.id();
    const vars: Vars = { data: input.data, ...(accountId ? { accountId } : {}), ...(input.wishId ? { wishId: input.wishId } : {}) };
    const problem = !to ? "The account has no email address." : await this.wordingProblem(tx, input.template, input.data);
    const now = this.clock.now();
    const made = await tx.messageDelivery.createMany({
      data: [{
        id, templateKey: input.template, channel: "email", to: to || "none", purpose: purposeColumn(spec.purpose), status: problem ? "failed" : "queued",
        error: problem, attempts: 0, idempotencyKey: key, vars: vars as unknown as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
    if (made.count === 0) {
      const first = await tx.messageDelivery.findFirstOrThrow({ where: { idempotencyKey: key }, select: { id: true } });
      return { status: "existing", deliveryId: first.id };
    }
    if (accountId && spec.noticeKind) {
      await tx.notice.create({
        data: {
          id: this.ids.id(), kind: spec.noticeKind === "opened" ? "opened" : "term_ends_soon", accountId, wishId: input.wishId ?? null, dueAt: now,
          status: problem ? "cancelled" : "scheduled", deliveryId: id, key: spec.key,
        },
      });
    }
    if (problem) {
      await this.scrub(tx, id, spec.key);
      return { status: "failed", deliveryId: id, reason: problem };
    }
    await this.jobs.schedule("send-message", now, id, tx);
    return { status: "queued", deliveryId: id };
  }

  /** The template row now in force for a key, or null. */
  async template(db: Pick<Tx, "messageTemplate">, key: string): Promise<{ id: string; subject: string; body: string; version: number } | null> {
    const row = await db.messageTemplate.findFirst({ where: { key, channel: "email", locale: LANG }, orderBy: { version: "desc" } });
    if (row) return { id: row.id, subject: row.subject ?? "", body: row.body, version: row.version };
    return key === "code" ? { id: "", ...CODE_WORDING_FALLBACK, version: 0 } : null;
  }

  /** Why this message cannot be written with these values (a missing wording or a placeholder with no value), or null. */
  private async wordingProblem(tx: Tx, key: TemplateKey, data: Record<string, unknown>): Promise<string | null> {
    const t = await this.template(tx, key);
    if (!t) return "There is no wording for this message.";
    const miss = missingValues(`${t.subject}\n${t.body}`, data);
    return miss.length ? `No value for ${miss.map((n) => `{${n}}`).join(", ")}.` : null;
  }

  /** Puts a queued delivery's send-message job on the table, in the caller's transaction. */
  async queueJob(tx: Tx, deliveryId: string): Promise<void> {
    await this.jobs.schedule("send-message", this.clock.now(), deliveryId, tx);
  }

  /** The sign-in code is never kept once its email is settled. */
  private async scrub(tx: Tx, deliveryId: string, key: string): Promise<void> {
    if (key !== "code" && key !== "invite") return;
    await tx.$executeRaw`UPDATE message_delivery SET vars = jsonb_set(vars, '{data,code}', '"removed"'::jsonb) WHERE id = ${deliveryId}::uuid AND vars #> '{data,code}' IS NOT NULL`;
  }

  /** Sends one delivery now instead of waiting for the next tick (the job finds it done and skips). */
  async deliverNow(deliveryId: string | null): Promise<void> {
    if (!deliveryId) return;
    await this.deliver(deliveryId).catch((e: unknown) => this.log.warn(`delivery ${deliveryId} did not run: ${scrubEmails(e instanceof Error ? e.message : String(e))}`));
  }

  private async sendMessageJob(c: JobContext): Promise<JobResult> {
    // A retry is taken only once its wait has passed (the wait runs from the failed try, on the clock port).
    if (UUID.test(c.subjectId)) {
      const waiting = await this.prisma.$queryRaw<{ left: number }[]>`
        SELECT ceil(extract(epoch FROM ("updatedAt" + (CASE WHEN attempts >= 2 THEN ${RETRY_WAIT_MS[1]} ELSE ${RETRY_WAIT_MS[0]} END) * interval '1 millisecond' - ${c.now}::timestamptz)) * 1000)::int AS "left"
        FROM message_delivery WHERE id = ${c.subjectId}::uuid AND status = 'queued' AND attempts > 0 AND attempts < ${DELIVERY_TRIES}`;
      if (waiting[0] && waiting[0].left > 0) return { skipped: true, again: new Date(c.now.getTime() + waiting[0].left) };
    }
    const r = await this.deliver(c.subjectId);
    if (r.outcome === "skipped") return r.busy ? { skipped: true, again: new Date(c.now.getTime() + RETRY_WAIT_MS[0]) } : { skipped: true };
    return { changed: { outcome: r.outcome, ...(r.reason ? { reason: r.reason } : {}) }, ...(r.again ? { again: r.again } : {}) };
  }

  /**
   * One try at one delivery. Safe to run twice at once: the try is claimed by ONE conditional UPDATE (queued, or "sending" with no
   * settle for 5 minutes because its caller died, and fewer than 3 tries made); the caller whose UPDATE took the row is the only one
   * that calls the provider. "sending" is the delivery's in-flight state (MM1); a message that cannot go (its account was erased)
   * is "dropped", with the reason.
   */
  async deliver(deliveryId: string): Promise<{ outcome: "delivered" | "failed" | "dropped" | "retry" | "skipped"; reason?: string; again?: Date; busy?: boolean }> {
    if (!UUID.test(deliveryId)) return { outcome: "skipped" };
    const got = await this.prisma.$queryRaw<{ attempts: number }[]>`
      UPDATE message_delivery SET status = 'sending', attempts = attempts + 1, "updatedAt" = now()
      WHERE id = ${deliveryId}::uuid AND attempts < ${DELIVERY_TRIES}
        AND (status = 'queued' OR (status = 'sending' AND "updatedAt" < now() - interval '5 minutes'))
      RETURNING attempts`;
    if (got.length === 0) {
      // In flight past its stale time with every try used: nobody will try again, so it is failed for staff.
      const gone = await this.prisma.$queryRaw<{ templateKey: string }[]>`
        UPDATE message_delivery SET status = 'failed', error = 'The email service did not finish this try.'
        WHERE id = ${deliveryId}::uuid AND status = 'sending' AND attempts >= ${DELIVERY_TRIES} AND "updatedAt" < now() - interval '5 minutes'
        RETURNING "templateKey"`;
      if (gone.length) {
        await this.settle(deliveryId, gone[0].templateKey as TemplateKey, "failed", "The email service did not finish this try.");
        return { outcome: "failed", reason: "The email service did not finish this try." };
      }
      const cur = await this.prisma.messageDelivery.findUnique({ where: { id: deliveryId }, select: { status: true } });
      return cur?.status === "sending" ? { outcome: "skipped", busy: true } : { outcome: "skipped" };
    }
    const tries = got[0].attempts;
    const row = await this.prisma.messageDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    // An erased account's row has its address and values blanked: the delivery is dropped, never sent.
    if (row.to === "" || row.vars === null) return this.settle(row.id, row.templateKey as TemplateKey, "dropped", "Dropped: the account was erased.");
    const vars = (row.vars ?? { data: {} }) as unknown as Vars;
    const key = row.templateKey as TemplateKey;

    let to = row.to;
    if (vars.accountId) {
      const a = await this.prisma.account.findUnique({ where: { id: vars.accountId }, select: { contact: true, erasedAt: true } });
      if (!a || a.erasedAt) return this.settle(row.id, key, "dropped", "Dropped: the account was erased.");
      to = normaliseEmail(a.contact ?? "") ?? row.to;
    }
    const t = await this.template(this.prisma, key);
    if (!t) return this.settle(row.id, key, "failed", "There is no wording for this message.");
    let subject: string;
    let text: string;
    try {
      subject = fillSubject(t.subject, vars.data);
      text = fill(t.body, vars.data);
    } catch (e) {
      if (e instanceof MissingValueError) return this.settle(row.id, key, "failed", `No value for ${e.names.map((n) => `{${n}}`).join(", ")}.`);
      throw e;
    }

    try {
      const sent = await this.email.send({ to, subject, text, idempotencyKey: `delivery:${row.id}` });
      return this.settle(row.id, key, "delivered", null, sent.id);
    } catch (e) {
      const { forGood, reason } = classify(e);
      if (forGood || tries >= DELIVERY_TRIES) return this.settle(row.id, key, "failed", reason);
      await this.prisma.messageDelivery.updateMany({ where: { id: row.id, status: "sending" }, data: { status: "queued", error: reason, updatedAt: this.clock.now() } });
      return { outcome: "retry", reason, again: new Date(this.clock.now().getTime() + RETRY_WAIT_MS[Math.min(tries - 1, RETRY_WAIT_MS.length - 1)]) };
    }
  }

  private async settle(
    id: string, key: TemplateKey, outcome: "delivered" | "failed" | "dropped", reason: string | null, providerMessageId?: string,
  ): Promise<{ outcome: "delivered" | "failed" | "dropped"; reason?: string }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.messageDelivery.update({ where: { id }, data: { status: outcome, error: reason, ...(providerMessageId ? { providerMessageId } : {}) } });
      await tx.notice.updateMany({
        where: { deliveryId: id },
        data: { status: outcome === "delivered" ? "sent" : outcome === "dropped" ? "skipped" : "cancelled" },
      });
      await this.scrub(tx, id, key);
    });
    return { outcome, ...(reason ? { reason } : {}) };
  }

  /**
   * The "resting soon" job (B06 schedules send-notice for the wish three days before the term ends). It goes to the wish's
   * sender at 09:00 in the sender's time zone on that day (II4: the account's zone, else the wish's),
   * or at once when that hour has passed. A wish kept, resting, taken down or erased meanwhile sends nothing.
   */
  async restingJob(c: JobContext): Promise<JobResult> {
    const sent = await this.prisma.$transaction(async (tx): Promise<JobResult> => {
      await tx.$queryRaw`SELECT id FROM wish WHERE id = ${c.subjectId}::uuid FOR UPDATE`;
      const w = await tx.wish.findUnique({ where: { id: c.subjectId } });
      if (!w || w.erasedAt || w.status !== "live" || !w.endsAt) return { skipped: true };
      if (w.keptUntil && w.keptUntil.getTime() > c.now.getTime()) return { skipped: true };
      if (w.endsAt.getTime() <= c.now.getTime()) return { skipped: true };
      const noticeAt = new Date(w.endsAt.getTime() - NOTICE_DAYS * DAY);
      if (c.now.getTime() < noticeAt.getTime()) return { skipped: true, again: noticeAt };
      // II4: the sender's own zone when the account has one, else the wish's (PROVISIONAL until every account has one)
      const acct = await tx.account.findUnique({ where: { id: w.accountId }, select: { name: true, timeZone: true } });
      const zone = acct?.timeZone && isTimeZone(acct.timeZone) ? acct.timeZone : w.timeZone;
      const nineAm = atLocalHour(noticeAt, zone, NOTICE_HOUR_LOCAL);
      if (c.now.getTime() < nineAm.getTime()) return { skipped: true, again: nineAm };
      const link = await tx.wishLink.findFirst({ where: { wishId: w.id, active: true }, orderBy: { createdAt: "desc" }, select: { slug: true } });
      const data: Record<string, string> = { name: acct?.name?.trim() || "there", date: dayText(w.endsAt, zone) };
      if (w.name?.trim()) data.for = w.name.trim();
      if (link) data.link = `${this.env.PUBLIC_SITE_URL.replace(/\/+$/, "")}/w/${link.slug}`;
      const r = await this.send(tx, { template: "resting", toAccountId: w.accountId, data, key: `resting:${w.id}:${w.endsAt.toISOString()}`, wishId: w.id });
      return { changed: { notice: r.status } };
    });
    return sent;
  }
}

/** A 4xx is failed for good (the provider read our message and refused it); 408 and 429, a 5xx, a timeout or no answer retry. */
export function classify(e: unknown): { forGood: boolean; reason: string } {
  if (isPortTimeout(e)) return { forGood: false, reason: "The email service did not answer in time." };
  if (e instanceof ProviderError) {
    const forGood = e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
    return { forGood, reason: scrubReason(e.message).slice(0, 300) };
  }
  return { forGood: false, reason: scrubReason(e instanceof Error ? e.message : String(e)).slice(0, 300) };
}
