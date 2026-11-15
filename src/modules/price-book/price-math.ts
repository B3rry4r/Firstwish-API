/*
 * Integer kobo arithmetic for the price book. No float anywhere: every amount is a bigint of kobo.
 */

/** The promoted price of a list price at `percentOff`, rounded half up to the nearest kobo (integer arithmetic only). */
export function discounted(listKobo: bigint, percentOff: number): bigint {
  if (!Number.isInteger(percentOff) || percentOff < 0 || percentOff > 100) throw new Error("percentOff must be a whole number from 0 to 100");
  if (listKobo < 0n) throw new Error("listKobo must not be negative");
  return (listKobo * BigInt(100 - percentOff) + 50n) / 100n;
}

/** What the promotion takes off a list price: list minus the promoted price, so the two always add back to the list price. */
export function discountOf(listKobo: bigint, percentOff: number): bigint {
  return listKobo - discounted(listKobo, percentOff);
}

/** The calendar day in Lagos that holds the last moment before `endsAt` (an end at Lagos midnight counts as the day before). */
export function lastDayInLagos(endsAt: Date): string {
  const d = new Date(endsAt.getTime() - 1);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The customer line for a promotion: "40% off until 31 January". */
export function promotionLabel(percentOff: number, endsAt: Date): string {
  const [, m, d] = lastDayInLagos(endsAt).split("-").map(Number);
  return `${percentOff}% off until ${d} ${MONTHS[m - 1]}`;
}
