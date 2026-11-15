import { randomBytes, randomInt } from "node:crypto";
import { UuidV7Maker } from "../ids/uuidv7";
import { Clock } from "./clock.port";

/** Makes record ids (UUIDv7 strings). */
export abstract class IdGenerator {
  abstract id(): string;
}

/** Makes one-time codes, tokens and link suffixes. */
export abstract class CodeGenerator {
  /** n random digits, such as a 6-digit sign-in code. */
  abstract digits(n: number): string;
  /** An opaque url-safe token with `bytes` of randomness. */
  abstract token(bytes?: number): string;
  /** 4 characters for a public link slug, from an alphabet without look-alikes. */
  abstract slugSuffix(): string;
}

export const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export class SystemIdGenerator extends IdGenerator {
  private readonly maker: UuidV7Maker;
  constructor(clock: Clock) {
    super();
    this.maker = new UuidV7Maker(() => clock.now().getTime());
  }
  id(): string {
    return this.maker.next();
  }
}

export class SystemCodeGenerator extends CodeGenerator {
  digits(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String(randomInt(10));
    return s;
  }
  token(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }
  slugSuffix(): string {
    let s = "";
    for (let i = 0; i < 4; i++) s += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
    return s;
  }
}

/**
 * Stand-in ids: real UUIDv7 shape and order, with counter bytes in place of most of the randomness. Each generator also
 * carries 4 random bytes of its own (T6), so two test apps sharing one database (same frozen clock, same counter) never
 * give the same id.
 */
export class StandinIdGenerator extends IdGenerator {
  private n = 0;
  private readonly salt = randomBytes(4);
  private readonly maker: UuidV7Maker;
  constructor(clock: Clock) {
    super();
    this.maker = new UuidV7Maker(
      () => clock.now().getTime(),
      (size) => {
        const b = Buffer.alloc(size);
        if (size >= 8) this.salt.copy(b, 0);
        const len = Math.min(4, size);
        b.writeUIntBE(this.n++ % 2 ** (8 * len), size - len, len);
        return b;
      },
    );
  }
  id(): string {
    return this.maker.next();
  }
}

/** Deterministic codes. Queue the next values with queueDigits() or let the counter run (000001, 000002, ...). */
export class StandinCodeGenerator extends CodeGenerator {
  private counter = 0;
  private readonly queued: string[] = [];

  queueDigits(...codes: string[]): void {
    this.queued.push(...codes);
  }
  digits(n: number): string {
    const q = this.queued.shift();
    if (q !== undefined) return q;
    this.counter++;
    return String(this.counter % 10 ** n).padStart(n, "0");
  }
  token(bytes = 32): string {
    this.counter++;
    return Buffer.from(`standin-token-${this.counter}`.padEnd(bytes, ".")).toString("base64url");
  }
  slugSuffix(): string {
    this.counter++;
    let n = this.counter;
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += SLUG_ALPHABET[n % SLUG_ALPHABET.length];
      n = Math.floor(n / SLUG_ALPHABET.length);
    }
    return s;
  }
}
