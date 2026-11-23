import { boot, ids } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";
import { SettlementService } from "../../payments/settlement.service";
import { isLevel } from "../../styles/style-view";
import { levelRank } from "../style-rule";
import { occasionsOfKind } from "../kind-occasions";

const NOW = new Date("2027-06-07T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

/** API-BASE-20 round 1: F1 (the server's pick on a move reads what the wish HOLDS, IJ3a) and the lows, through the real routes. */
describe("API-BASE-20 round 1", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("pab20", NOW);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const get = (auth: string, id: string) => k.t.http().get(`/v1/wishes/${id}`).set("Authorization", auth);
  const row = (id: string) => k.db.wish.findUniqueOrThrow({ where: { id } });
  const patch = async (auth: string, id: string, body: Record<string, unknown>) => k.t.http().patch(`/v1/wishes/${id}`).set("Authorization", auth).send({ version: (await row(id)).version, ...body });
  async function buy(auth: string, w: string, id: string): Promise<string> {
    const r = await k.t.http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `pab20-${RUN}-${++n}-k`).send({ purpose: "extra", id, subjectId: w });
    expect(r.status).toBe(201);
    const reference = r.body.payment.reference as string;
    const p = await k.db.payment.findFirstOrThrow({ where: { providerReference: reference } });
    const o = await k.t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: NOW });
    expect(o.outcome).toBe("fulfilled");
    return reference;
  }
  async function refundSent(reference: string) {
    const pay = await k.db.payment.findFirstOrThrow({ where: { providerReference: reference } });
    const staff = await k.staff(["finance"]);
    await k.db.refund.create({ data: { id: ids.next(), paymentId: pay.id, amountKobo: 100n, status: "sent", reason: "staff_decision", requestedBy: staff.id, createdAt: NOW } as never });
  }

  it("F1: a Keepsake draft whose premium-style refund was SENT: a kind move with no style never picks a style above Standard", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft", ticket: "keepsake", kind: "love", occasion: "apology", styleSlug: "quiet" });
    const ref = await buy(a.auth, w, "premium-style");
    await refundSent(ref);
    const out: string[] = [];
    for (const occasion of occasionsOfKind("teams")) {
      await k.db.wish.update({ where: { id: w }, data: { kind: "love", occasion: "apology", styleSlug: "quiet", styleTakenLevel: "starter" } });
      const r = await patch(a.auth, w, { kind: "teams", occasion });
      expect(r.status).toBe(200);
      const now = await row(w);
      const s = await k.db.style.findUniqueOrThrow({ where: { slug: now.styleSlug } });
      if (levelRank(isLevel(s.level) ? s.level : "starter") > levelRank("standard") || now.styleTakenLevel === "premium") out.push(`${occasion}:${now.styleSlug}:${s.level}`);
    }
    expect(out).toEqual([]);
    const now = await row(w);
    const s = await k.db.style.findUniqueOrThrow({ where: { slug: now.styleSlug } });
    expect(levelRank(isLevel(s.level) ? s.level : "starter")).toBeLessThanOrEqual(levelRank("standard"));
    expect(levelRank(isLevel(now.styleTakenLevel) ? now.styleTakenLevel : "starter")).toBeLessThanOrEqual(levelRank("standard"));
  });

  it("F1c: what a seal does with a wish holding a premium style whose premium-style refund was SENT (the state the old pick made): refused 422, nothing sealed", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft", ticket: "keepsake", kind: "teams", occasion: "farewell", styleSlug: "milestone", styleTakenLevel: "premium", name: "Ada", content: { letter: { paras: ["Hello."] } }, opensAt: new Date(NOW.getTime() + 86_400_000) });
    const ref = await buy(a.auth, w, "premium-style");
    await refundSent(ref);
    const r = await k.t.http().post(`/v1/wishes/${w}/seal`).set("Authorization", a.auth).send({ version: (await row(w)).version, openNow: true });
    expect(r.status).toBe(422);
    expect(r.body.error.fields.style).toMatch(/Milestone is a Premium style\..*A refund for the premium-style extra is on its way/);
    expect((await row(w)).status).toBe("draft");
  });

  it("F1b: the same wish with the refund NOT sent still picks by the premium level it holds", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft", ticket: "keepsake", kind: "love", occasion: "apology", styleSlug: "quiet" });
    await buy(a.auth, w, "premium-style");
    expect((await patch(a.auth, w, { kind: "teams", occasion: occasionsOfKind("teams")[0] })).status).toBe(200);
    const s = await k.db.style.findUniqueOrThrow({ where: { slug: (await row(w)).styleSlug } });
    expect(levelRank(isLevel(s.level) ? s.level : "starter")).toBeGreaterThanOrEqual(levelRank("standard"));
  });

  it("Low a: other owner answers carry no `adds` (never a false empty list); the single and list reads do", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft", ticket: "keepsake", kind: "love", occasion: "birthday", styleSlug: "noir" });
    const gone = await k.t.http().delete(`/v1/wishes/${w}`).set("Authorization", a.auth).send({ status: "removed" });
    expect(gone.status).toBe(200);
    expect(gone.body).not.toHaveProperty("adds");
    const back = await k.t.http().post(`/v1/wishes/${w}/restore`).set("Authorization", a.auth);
    expect(back.status).toBe(200);
    expect(back.body).not.toHaveProperty("adds");
    expect(Array.isArray((await get(a.auth, w)).body.adds)).toBe(true);
    const list = await k.t.http().get("/v1/wishes").set("Authorization", a.auth);
    const items = list.body.items as { id: string; adds: unknown }[];
    expect(Array.isArray(items.find((x) => x.id === w)?.adds)).toBe(true);
  });

  it("Low b: an extra both included by the ticket and in adds shows once, from the ticket", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "signature", adds: ["extra.premium-style"], opensAt: new Date(NOW.getTime() + 86_400_000) });
    const adds = (await get(a.auth, w)).body.adds as { sku: string; from: string }[];
    const rows = adds.filter((x) => x.sku === "extra.premium-style");
    expect(rows).toEqual([expect.objectContaining({ from: "ticket" })]);
  });
});
