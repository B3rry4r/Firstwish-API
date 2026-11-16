import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { normaliseEmail } from "../../common/normalise/email";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { scrubReason } from "../notices/catalog";
import { EmailSuppression } from "../notices/suppression";
import { IntakeLimits } from "./intake-limits";
import { cleanInbound, MESSAGE_MAX, SUBJECT_MAX, threadOfToken, tokenFromAddress, tokenHolds } from "./rules";
import { checkSvix } from "./svix";
import { SupportService } from "./support.service";

const PROVIDER = "resend";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Tx = Prisma.TransactionClient;

export interface SvixHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The address inside "Name <a@b.c>" or a bare address, in the email canon, or null. */
function addressOf(v: unknown): string | null {
  const s = str(v).trim();
  const m = /<([^>]+)>\s*$/.exec(s);
  return normaliseEmail(m ? m[1] : s);
}

/**
 * E-72 and E-211: Resend's one signed stream, delivery news (delivered, bounced, complained) and inbound mail. Both URLs reach this
 * service. Order of checks: the secret must be set (RESEND_WEBHOOK_SECRET; missing is 503, never "let through"), then the svix
 * signature over the raw body, then the timestamp (5 minutes either way, on the clock port). The event is stored once by its svix id
 * in the SAME transaction as what it changes, so a replay changes nothing and a failure leaves nothing half done.
 */
