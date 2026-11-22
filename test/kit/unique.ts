import { randomUUID } from "node:crypto";

/**
 * Values for columns with a unique constraint (wish.no, wish_link.slug, account.handle), made for tests.
 * Every one is built from a fresh random id (the whole of it where the column allows), so no two specs sharing one database can make the same value.
 */
const fresh = () => randomUUID().replace(/-/g, "");

/**
 * A wish number made of digits only, the shape the product issues (wishes.service issueNumber: digits, at least four) and the shape the
 * staff search reads ("0412" or "Wish № 0412"; admin-people.service list), so a test wish is found the way a real one is.
 * It is 20 digits: a leading 1-9 and 19 digits drawn from the whole of a fresh random id (about 63 bits, so two specs
 * can never make the same one), and still inside the 24 characters the staff routes accept (admin-wishes.service NO).
 * The product's own counter pads to four digits and would need about 10^19 wishes to reach 20 digits, so it can never issue one.
 */
export function testWishNo(): string {
  const n = BigInt(`0x${fresh()}`);
  const tail = (n % 10n ** 19n).toString().padStart(19, "0");
  const lead = Number((n / 10n ** 19n) % 9n) + 1;
  return `${lead}${tail}`;
}

/** A wish link slug (letters, digits, dashes; 30 characters or fewer) that no other call returns. */
export function testSlug(tag = "t"): string {
  return `${tag}-${fresh()}`.slice(0, 30);
}

/** Random hex of at least 15 characters (60 bits): for any text value on a unique column that a test builds, in place of a short hex, Math.random or a counter. */
export function testHex(chars = 15): string {
  return fresh().slice(0, Math.max(15, Math.min(chars, 32)));
}

/** One value per spec file (each file loads its own copy of this module): 15 hex characters (60 bits), the stand-in for the pid and the clock in a value a spec builds from "run". */
export const RUN = testHex(15);
