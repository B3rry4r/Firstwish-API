import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { PAYOUT_EVENT_SINK, type PayoutEventSink } from "../payouts/payout-event-sink";
import { REFUND_EVENT_SINK, type RefundEventSink } from "./refund-event-sink";
import { SettlementService, type ProviderAnswer } from "./settlement.service";

const PROVIDER = "paystack";

interface Parsed {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  data: Record<string, unknown>;
}

/**
 * E-217: Paystack's one signed URL. The access guard has already checked the HMAC-SHA512 of the raw body; here the event is stored
 * once by (provider, eventId) and, if it is a charge, settled by the same path as the verify page. A refund event goes to the refunds
 * module (the sink) when one is installed, else it is stored and left unprocessed; a transfer event (WW1) goes the same way to the payouts module.
 */
@Injectable()
export class WebhookService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly settlement: SettlementService,
    @Optional() @Inject(REFUND_EVENT_SINK) private readonly refunds?: RefundEventSink,
    @Optional() @Inject(PAYOUT_EVENT_SINK) private readonly payouts?: PayoutEventSink,
  ) {}

  async receive(raw: Buffer): Promise<void> {
    const ev = parse(raw);
    const id = this.ids.id();
    // Stored once, in its own transaction: a settle that fails later leaves it here, unprocessed, for the next delivery.
    const made = await this.db.webhookEvent.createMany({
      data: [{ id, provider: PROVIDER, eventId: ev.eventId, type: ev.type, signatureValid: true, payload: ev.payload as Prisma.InputJsonObject, createdAt: this.clock.now() }],
      skipDuplicates: true,
    });
    const row = made.count === 1 ? { id, processedAt: null } : await this.db.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: PROVIDER, eventId: ev.eventId } } });
    if (row.processedAt) return;

    if (ev.type === "charge.success" || ev.type === "charge.failed") {
      await this.settlement.settle(answerOf(ev), row.id);
      return;
    }
    if (ev.type.startsWith("refund.") && this.refunds) {
      await this.refunds.apply(row.id, ev.type, ev.data);
      return;
    }
    if (ev.type.startsWith("refund.")) return;
    if (ev.type.startsWith("transfer.") && this.payouts) {
      await this.payouts.apply(row.id, ev.type, ev.data);
      return;
    }
    if (ev.type.startsWith("transfer.")) return;
    await this.db.webhookEvent.update({ where: { id: row.id }, data: { processedAt: this.clock.now(), outcome: "ignored" } });
  }
}

function parse(raw: Buffer): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(400, "bad_event", "The event is not JSON.");
  }
  const payload = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const type = typeof payload?.event === "string" ? payload.event : "";
  const data = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? (payload.data as Record<string, unknown>) : null;
  if (!payload || !type || !data) throw new AppError(400, "bad_event", "The event has no type or data.");
  // Paystack events carry no event id of their own: the type, the provider's transaction (or refund) id and the reference name
  // one delivery's subject. Two events with one provider id for different references are two events (FF3).
  const providerId = typeof data.id === "number" || typeof data.id === "string" ? String(data.id) : "";
  const reference = typeof data.reference === "string" ? data.reference : "";
  if (!providerId && !reference) throw new AppError(400, "bad_event", "The event names no transaction.");
  // FF2: a control character in what names the event (or a NUL anywhere in the document, which the database refuses) is a 400.
  if ([type, providerId, reference].some(hasControl) || hasNul(payload)) throw new AppError(400, "bad_event", "The event holds a control character.");
  const eventId = `${type}:${providerId}:${reference}`;
  if (eventId.length > 300) throw new AppError(400, "bad_event", "The event names are too long.");
  return { eventId, type, payload, data };
}

function answerOf(ev: Parsed): ProviderAnswer {
  const d = ev.data;
  const amount = typeof d.amount === "number" && Number.isSafeInteger(d.amount) ? BigInt(d.amount) : -1n;
  const fee = typeof d.fees === "number" && Number.isSafeInteger(d.fees) && d.fees >= 0 ? BigInt(d.fees) : null;
  const paid = typeof d.paid_at === "string" ? new Date(d.paid_at) : null;
  return {
    reference: typeof d.reference === "string" ? d.reference : "",
    status: ev.type === "charge.success" ? "success" : "failed",
    amountKobo: amount,
    currency: typeof d.currency === "string" ? d.currency : "",
    paidAt: paid && !Number.isNaN(paid.getTime()) ? paid : null,
    feeKobo: fee,
    channel: typeof d.channel === "string" ? d.channel : null,
  };
}

// eslint-disable-next-line no-control-regex
const hasControl = (s: string): boolean => /[\u0000-\u001f\u007f-\u009f]/.test(s);

/** A NUL in any string or key of the document: Postgres refuses it in a jsonb column. */
function hasNul(v: unknown): boolean {
  if (typeof v === "string") return v.includes("\u0000");
  if (Array.isArray(v)) return v.some(hasNul);
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => k.includes("\u0000") || hasNul(x));
  return false;
}
