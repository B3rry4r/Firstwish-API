/** Who reads the provider's refund events the webhook stored (the refunds module provides it under this token). */
export const REFUND_EVENT_SINK = Symbol("REFUND_EVENT_SINK");

export interface RefundEventSink {
  /**
   * Applies one stored refund event (`eventRowId` is the webhook_event row, `type` such as "refund.processed", `data` the event's
   * data object). It marks the stored event processed, with its outcome, in the same transaction as what it changed.
   */
  apply(eventRowId: string, type: string, data: Record<string, unknown>): Promise<void>;
}
