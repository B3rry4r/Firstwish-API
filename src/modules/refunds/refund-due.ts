import type { Prisma } from "@prisma/client";

/**
 * The one way a payment is flagged for a refund (YY4): `refund_due` and `refund_due:<why>` are added to the payment's flags in one
 * UPDATE that cannot lose another change to them, once each (a second call adds nothing). Only a payment that holds money is
 * flagged (succeeded or partly refunded): a refunded, failed or abandoned payment has nothing to give back. Nothing refunds by
 * itself; a person sends the refund. Answers how many payments were flagged (a payment already carrying both flags counts as 0).
 */
export async function flagRefundDue(tx: Prisma.TransactionClient, paymentIds: string | readonly string[], why: string): Promise<number> {
  const ids = typeof paymentIds === "string" ? [paymentIds] : [...paymentIds];
  if (!ids.length) return 0;
  const reason = `refund_due:${why}`;
  return tx.$executeRaw`
    UPDATE payment
       SET flags = flags
         || CASE WHEN 'refund_due' = ANY(flags) THEN ARRAY[]::text[] ELSE ARRAY['refund_due']::text[] END
         || CASE WHEN ${reason} = ANY(flags) THEN ARRAY[]::text[] ELSE ARRAY[${reason}]::text[] END
     WHERE id = ANY(${ids}::uuid[]) AND status IN ('succeeded', 'partly-refunded')
       AND NOT ('refund_due' = ANY(flags) AND ${reason} = ANY(flags))`;
}
