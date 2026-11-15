import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { dateOnlyOf, isTimeZone, normaliseDateOnly, normaliseInstant, parseInstant, toWireInstant } from "../time";
import { IsDateOnly, IsInstant, IsTimeZone } from "../../validation/decorators";

describe("time canon", () => {
  it("rewrites an offset instant (non-canonical) to UTC Z", () => {
    expect(normaliseInstant("2026-11-15T15:30:00+01:00")).toBe("2026-11-15T14:30:00.000Z");
    expect(normaliseInstant("2026-11-15T14:30Z")).toBe("2026-11-15T14:30:00.000Z");
  });

  it("refuses an instant with no zone", () => {
    expect(parseInstant("2026-11-15T14:30:00")).toBeNull();
    expect(parseInstant("15/11/2026")).toBeNull();
  });

  it("writes instants as ISO-8601 UTC", () => {
    expect(toWireInstant(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe("2026-01-02T03:04:05.000Z");
  });

  it("takes a date-only with spaces (non-canonical) and refuses timestamps and impossible days", () => {
    expect(normaliseDateOnly(" 2026-11-05 ")).toBe("2026-11-05");
    expect(normaliseDateOnly("2026-11-05T00:00:00.000Z")).toBeNull();
    expect(normaliseDateOnly("2026-02-29")).toBeNull();
    expect(normaliseDateOnly("2028-02-29")).toBe("2028-02-29");
    expect(normaliseDateOnly("2026-13-01")).toBeNull();
    expect(dateOnlyOf(new Date("2026-11-05T23:59:59Z"))).toBe("2026-11-05");
  });

  it("knows IANA time zones", () => {
    expect(isTimeZone("Africa/Lagos")).toBe(true);
    expect(isTimeZone("Mars/Base")).toBe(false);
  });

  it("DTO decorators normalise before they validate", () => {
    class Dto {
      @IsInstant() opensAt!: string;
      @IsDateOnly() birthday!: string;
      @IsTimeZone() zone!: string;
    }
    const dto = plainToInstance(Dto, { opensAt: "2026-12-24T20:00:00+01:00", birthday: " 1990-07-04 ", zone: "Africa/Lagos" });
    expect(validateSync(dto)).toEqual([]);
    expect(dto).toEqual({ opensAt: "2026-12-24T19:00:00.000Z", birthday: "1990-07-04", zone: "Africa/Lagos" });
    const bad = validateSync(plainToInstance(Dto, { opensAt: "2026-12-24 20:00", birthday: "1990-02-30", zone: "Lagos" }));
    expect(bad.map((e) => e.property).sort()).toEqual(["birthday", "opensAt", "zone"]);
  });
});
