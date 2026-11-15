import { randomBytes } from "node:crypto";

const HEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** True for a lowercase UUIDv7 string. */
export function isUuidV7(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** The millisecond timestamp written into a UUIDv7. */
export function uuidV7Time(id: string): number {
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}

/**
 * UUIDv7 maker (RFC 9562): 48-bit Unix milliseconds, version 7, a 12-bit counter, variant 10, 62 random bits.
 * Ids made by one maker sort in the order they were made, even within one millisecond.
 */
export class UuidV7Maker {
  private lastMs = -1;
  private counter = 0;

  constructor(
    private readonly nowMs: () => number = () => Date.now(),
    private readonly random: (n: number) => Buffer = randomBytes,
  ) {}

  next(): string {
    let ms = this.nowMs();
    if (ms <= this.lastMs) {
      ms = this.lastMs;
      this.counter++;
      if (this.counter > 0xfff) {
        ms = this.lastMs + 1;
        this.counter = 0;
      }
    } else {
      this.counter = this.random(2).readUInt16BE(0) & 0x7ff; // start low so the counter has room
    }
    this.lastMs = ms;

    const b = Buffer.alloc(16);
    b.writeUIntBE(ms, 0, 6);
    b[6] = 0x70 | ((this.counter >> 8) & 0x0f);
    b[7] = this.counter & 0xff;
    this.random(8).copy(b, 8);
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
