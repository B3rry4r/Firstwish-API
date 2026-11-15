import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
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
 * once by (provider, eventId) and, if it is a charge, settled by the same path as the verify page. Refund events are stored for
 * the refunds bundle and left unprocessed.
 */
@Injectable()
export class WebhookService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly settlement: SettlementService,
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
    if (ev.type.startsWith("refund.")) return; // the refunds bundle reads these
    await this.db.webhookEvent.update({ where: { id: row.id }, data: { processedAt: this.clock.now(), event: { outcome: "ignored" } } });
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
  // Paystack events carry no event id of their own: the transaction (or refund) id with the type names one delivery's subject.
  const ref = typeof data.id === "number" || typeof data.id === "string" ? String(data.id) : typeof data.reference === "string" ? data.reference : "";
  if (!ref) throw new AppError(400, "bad_event", "The event names no transaction.");
  return { eventId: `${type}:${ref}`.slice(0, 200), type, payload, data };
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