@Injectable()
export class EmailWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly support: SupportService,
    private readonly suppression: EmailSuppression,
    private readonly limits: IntakeLimits,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async receive(raw: Buffer | undefined, h: SvixHeaders): Promise<void> {
    // RESEND_WEBHOOK_SECRET is not in the env schema yet (hand-back: HALT 1), so it is read here, at the time of the request.
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new AppError(503, "webhook_not_configured", "The email webhook has no signing secret.");
    if (!raw) throw AppError.unauthorized("The signature does not match.");
    const check = checkSvix(secret, raw, h, Math.floor(this.clock.now().getTime() / 1000));
    if (check === "bad_signature") throw AppError.unauthorized("The signature does not match.");
    if (check === "old_timestamp") throw AppError.unauthorized("The event is too old.");

    let json: unknown;
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new AppError(400, "bad_event", "The event is not JSON.");
    }
    const type = str(obj(json).type);
    const data = obj(obj(json).data);
    const eventId = h.id ?? "";
    // eslint-disable-next-line no-control-regex
    if (!type || type.length > 80 || eventId.length > 200 || /[\u0000-\u001f]/.test(type + eventId)) throw new AppError(400, "bad_event", "The event has no type.");

    await this.prisma.$transaction(async (tx) => {
      const id = this.ids.id();
      // Only the type and the provider's mail id are kept: no address and no text (an erase would have nothing to blank).
      const made = await tx.webhookEvent.createMany({
        data: [{ id, provider: PROVIDER, eventId, type, signatureValid: true, payload: { type, emailId: str(data.email_id).slice(0, 100) }, createdAt: this.clock.now() }],
        skipDuplicates: true,
      });
      if (made.count === 0) return; // a replay: stored already, nothing changes
      const outcome = await this.dispatch(tx, type, data);
      await tx.webhookEvent.update({ where: { id }, data: { processedAt: this.clock.now(), outcome } });
    });
  }

  private async dispatch(tx: Tx, type: string, data: Record<string, unknown>): Promise<string> {
    switch (type) {
      case "email.received": return this.inbound(tx, data);
      case "email.delivered":
      case "email.bounced":
      case "email.complained": return this.news(tx, type, data);
      default: return "ignored";
    }
  }

  // ---------- delivery news (case 4) ----------

  private async news(tx: Tx, type: string, data: Record<string, unknown>): Promise<string> {
    const mailId = str(data.email_id);
    if (!mailId) return "ignored";
    const found = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM message_delivery WHERE "providerMessageId" = ${mailId} ORDER BY id LIMIT 1 FOR UPDATE`;
    // Not ours, or its own send has not settled yet: refuse so the provider tries again, and the event is not kept (rolled back).
    if (!found[0]) throw new AppError(409, "delivery_not_found", "No delivery has this mail id yet.");
    const d = await tx.messageDelivery.findUniqueOrThrow({ where: { id: found[0].id } });
    const to = Array.isArray(data.to) ? addressOf(data.to[0]) : addressOf(data.to);
    const address = d.to || to || "";

    if (type === "email.delivered") {
      if (d.status === "sent" || d.status === "sending" || d.status === "queued") await tx.messageDelivery.update({ where: { id: d.id }, data: { status: "delivered", error: null } });
      return "delivered";
    }
    if (type === "email.complained") {
      if (address) await this.suppression.add(address, "complained", tx);
      await tx.messageDelivery.update({
        where: { id: d.id }, data: { error: "The person marked this email as spam.", ...(d.status === "sent" || d.status === "sending" || d.status === "queued" ? { status: "delivered" as const } : {}) },
      });
      return "complained";
    }
    // bounced: a transient bounce is noted; anything else is a failure for good
    const bounce = obj(data.bounce);
    const reason = scrubReason(`Bounced: ${str(bounce.message) || str(bounce.type) || "the address did not take the email"}`).slice(0, 300);
    if (str(bounce.type).toLowerCase() === "transient") {
      await tx.messageDelivery.update({ where: { id: d.id }, data: { error: reason } });
      return "bounce_noted";
    }
    await tx.messageDelivery.update({ where: { id: d.id }, data: { status: "failed", error: reason } });
    if (d.purpose === "wish_delivery") await this.flagRefundDue(tx, d.vars);
    return "bounced";
  }

  /**
   * PP6: a wish's delivery email that fails for good puts refund_due on the payment that paid for that wish (found through the
   * purchase grant that names the wish). One UPDATE per payment that cannot lose another change to the flags; nothing refunds
   * by itself. (The refunds module's own helper is not in this base: the flag is set here, on payment.flags.)
   */
  private async flagRefundDue(tx: Tx, vars: Prisma.JsonValue): Promise<void> {
    const wishId = str(obj(vars).wishId);
    if (!UUID.test(wishId)) return;
    const grants = await tx.purchaseGrant.findMany({ where: { wishId }, select: { paymentId: true }, distinct: ["paymentId"] });
    const paymentIds = grants.map((g) => g.paymentId);
    if (!paymentIds.length) return;
    await tx.$executeRaw`
      UPDATE payment SET flags = flags || ARRAY['refund_due']::text[] || ARRAY['refund_due:delivery_email_failed']::text[]
      WHERE id = ANY(${paymentIds}::uuid[]) AND status IN ('succeeded', 'partly-refunded') AND NOT ('refund_due' = ANY(flags))`;
  }

  // ---------- inbound mail (case 2) ----------

  private async inbound(tx: Tx, data: Record<string, unknown>): Promise<string> {
    const sender = addressOf(data.from);
    if (!sender) return "ignored";
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj(data.headers))) headers[k.toLowerCase()] = str(v);
    // Mail from a machine (an out-of-office, a bounce notice) is never a thread: it would answer our answer, and again.
    const auto = headers["auto-submitted"];
    if ((auto && auto.toLowerCase() !== "no") || headers["x-autoreply"] || headers["x-auto-response-suppress"] || /bulk|junk|list/i.test(headers.precedence ?? "")) return "ignored";
    const text = cleanInbound(str(data.text), MESSAGE_MAX);
    if (!text) return "ignored";

    // The match is the reply token Firstwish put in the address (reply+<token>@) or in a header, never the subject.
    const addresses = (Array.isArray(data.to) ? data.to : [data.to]).map((a) => str(a));
    const tokens = [...addresses.map(tokenFromAddress), (headers["x-firstwish-reply-token"] ?? "").toLowerCase() || null].filter((t): t is string => !!t && threadOfToken(t) !== null);
    for (const token of tokens) {
      const threadId = threadOfToken(token) ?? "";
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM support_thread WHERE id = ${threadId}::uuid FOR UPDATE`;
      if (!rows[0]) continue;
      const t = await tx.supportThread.findUniqueOrThrow({ where: { id: threadId } });
      // The mark must hold for the thread's own contact AND the sender must be that contact: a token with another sender's
      // address never lands in someone else's thread; it starts a thread of its own.
      if (tokenHolds(this.env.AUTH_CODE_PEPPER, token, t.id, t.contact) && t.contact === sender) {
        await this.support.addCustomerMessage(tx, t.id, text);
        return "appended";
      }
    }

    if (!(await this.limits.takeEmail(tx, sender))) return "limited";
    const subject = cleanInbound(str(data.subject).replace(/[\r\n]+/g, " "), SUBJECT_MAX) || "(no subject)";
    const accountId = await this.support.accountOfAddress(tx, sender);
    const now = this.clock.now();
    const id = this.ids.id();
    await tx.supportThread.create({ data: { id, accountId, contact: sender, subject, status: "open", priority: "normal", body: text, text, createdAt: now, updatedAt: now } });
    await tx.supportMessage.create({ data: { id: this.ids.id(), threadId: id, from: "customer", body: text, fileIds: [], createdAt: now } });
    return "opened";
  }
}
