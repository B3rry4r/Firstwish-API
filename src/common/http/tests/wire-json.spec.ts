import { Controller, Get, StreamableFile } from "@nestjs/common";
import { Readable } from "node:stream";
import { Public } from "../../auth/decorators";
import { Money } from "../../money/money";
import { UnsafeIntegerError, toWire } from "../wire-json";
import { createTestApp, TestApp } from "../../../../test/kit/app";

/* Q2: money on the wire is a JSON integer of kobo; a BigInt past the safe range is refused (500), never rounded. */

@Controller("wire-json-test")
class WireJsonTestController {
  @Public()
  @Get("money")
  money() {
    // the shape a Prisma read of payment gives: BigInt kobo, nested rows, a Date
    return { amountKobo: 300000n, lines: [{ sku: "ticket.moment", kobo: 300000n }], feeKobo: null, createdAt: new Date("2026-01-01T09:00:00Z"), price: Money.kobo(150000) };
  }

  @Public()
  @Get("too-big")
  tooBig() {
    return { amountKobo: 9007199254740992n };
  }
}

describe("toWire", () => {
  it("turns every bigint into a number and leaves the rest as JSON would", () => {
    expect(toWire({ a: 1n, b: [2n, { c: 3n }], d: "x", e: null })).toEqual({ a: 1, b: [2, { c: 3 }], d: "x", e: null });
    expect(JSON.stringify(toWire({ at: new Date("2026-01-01T00:00:00Z") }))).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
  });

  it("returns Buffer, typed arrays, StreamableFile, Readable, Map and Set as the same reference", () => {
    const things = [Buffer.from("pdf"), new Uint8Array([1, 2]), new StreamableFile(Buffer.from("x")), Readable.from(["a"]), new Map([[1, 2n]]), new Set([1])];
    for (const x of things) expect(toWire(x)).toBe(x);
    const b = Buffer.from("zip");
    expect((toWire({ file: b }) as { file: unknown }).file).toBe(b);
    expect(JSON.stringify(toWire(new Date("2026-01-01T00:00:00Z")))).toBe('"2026-01-01T00:00:00.000Z"');
    expect(toWire(Object.assign(Object.create(null), { a: 1n }))).toEqual({ a: 1 });
  });

  it("refuses a value past the safe integer range, naming where it is", () => {
    expect(() => toWire({ rows: [{ amountKobo: 9007199254740992n }] })).toThrow(UnsafeIntegerError);
    expect(() => toWire({ rows: [{ amountKobo: 9007199254740992n }] })).toThrow(/rows\[0\]\.amountKobo/);
    expect(toWire(9007199254740991n)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("a money response serialises", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ controllers: [WireJsonTestController] });
  });
  afterAll(async () => {
    await t.close();
  });

  it("answers BigInt kobo as JSON integers", async () => {
    const res = await t.http().get("/v1/wire-json-test/money").expect(200);
    expect(res.body).toEqual({
      amountKobo: 300000,
      lines: [{ sku: "ticket.moment", kobo: 300000 }],
      feeKobo: null,
      createdAt: "2026-01-01T09:00:00.000Z",
      price: { amount: 150000, currency: "NGN" },
    });
    expect(res.text).toContain('"amountKobo":300000');
  });

  it("answers 500 in the error envelope for an unsafe integer", async () => {
    const res = await t.http().get("/v1/wire-json-test/too-big").expect(500);
    expect(res.body.error.code).toBe("internal_error");
    expect(res.text).not.toContain("9007199254740992");
  });
});
