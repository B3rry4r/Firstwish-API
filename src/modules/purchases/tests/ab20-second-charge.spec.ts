import { boot } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";
import { grantOf } from "../../price-book/entitlements.service";
import { EntitlementsService } from "../../price-book/entitlements.service";

const NOW = new Date("2027-06-07T09:00:00.000Z");
const TICKETS = ["moment", "keepsake", "signature", "premiere"];
/** The extras that may rightly be bought again for one wish (T-30: "five more photos"): each adds five to the count. Every other extra is held once. */
const AGAIN = new Set(["extra.five-photos"]);
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

describe("API-BASE-20 case 1: an extra the wish holds is never charged a second time", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("ab20a", NOW);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const start = (auth: string, sku: string, subjectId: string) =>
    k.t.http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab20-${RUN}-${++n}-k`).send({ purpose: "extra", id: sku.slice("extra.".length), subjectId });

  it("1a: every extra of the book, on every ticket, held or not: what the start answers", async () => {
    const rows = await k.db.price.findMany({ where: { sku: { startsWith: "extra." } }, distinct: ["sku"], select: { sku: true } });
    const skus = rows.map((r) => r.sku).sort();
    expect(skus.length).toBeGreaterThanOrEqual(6);
    const book = await k.t.app.get(EntitlementsService).row();
    const table: string[] = [];
    const bad: string[] = [];
    for (const sku of skus) {
      for (const ticket of TICKETS) {
        const takes = (grantOf(book, `ticket.${ticket}`)?.takes as string[] | undefined) ?? [];
        for (const held of [false, true]) {
          for (const status of ["draft", "sealed"] as const) {
            const a = await k.account();
            const w = await k.wish(a.id, { status, ticket, adds: held ? [sku] : [], ...(status === "sealed" ? { opensAt: new Date(NOW.getTime() + 86_400_000) } : {}) });
            const before = await k.db.payment.count({ where: { subjectId: w } });
            const r = await start(a.auth, sku, w);
            const made = (await k.db.payment.count({ where: { subjectId: w } })) - before;
            table.push(`${sku}|${ticket}|${status}|held=${held}|${r.status}|${r.body?.error?.code ?? "-"}|payments=${made}`);
            // the rule: a held extra is refused unless it may be bought again; an extra the ticket does not take is refused; nothing refused makes a payment row
            const mayBuy = takes.includes(sku) && (!held || AGAIN.has(sku));
            if (mayBuy ? r.status !== 201 || made !== 1 : r.status === 201 || made !== 0) bad.push(table[table.length - 1]);
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`AB20-TABLE\n${table.join("\n")}`);
    expect(bad).toEqual([]);
  });

  it("1b: twenty starts at once for each extra the ticket takes: one payment, the rest refused with words; a held extra stays refused after it is paid", async () => {
    const rows = await k.db.price.findMany({ where: { sku: { startsWith: "extra." } }, distinct: ["sku"], select: { sku: true } });
    const book = await k.t.app.get(EntitlementsService).row();
    const seen: string[] = [];
    for (const sku of rows.map((r) => r.sku).sort()) {
      const ticket = TICKETS.find((t) => ((grantOf(book, `ticket.${t}`)?.takes as string[] | undefined) ?? []).includes(sku));
      if (!ticket) continue;
      const a = await k.account();
      const w = await k.wish(a.id, { status: "sealed", ticket, opensAt: new Date(NOW.getTime() + 86_400_000) });
      const all = await Promise.all(Array.from({ length: 20 }, () => start(a.auth, sku, w)));
      const made = all.filter((r) => r.status === 201);
      seen.push(`${sku}|${all.map((r) => r.status).sort().join(",").replace(/(\d+)(,\1)+/g, (m) => `${m.split(",")[0]}x${m.split(",").length}`)}`);
      expect(made.length).toBe(1);
      expect(await k.db.payment.count({ where: { subjectId: w, purpose: "extra" } })).toBe(1);
      for (const r of all.filter((x) => x.status !== 201)) expect(r.body.error.message).toMatch(/\w/);
      // paid: a start again is refused (unless the extra may be bought again) and makes no row
      const { SettlementService } = await import("../../payments/settlement.service");
      const ref = made[0].body.payment.reference;
      const p = await k.db.payment.findFirstOrThrow({ where: { providerReference: ref } });
      const o = await k.t.app.get(SettlementService).settle({ reference: ref, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: NOW });
      expect(o.outcome).toBe("fulfilled");
      const again = await start(a.auth, sku, w);
      expect(AGAIN.has(sku) ? again.status === 201 || again.status === 422 : again.status).toBe(AGAIN.has(sku) ? true : 422);
      if (!AGAIN.has(sku)) expect(await k.db.payment.count({ where: { subjectId: w, purpose: "extra" } })).toBe(1);
    }
    // eslint-disable-next-line no-console
    console.log(`AB20-TWENTY\n${seen.join("\n")}`);
  });

  it("1c: an extra the ticket already includes is refused in words that say so (Signature and Premiere include the premium style, the video and the QR card); the clips are not included", async () => {
    const out: string[] = [];
    for (const [ticket, sku, included] of [["signature", "extra.premium-style", true], ["signature", "extra.qr-card", true], ["signature", "extra.portrait-video", true], ["premiere", "extra.qr-card", true], ["premiere", "extra.premium-style", true], ["signature", "extra.clip-15s", false], ["keepsake", "extra.clip-60s", false], ["moment", "extra.qr-card", false]] as const) {
      const a = await k.account();
      const w = await k.wish(a.id, { status: "sealed", ticket, opensAt: new Date(NOW.getTime() + 86_400_000) });
      const r = await start(a.auth, sku, w);
      expect(r.status).toBe(422);
      expect(await k.db.payment.count({ where: { subjectId: w } })).toBe(0);
      out.push(`${ticket}|${sku}|${r.body.error.fields.subjectId}`);
      expect(r.body.error.fields.subjectId).toBe(included ? "This ticket already includes that extra. Nothing more to buy." : "This ticket does not take that extra.");
    }
  });
});

