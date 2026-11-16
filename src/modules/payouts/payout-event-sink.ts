/** Who reads the provider's transfer events the webhook stored (the payouts module provides it under this token). */
export const PAYOUT_EVENT_SINK = Symbol("PAYOUT_EVENT_SINK");

export interface PayoutEventSink {
  /**
   * Applies one stored transfer event (`eventRowId` is the webhook_event row, `type` "transfer.success", "transfer.failed" or
   * "transfer.reversed", `data` the event's data object). It marks the stored event processed, with its outcome, in the same
   * transaction as what it changed.
   */
  apply(eventRowId: string, type: string, data: Record<string, unknown>): Promise<void>;
}
