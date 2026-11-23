import { unsoldLines } from "../../purchases/wish-rules";
import { RenderJobsService } from "../render-jobs.service";
import { NoVideoRenderer, VideoRenderer } from "../video-renderer";
import { boot, ids, routeStorage } from "../../concierge/tests/kit";

const NOW = new Date("2027-06-07T09:00:00.000Z");
const SKU = "extra.portrait-video";
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-19 round 3: N1 (a processed refund), N3 (the wish read agrees with the video read), N2 (the ticket offer for the unsold extra), the sku list note. */
describe("API-BASE-19 r3: N1, N3 (IK4a)", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  beforeAll(async () => {
    k = await boot("ab19s", NOW);
    route = routeStorage(k.t);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  const read = (auth: string, id: string) => http().get(`/v1/wishes/${id}/video`).set("Authorization", auth);
  const ask = (auth: string, id: string) => http().post(`/v1/wishes/${id}/video`).set("Authorization", auth).send({});
  const wishVideo = async (auth: string, id: string) => (await http().get(`/v1/wishes/${id}`).set("Authorization", auth)).body.video as string;
  const listVideo = async (auth: string, id: string) => ((await http().get("/v1/wishes").set("Authorization", auth)).body.items as { id: string; video: string }[]).find((x) => x.id === id)?.video;

  async function paidExtra() {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "keepsake", adds: [SKU], opensAt: new Date(NOW.getTime() + 86_400_000) });
    const job = (await ask(a.auth, w)).body.item;
    expect(await k.t.app.get(RenderJobsService).run(job.id)).toBe("done");
    expect((await read(a.auth, w)).body.downloadUrl).toMatch(/signature=/);
    expect(await wishVideo(a.auth, w)).toBe("ready");
    const pid = ids.next();
    await k.db.payment.create({
      data: { id: pid, accountId: a.id, payerContact: "x@example.com", purpose: "extra", subjectId: w, lines: [{ sku: SKU, name: "v", qty: 1, unitKobo: 100, totalKobo: 100 }], amountKobo: 100n, currency: "NGN", priceBookVersion: (await k.db.price.findFirstOrThrow({ where: { sku: SKU }, orderBy: { version: "desc" } })).version,
        status: "succeeded", provider: "paystack", providerReference: `fw-${pid}`, idempotencyKey: `${a.id}:${pid}`, channel: "card", options: { request: { purpose: "extra", subjectId: w }, server: { fingerprint: pid, flags: [] } } } as never,
    });
    const grant = await k.db.purchaseGrant.create({ data: { id: ids.next(), paymentId: pid, accountId: a.id, wishId: w, kind: "extra", sku: SKU, detail: {}, startsAt: NOW, createdAt: NOW } as never });
    const refund = await k.db.refund.create({ data: { id: ids.next(), paymentId: pid, amountKobo: 100n, status: "sent", reason: "staff_decision", requestedBy: (await k.staff(["finance"])).id, createdAt: NOW } as never });
    return { a, w, grant, refund };
  }
  const gone = async (auth: string, w: string) => {
    const r = await read(auth, w);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/downloadUrl|signature=/);
  };

  it("N1: sent or processed refund: 404 and no download; failed: the download is back; N3: the wish read says none while the video read is 404", async () => {
    const { a, w, grant, refund } = await paidExtra();
    await gone(a.auth, w);
    expect(await wishVideo(a.auth, w)).toBe("none");
    expect(await listVideo(a.auth, w)).toBe("none");
    // processed: what the refund event does (refund succeeded, grant revoked, the extra leaves the wish)
    await k.db.refund.update({ where: { id: refund.id }, data: { status: "succeeded" } as never });
    await k.db.purchaseGrant.update({ where: { id: grant.id }, data: { revokedAt: NOW } });
    await k.db.wish.update({ where: { id: w }, data: { adds: [] } });
    await gone(a.auth, w);
    expect((await ask(a.auth, w)).status).toBe(402);
    expect(await wishVideo(a.auth, w)).toBe("none");
    expect(await listVideo(a.auth, w)).toBe("none");
    // a refund that failed left the money: the person keeps the video
    await k.db.refund.update({ where: { id: refund.id }, data: { status: "failed" } as never });
    await k.db.purchaseGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
    await k.db.wish.update({ where: { id: w }, data: { adds: [SKU] } });
    expect((await read(a.auth, w)).body.downloadUrl).toMatch(/signature=/);
    expect(await wishVideo(a.auth, w)).toBe("ready");
  });

  it("N1: a wish whose TICKET includes the video is not touched by a refund of an extra", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "signature", adds: [SKU], opensAt: new Date(NOW.getTime() + 86_400_000) });
    const job = (await ask(a.auth, w)).body.item;
    expect(await k.t.app.get(RenderJobsService).run(job.id)).toBe("done");
    const pid = ids.next();
    await k.db.payment.create({
      data: { id: pid, accountId: a.id, payerContact: "x@example.com", purpose: "extra", subjectId: w, lines: [{ sku: SKU, name: "v", qty: 1, unitKobo: 100, totalKobo: 100 }], amountKobo: 100n, currency: "NGN", priceBookVersion: (await k.db.price.findFirstOrThrow({ where: { sku: SKU }, orderBy: { version: "desc" } })).version,
        status: "refunded", provider: "paystack", providerReference: `fw-${pid}`, idempotencyKey: `${a.id}:${pid}`, channel: "card", options: { request: { purpose: "extra", subjectId: w }, server: { fingerprint: pid, flags: [] } } } as never,
    });
    await k.db.purchaseGrant.create({ data: { id: ids.next(), paymentId: pid, accountId: a.id, wishId: w, kind: "extra", sku: SKU, detail: {}, startsAt: NOW, revokedAt: NOW, createdAt: NOW } as never });
    await k.db.refund.create({ data: { id: ids.next(), paymentId: pid, amountKobo: 100n, status: "succeeded", reason: "staff_decision", requestedBy: (await k.staff(["finance"])).id, createdAt: NOW } as never });
    await k.db.wish.update({ where: { id: w }, data: { adds: [] } });
    expect((await read(a.auth, w)).body.downloadUrl).toMatch(/signature=/);
    expect(await wishVideo(a.auth, w)).toBe("ready");
  });
});

