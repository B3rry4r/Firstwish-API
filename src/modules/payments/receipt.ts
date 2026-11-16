import type { Payment } from "@prisma/client";
import type { PaidLineInfo } from "./fulfilment.registry";

/** Whole kobo as text for an email: NGN 1,234.50 (integer arithmetic only). */
export function nairaText(kobo: bigint): string {
  const whole = (kobo / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `NGN ${whole}.${(kobo % 100n).toString().padStart(2, "0")}`;
}

/** The values the receipt message fills (HW1): what was paid for, the amount, the VAT part (a last line of the items) when a line carries one, the reference. */
export function receiptData(p: Pick<Payment, "amountKobo" | "providerReference">, lines: PaidLineInfo[], vatKobo: bigint, name: string | null): Record<string, string> {
  return {
    name: name?.trim() || "there",
    amount: nairaText(p.amountKobo),
    items: [...lines.map((l) => `${l.qty > 1 ? `${l.qty} x ` : ""}${l.name}: ${nairaText(BigInt(l.totalKobo))}`), ...(vatKobo > 0n ? [`VAT included in this amount: ${nairaText(vatKobo)}`] : [])].join("\n"),
    reference: p.providerReference,
  };
}
