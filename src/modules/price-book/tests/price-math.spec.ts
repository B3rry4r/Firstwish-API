import { discounted, discountOf, lastDayInLagos, promotionLabel } from "../price-math";

describe("price math", () => {
  it("never loses a kobo: the promoted price plus the discount is the list price, for many list prices and percents", () => {
    let x = 7n;
    for (let i = 0; i < 5000; i++) {
      x = (x * 6364136223846793005n + 1442695040888963407n) % 2n ** 40n;
      const list = x % 100_000_000n;
      const pct = Number(x % 101n);
      const d = discounted(list, pct);
      expect(d + discountOf(list, pct)).toBe(list);
      expect(d >= 0n && d <= list).toBe(true);
      // rounded half up: within half a kobo of the exact value
      const exact2 = list * BigInt(100 - pct) * 2n;
      expect(d * 200n - exact2 <= 100n && exact2 - d * 200n <= 100n).toBe(true);
    }
    expect(discounted(500000n, 40)).toBe(300000n);
    expect(discounted(1n, 50)).toBe(1n);
  });

  it("an end at Lagos midnight counts as the day before", () => {
    expect(lastDayInLagos(new Date("2027-01-31T23:00:00Z"))).toBe("2027-01-31");
    expect(promotionLabel(40, new Date("2027-01-31T23:00:00Z"))).toBe("40% off until 31 January");
  });
});