describe("API-BASE-19 r3: N2 and the sku list", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("ab19t", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new NoVideoRenderer()) });
  });
  afterAll(() => k.t.close());

  it("N2: with no renderer the ticket offer for an unsold extra is the same 409 as the payment start; a sold extra still quotes", async () => {
    const a = await k.account(["person", "business"]);
    await k.db.business.create({ data: { id: ids.next(), accountId: a.id, name: "Studio", business: "Studio", since: NOW, plan: "starter", allowance: 10, used: 0, rolled: 0, month: "2027-06", renews: new Date("2027-07-01T09:00:00.000Z") } as never });
    const offer = (extras: string) => k.t.http().get("/v1/ticket-offers").query({ ticket: "ticket.keepsake", extras }).set("Authorization", a.auth);
    const r = await offer(SKU);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("extra_not_sold");
    expect(r.body.error.message).toMatch(/portrait video/);
    expect((await offer("extra.five-photos")).status).toBe(200);
  });

  /** A new sku cannot be added unclassified: say, for each sku the price book sells, whether its wishes can hold the portrait video. */
  const HOLD_THE_VIDEO = ["concierge.single", "extra.portrait-video", "pass.year", "pro.pack", "pro.starter", "pro.studio", "ticket.premiere", "ticket.signature"];
  const CANNOT = [
    "creator.credit-pack", "creator.extra-review", "creator.plan", "creator.signed", "extra.clip-15s", "extra.clip-60s", "extra.five-photos", "extra.premium-style", "extra.qr-card",
    "keep.half", "keep.month", "keep.year", "ticket.keepsake", "ticket.moment", "vault.block", "vault.block-bulk",
  ];
  it("every sku the price book sells is classified: its wishes can hold the video, or they cannot", async () => {
    const skus = [...new Set((await k.db.price.findMany({ select: { sku: true } })).map((p) => p.sku))].sort();
    const book = await k.db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const loose = skus.filter((s) => !HOLD_THE_VIDEO.includes(s) && !CANNOT.includes(s));
    if (loose.length) {
      throw new Error(`New sku not classified: ${loose.join(", ")}. Decide whether wishes bought with it can hold the portrait video. If they can, add it to GIVE_SIGNATURE in purchases/wish-rules.ts and to HOLD_THE_VIDEO here; if not, add it to CANNOT here.`);
    }
    // the code's set (read from the book, plus GIVE_SIGNATURE) and this list say the same thing
    expect([...unsoldLines(book, false)].sort()).toEqual(HOLD_THE_VIDEO);
  });
});
