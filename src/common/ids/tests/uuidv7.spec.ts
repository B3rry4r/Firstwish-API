import { UuidV7Maker, isUuidV7, uuidV7Time } from "../uuidv7";
import { StandinClock } from "../../ports/clock.port";
import { StandinIdGenerator, StandinCodeGenerator, SystemCodeGenerator, SLUG_ALPHABET } from "../../ports/ids.port";

describe("UUIDv7", () => {
  it("has the v7 shape and carries the clock's millisecond", () => {
    const at = Date.UTC(2026, 10, 15, 14, 30);
    const id = new UuidV7Maker(() => at).next();
    expect(isUuidV7(id)).toBe(true);
    expect(id[14]).toBe("7");
    expect(uuidV7Time(id)).toBe(at);
  });

  it("sorts in the order made, even within one millisecond", () => {
    const m = new UuidV7Maker(() => 1_700_000_000_000);
    const ids = Array.from({ length: 5000 }, () => m.next());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses other UUID versions and uppercase", () => {
    expect(isUuidV7("123e4567-e89b-42d3-a456-426614174000")).toBe(false);
    expect(isUuidV7(new UuidV7Maker().next().toUpperCase())).toBe(false);
  });

  it("stand-in ids are deterministic and follow the stand-in clock", () => {
    const a = new StandinIdGenerator(new StandinClock(new Date("2026-01-01T00:00:00Z")));
    const b = new StandinIdGenerator(new StandinClock(new Date("2026-01-01T00:00:00Z")));
    expect([a.id(), a.id()]).toEqual([b.id(), b.id()]);
    expect(uuidV7Time(a.id())).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });
});

describe("code generators", () => {
  it("system codes have the asked length and alphabet", () => {
    const g = new SystemCodeGenerator();
    expect(g.digits(6)).toMatch(/^\d{6}$/);
    expect(g.slugSuffix()).toMatch(new RegExp(`^[${SLUG_ALPHABET}]{4}$`));
    expect(g.token()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stand-in codes can be queued, then count up", () => {
    const g = new StandinCodeGenerator();
    g.queueDigits("424242");
    expect(g.digits(6)).toBe("424242");
    expect(g.digits(6)).toBe("000001");
  });
});
