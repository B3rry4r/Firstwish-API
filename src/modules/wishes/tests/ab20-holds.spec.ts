import { boot, ids } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";
import { SettlementService } from "../../payments/settlement.service";

const NOW = new Date("2027-06-07T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

/** API-BASE-20 case 2 (IL2): the owner's wish read says what the wish holds and where each extra came from. */
describe("API-BASE-20 case 2: Wish.adds on the owner's reads", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("ab20h", NOW);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const get = (auth: string, id: string) => k.t.http().get(`/v1/wishes/${id}`).set("Authorization", auth);
  async function buy(auth: string, w: string, id: string): Promise<string> {
    const r = await k.t.http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab20h-${RUN}-${++n}-k`).send({ purpose: "extra", id, subjectId: w });
    expect(r.status).toBe(201);
    const reference = r.body.payment.reference as string;
    const p = await k.db.payment.findFirstOrThrow({ where: { providerReference: reference } });
    const o = await k.t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: NOW });
    expect(o.outcome).toBe("fulfilled");
    return reference;
  }

  it("2a: before and after: a bought extra and a ticket's own extras, where each came from; the list carries it; the public link does not", async () => {
    const a = await k.account();
    const keep = await k.wish(a.id, { status: "sealed", ticket: "keepsake", opensAt: new Date(NOW.getTime() + 86_400_000) });
    const sig = await k.wish(a.id, { status: "sealed", ticket: "signature", opensAt: new Date(NOW.getTime() + 86_400_000) });
    const none = await k.wish(a.id, { status: "draft" });
    expect((await get(a.auth, keep)).body.adds).toEqual([]); // nothing held yet: the field is there and empty
    const r1 = await buy(a.auth, keep, "qr-card");
    const r2 = await buy(a.auth, keep, "five-photos");
    const r3 = await buy(a.auth, keep, "five-photos");
    const one = (await get(a.auth, keep)).body;
    expect(one.adds).toEqual([
      { sku: "extra.qr-card", from: "purchase", held: true, refund: null, reference: r1 },
      { sku: "extra.five-photos", from: "purchase", held: true, refund: null, reference: r2 },
      { sku: "extra.five-photos", from: "purchase", held: true, refund: null, reference: r3 },
    ]);
    // a Signature wish: what its ticket includes comes from the book (premium style, video, QR card), five more photos is not included
    const s = (await get(a.auth, sig)).body.adds as { sku: string; from: string; refund: unknown }[];
    expect(s.map((x) => `${x.sku}|${x.from}`)).toEqual(["extra.portrait-video|ticket", "extra.premium-style|ticket", "extra.qr-card|ticket"]);
    expect((await get(a.auth, none)).body.adds).toEqual([]);
    // the list carries it, with ONE purchase-grant query for the page whatever its size
    const spy = jest.spyOn(k.db.purchaseGrant, "findMany");
    const l3 = await k.t.http().get("/v1/wishes?limit=50").set("Authorization", a.auth);
    const calls3 = spy.mock.calls.length;
    spy.mockClear();
    const b = await k.account();
    await k.wish(b.id, { status: "draft" });
    await k.t.http().get("/v1/wishes?limit=50").set("Authorization", b.auth);
    const calls1 = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls3).toBe(calls1);
    const items = l3.body.items as { id: string; adds: unknown[] }[];
    expect(items.find((x) => x.id === keep)?.adds).toHaveLength(3);
    expect(items.find((x) => x.id === sig)?.adds).toHaveLength(3);
    // the public link's read never carries it
    await k.db.wishLink.create({ data: { id: ids.next(), wishId: keep, slug: `ab20h-${RUN}`, active: true } as never });
    const pub = await k.t.http().get(`/v1/w/ab20h-${RUN}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toMatch(/"adds"|extra\.qr-card|fw-/);
    // another person's read of it is 404, and says nothing
    const other = await k.account();
    expect((await get(other.auth, keep)).status).toBe(404);
  });

  it("2b: a purchase whose refund was sent or done says so; a failed refund says nothing; a refund taken back leaves the entry with done", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "keepsake", opensAt: new Date(NOW.getTime() + 86_400_000) });
    const ref = await buy(a.auth, w, "premium-style");
    const pay = await k.db.payment.findFirstOrThrow({ where: { providerReference: ref } });
    const staff = await k.staff(["finance"]);
    const refund = await k.db.refund.create({ data: { id: ids.next(), paymentId: pay.id, amountKobo: 100n, status: "failed", reason: "staff_decision", requestedBy: staff.id, createdAt: NOW } as never });
    const state = async () => ((await get(a.auth, w)).body.adds as { sku: string; held: boolean; refund: string | null }[]).map((x) => `${x.sku}|${x.held}|${x.refund}`);
    expect(await state()).toEqual(["extra.premium-style|true|null"]);
    await k.db.refund.update({ where: { id: refund.id }, data: { status: "sent" } as never });
    expect(await state()).toEqual(["extra.premium-style|false|sent"]);
    // the money is back and the extra taken back from the wish: the entry stays, done and not held
    await k.db.refund.update({ where: { id: refund.id }, data: { status: "succeeded" } as never });
    await k.db.purchaseGrant.updateMany({ where: { paymentId: pay.id }, data: { revokedAt: NOW } });
    await k.db.wish.update({ where: { id: w }, data: { adds: [] } });
    expect(await state()).toEqual(["extra.premium-style|false|done"]);
  });
});
