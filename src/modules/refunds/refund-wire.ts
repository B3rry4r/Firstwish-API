import type { Refund } from "@prisma/client";
import type { Refund as RefundWire } from "../../contracts";
import { toWireInstant } from "../../common/time/time";

const reasonWire = (r: Refund["reason"]): RefundWire["reason"] => r.replace("_", "-") as RefundWire["reason"];

export function refundView(r: Refund): RefundWire {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amountKobo: Number(r.amountKobo),
    reason: reasonWire(r.reason),
    status: r.status,
    requestedBy: r.requestedBy,
    approvedBy: r.approvedBy,
    providerReference: r.providerReference,
    createdAt: toWireInstant(r.createdAt),
    updatedAt: toWireInstant(r.updatedAt),
  };
}

