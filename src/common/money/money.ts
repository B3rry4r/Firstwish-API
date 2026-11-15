/**
 * Money is a whole number of kobo in NGN. There is no float anywhere: amounts come in as integers or digit strings,
 * and every operation is integer arithmetic (BigInt where a product could pass 2^53).
 */
export const CURRENCY = "NGN" as const;
export type Currency = typeof CURRENCY;

export interface MoneyJson {
  amount: number;
  currency: Currency;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const DIGITS = /^-?\d+$/;

export class Money {
  private constructor(readonly kobo: number) {}

  static readonly ZERO = new Money(0);

  /** From kobo: a safe integer, or a string of digits ("150000"). Anything with a decimal point or a comma is refused. */
  static kobo(value: number | string | bigint): Money {
    if (typeof value === "bigint") return Money.checked(value);
    if (typeof value === "string") {
      const v = value.trim();
      if (!DIGITS.test(v)) throw new MoneyError(`Not a whole number of kobo: "${value}"`);
      return Money.checked(BigInt(v));
    }
    if (!Number.isSafeInteger(value)) throw new MoneyError(`Not a whole number of kobo: ${String(value)}`);
    return new Money(value === 0 ? 0 : value); // normalise -0
  }

  /** From whole naira (an integer). */
  static naira(whole: number): Money {
    if (!Number.isSafeInteger(whole)) throw new MoneyError(`Not a whole number of naira: ${String(whole)}`);
    return Money.checked(BigInt(whole) * 100n);
  }

  static fromJson(json: unknown): Money {
    const j = json as Partial<MoneyJson> | null;
    if (!j || typeof j !== "object" || j.currency !== CURRENCY) throw new MoneyError("Money must be { amount, currency: NGN }");
    return Money.kobo(j.amount as number);
  }

  private static checked(v: bigint): Money {
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) throw new MoneyError("Amount too large");
    return new Money(Number(v) === 0 ? 0 : Number(v));
  }

  add(other: Money): Money {
    return Money.checked(BigInt(this.kobo) + BigInt(other.kobo));
  }

  subtract(other: Money): Money {
    return Money.checked(BigInt(this.kobo) - BigInt(other.kobo));
  }

  /** Times a whole number (a quantity). */
  times(quantity: number): Money {
    if (!Number.isSafeInteger(quantity)) throw new MoneyError(`Quantity must be a whole number: ${String(quantity)}`);
    return Money.checked(BigInt(this.kobo) * BigInt(quantity));
  }

  /** A share in basis points (1% = 100 bp), rounded half away from zero to the nearest kobo. */
  basisPoints(bp: number): Money {
    if (!Number.isSafeInteger(bp)) throw new MoneyError(`Basis points must be a whole number: ${String(bp)}`);
    const p = BigInt(this.kobo) * BigInt(bp);
    const neg = p < 0n;
    const abs = neg ? -p : p;
    const q = (abs + 5000n) / 10000n;
    return Money.checked(neg ? -q : q);
  }

  /** Splits into parts by integer weights; the remainder kobo go to the first parts, so the parts always sum to the whole. */
  allocate(weights: number[]): Money[] {
    if (!weights.length || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new MoneyError("Weights must be whole numbers");
    const total = weights.reduce((a, b) => a + BigInt(b), 0n);
    if (total === 0n) throw new MoneyError("Weights must not all be zero");
    const whole = BigInt(this.kobo);
    const parts = weights.map((w) => (whole * BigInt(w)) / total);
    let left = whole - parts.reduce((a, b) => a + b, 0n);
    const step = left < 0n ? -1n : 1n;
    for (let i = 0; left !== 0n; i = (i + 1) % parts.length) {
      if (weights[i] === 0) continue;
      parts[i] += step;
      left -= step;
    }
    return parts.map((p) => Money.checked(p));
  }

  isZero(): boolean {
    return this.kobo === 0;
  }
  isNegative(): boolean {
    return this.kobo < 0;
  }
  equals(other: Money): boolean {
    return this.kobo === other.kobo;
  }
  compare(other: Money): -1 | 0 | 1 {
    return this.kobo < other.kobo ? -1 : this.kobo > other.kobo ? 1 : 0;
  }

  toJSON(): MoneyJson {
    return { amount: this.kobo, currency: CURRENCY };
  }
}
