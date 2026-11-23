import { boot, ids } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";
import { NoVideoRenderer, VideoRenderer } from "../../render-jobs/video-renderer";

const NOW = new Date("2027-06-07T09:00:00.000Z");
const TICKETS = ["ticket.moment", "ticket.keepsake", "ticket.signature", "ticket.premiere"];
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

/** API-BASE-20 case 3 (IL3): a person reads the offers for their own wish; every ticket says whether it can be bought now. */
describe.each([
  ["no renderer: the top two tickets are not sold", true],
  ["a renderer is configured: all four are sold", false],
])("API-BASE-20 case 3: GET /v1/ticket-offers for a person (%s)", (_name, noRenderer) => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("ab20o", NOW, noRenderer ? { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new NoVideoRenderer()) } : {});
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const offers = (auth: string, q: string) => k.t.http().get(`/v1/ticket-offers${q}`).set("Authorization", auth);
  const start = (auth: string, ticket: string, subjectId: string) =>
    k.t.http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab20o-${RUN}-${++n}-k`).send({ purpose: "ticket", ticket: ticket.slice("ticket.".length), subjectId });
  /** what the start answers for a ticket, as a refusal's words (or null when it was started: then drop the payment so the next start is not held up by it) */
  async function startWords(auth: string, ticket: string, w: string): Promise<string | null> {
    const r = await start(auth, ticket, w);
    if (r.status === 201) {
      await k.db.payment.updateMany({ where: { providerReference: r.body.payment.reference }, data: { status: "failed" } });
      return null;
    }
    return (r.body.error.fields?.subjectId as string | undefined) ?? (r.body.error.message as string);
  }

  it("3a: before, a person got 403; now the read for their own wish lists all four tickets, and each answer is what the payment start answers", async () => {
    const a = await k.account();
    const draft = await k.wish(a.id, { status: "draft" });
    // the old call (a ticket, no wish) is as it was: 403 for a person with no business side
    expect((await offers(a.auth, "?ticket=ticket.moment")).status).toBe(403);
    expect((await offers(a.auth, "")).status).toBe(403);
    const r = await offers(a.auth, `?wish=${draft}`);
    expect(r.status).toBe(200);
    const list = r.body.tickets as { ticket: string; name: string; canBuy: boolean; reason: string | null; words: string | null; priceKobo: number; listKobo: number }[];
    expect(list.map((t) => t.ticket)).toEqual(TICKETS);
    for (const t of list) {
      expect(t.priceKobo).toBeGreaterThan(0);
      expect(t.listKobo).toBeGreaterThanOrEqual(t.priceKobo);
      expect(t.name).toMatch(/\w/);
    }
    const sold = (t: string) => !(noRenderer && (t === "ticket.signature" || t === "ticket.premiere"));
    expect(list.map((t) => t.canBuy)).toEqual(TICKETS.map(sold));
    for (const t of list.filter((x) => !x.canBuy)) {
      expect(t.reason).toBe("extra_not_sold");
      expect(t.words).toBe("This is not on sale right now: it includes the portrait video, which cannot be made yet. Nothing was charged.");
    }
    for (const t of list.filter((x) => x.canBuy)) expect([t.reason, t.words]).toEqual([null, null]);
    // the quote beside it is the Moment's (no ticket named), and a named ticket still quotes it, a named unsold ticket still 409
    expect(r.body.lines[0].sku).toBe("ticket.moment");
    const named = await offers(a.auth, `?wish=${draft}&ticket=ticket.premiere`);
    expect(named.status).toBe(noRenderer ? 409 : 200);
    expect((await offers(a.auth, `?wish=${draft}&extras=extra.qr-card`)).status).toBe(422);
    // parity with the start: for every state of the wish, canBuy and the words are the start's
    const sealed = await k.wish(a.id, { status: "sealed", opensAt: new Date(NOW.getTime() + 86_400_000) });
    const held = await k.wish(a.id, { status: "draft", ticket: "keepsake" });
    for (const w of [draft, sealed, held]) {
      const read = (await offers(a.auth, `?wish=${w}`)).body.tickets as { ticket: string; canBuy: boolean; words: string | null }[];
      for (const t of read) {
        const said = await startWords(a.auth, t.ticket, w);
        expect([w, t.ticket, t.canBuy, t.words]).toEqual([w, t.ticket, said === null, said]);
      }
    }
    const heldRead = (await offers(a.auth, `?wish=${held}`)).body.tickets as { ticket: string; reason: string | null }[];
    expect(heldRead.map((t) => t.reason)).toEqual(["ticket_not_an_upgrade", "ticket_already_held", noRenderer ? "extra_not_sold" : "wish_has_ticket", noRenderer ? "extra_not_sold" : "wish_has_ticket"]);
    const sealedRead = (await offers(a.auth, `?wish=${sealed}`)).body.tickets as { reason: string | null }[];
    expect(sealedRead.filter((t) => t.reason === "wish_sealed").length).toBe(noRenderer ? 2 : 4);
  });

  it("3b: a ticket payment that waits shows on every ticket; another person's wish, an erased one and a bad id are 404; the business side's read is as before", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft" });
    const first = await start(a.auth, "ticket.moment", w);
    expect(first.status).toBe(201);
    const waiting = (await offers(a.auth, `?wish=${w}`)).body.tickets as { reason: string | null; words: string | null }[];
    expect(waiting.map((t) => t.reason)).toEqual(TICKETS.map((t) => (noRenderer && (t === "ticket.signature" || t === "ticket.premiere") ? "extra_not_sold" : "ticket_payment_pending")));
    const other = await k.account();
    expect((await offers(other.auth, `?wish=${w}`)).status).toBe(404);
    expect((await offers(a.auth, "?wish=not-an-id")).status).toBe(404);
    expect((await offers(a.auth, `?wish=${ids.next()}`)).status).toBe(404);
    const gone = await k.wish(a.id, { status: "draft", erasedAt: NOW });
    expect((await offers(a.auth, `?wish=${gone}`)).status).toBe(404);
    expect((await k.t.http().get(`/v1/ticket-offers?wish=${w}`)).status).toBe(401);
    const biz = await k.account(["person", "business"]);
    await k.db.business.create({ data: { id: ids.next(), accountId: biz.id, name: "Studio", business: "Studio", since: NOW } as never });
    const b = await offers(biz.auth, "?ticket=ticket.moment");
    expect(b.status).toBe(200);
    expect(b.body.tickets).toBeUndefined(); // the business side's read is as it was
    expect((await offers(biz.auth, "")).status).toBe(422);
  });
});
