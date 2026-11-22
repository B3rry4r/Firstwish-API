import type { ConciergeOrderStatus } from "@prisma/client";

/**
 * The life of an order. `brief` is placed, `quoted` is placed with a price staff set, `given` is handed to a maker who has not started, `making` is being made.
 * Every state that is not an end has a way out; delivered, cancelled and refunded (a paid order whose payment was given back, IE3) are the ends.
 */
export const NEXT: Record<ConciergeOrderStatus, ConciergeOrderStatus[]> = {
  brief: ["quoted", "paid", "cancelled"],
  quoted: ["quoted", "paid", "cancelled"],
  paid: ["given", "making", "cancelled", "refunded"],
  given: ["given", "making", "delivered", "cancelled", "refunded"],
  making: ["given", "making", "delivered", "cancelled", "refunded"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export const ENDS: ConciergeOrderStatus[] = ["delivered", "cancelled", "refunded"];
export const OPEN: ConciergeOrderStatus[] = ["brief", "quoted", "paid", "given", "making"];

export const canMove = (from: ConciergeOrderStatus, to: ConciergeOrderStatus): boolean => NEXT[from].includes(to);

/** The word the apps show for an order. */
export function stateOf(status: ConciergeOrderStatus): "placed" | "quoted" | "paid" | "given" | "making" | "delivered" | "cancelled" | "refunded" {
  return status === "brief" ? "placed" : status;
}

/** T-13: one wish made by Concierge is delivered within 3 hours of payment. The price book's own number wins when it names one. */
export const SINGLE_WISH_HOURS = 3;
export const HOUR_MS = 3_600_000;

export function dueAtFor(kind: "single" | "list", paidAt: Date, hours: number | null): Date | null {
  return kind === "single" ? new Date(paidAt.getTime() + (hours ?? SINGLE_WISH_HOURS) * HOUR_MS) : null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
