import { Money, MoneyError } from "../money";
import { IsKobo } from "../../validation/decorators";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

describe("Money (integer kobo, NGN)", () => {
  it("serialises as { amount: kobo, currency: NGN }", () => {
    expect(JSON.parse(JSON.stringify({ price: Money.naira(1500) }))).toEqual({ price: { amount: 150000, currency: "NGN" } });
  });

  it("takes a digit string (non-canonical) and gives the same integer", () => {
    expect(Money.kobo(" 150000 ").equals(Money.kobo(150000))).toBe(true);
  });

  it("refuses floats and formatted strings", () => {
    expect(() => Money.kobo(1500.5)).toThrow(MoneyError);
    expect(() => Money.kobo("1500.50")).toThrow(MoneyError);
    expect(() => Money.kobo("1,500")).toThrow(MoneyError);
    expect(() => Money.kobo("₦1500")).toThrow(MoneyError);
    expect(() => Money.naira(10.5)).toThrow(MoneyError);
    expect(() => Money.fromJson({ amount: 100, currency: "USD" })).toThrow(MoneyError);
  });

  it("adds, subtracts and multiplies in whole kobo", () => {
    const a = Money.kobo(1999);
    expect(a.add(Money.kobo(1)).kobo).toBe(2000);
    expect(a.subtract(Money.kobo(2000)).kobo).toBe(-1);
    expect(a.times(3).kobo).toBe(5997);
  });

  it("takes a share in basis points, rounding half away from zero", () => {
    expect(Money.kobo(1005).basisPoints(150).kobo).toBe(15); // 15.075 -> 15
    expect(Money.kobo(1000).basisPoints(150).kobo).toBe(15);
    expect(Money.kobo(333).basisPoints(1500).kobo).toBe(50); // 49.95 -> 50
    expect(Money.kobo(-333).basisPoints(1500).kobo).toBe(-50);
  });

  it("allocates with no kobo lost", () => {
    const parts = Money.kobo(1000).allocate([1, 1, 1]);
    expect(parts.map((p) => p.kobo)).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a.add(b), Money.ZERO).kobo).toBe(1000);
  });

  it("refuses amounts past the safe integer range", () => {
    expect(() => Money.kobo(Number.MAX_SAFE_INTEGER).add(Money.kobo(1))).toThrow(MoneyError);
  });

  it("IsKobo refuses a float or a string on the wire", () => {
    class Dto {
      @IsKobo() amount!: number;
    }
    const bad = [1500.5, "150000", -1].map((amount) => validateSync(plainToInstance(Dto, { amount })).length);
    expect(bad).toEqual([1, 1, 1]);
    expect(validateSync(plainToInstance(Dto, { amount: 150000 }))).toEqual([]);
  });
});
