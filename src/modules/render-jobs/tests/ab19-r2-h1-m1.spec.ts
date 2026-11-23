import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { PublicBookService } from "../../price-book/public-book.service";
import { ERASE_WISH_FILE_PREFIX, WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { JobsService } from "../../jobs/jobs.service";
import { RenderJobsService } from "../render-jobs.service";
import { NoVideoRenderer, StandinVideoRenderer, VideoRenderer } from "../video-renderer";
import { boot, ids, routeStorage } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-06-07T09:00:00.000Z");
const SKU = "extra.portrait-video";
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

const NOT_SOLD = "This is not on sale right now: it includes the portrait video, which cannot be made yet. Nothing was charged.";

/** API-BASE-19 round 2, H1 (IK3a): with no renderer, anything whose entitlements include the portrait video is not sold. */
describe("API-BASE-19 r2 H1 (IK3a): no renderer, nothing that includes the portrait video is sold", () => {
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("ab19r", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new NoVideoRenderer()) });
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  const start = (auth: string, body: Record<string, unknown>) => http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab19r-${RUN}-${++n}-k`).send(body);
  const draft = (accountId: string, over: Record<string, unknown> = {}) => k.wish(accountId, { status: "draft", name: "Ada", ...over });
  const business = async () => {
    const u = await k.account(["person", "business"]);
    await db.business.create({ data: { id: ids.next(), accountId: u.id, name: "Studio", business: "Studio", since: NOW, plan: "starter", allowance: 10, used: 0, rolled: 0, month: "2027-06", renews: new Date("2027-07-01T09:00:00.000Z") } as never });
    return u;
  };

  /** the start is refused with words, and nothing was written or sent */
  async function refused(auth: string, body: Record<string, unknown>, where: Record<string, unknown>) {
    const sent = k.t.payments.started.length;
    const r = await start(auth, body);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/portrait video/);
    expect(await db.payment.count({ where: where as never })).toBe(0);
    expect(k.t.payments.started.length).toBe(sent);
    return r;
  }

  it("tickets: Signature and Premiere (read from the book) are 409 with words, no payment row, no provider call; Moment and Keepsake still start", async () => {
    const a = await k.account();
    const book = await db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const tickets = book.tickets as Record<string, Record<string, unknown>>;
    const withVideo = ["moment", "keepsake", "signature", "premiere"].filter((t) => tickets[t]?.portraitVideo === true);
    expect(withVideo.sort()).toEqual(["premiere", "signature"]);
    for (const t of withVideo) {
      const w = await draft(a.id);
      const r = await refused(a.auth, { purpose: "ticket", ticket: t, subjectId: w }, { subjectId: w });
      expect(r.body.error.code).toBe("extra_not_sold");
      expect(r.body.error.message).toBe(NOT_SOLD);
    }
    for (const t of ["moment", "keepsake"]) {
      const w = await draft(a.id);
      expect((await start(a.auth, { purpose: "ticket", ticket: t, subjectId: w })).status).toBe(201);
    }
    // another spelling of the same line is the same line
    const w2 = await draft(a.id);
    await refused(a.auth, { purpose: "TICKET", id: " Signature ", subjectId: w2 }, { subjectId: w2 });
  });

  it("the Pass, a business plan, a wish pack and a Concierge order hand out Signature wishes, so they are refused too; a vault block and a keep are not", async () => {
    const a = await k.account();
    await refused(a.auth, { purpose: "pass" }, { accountId: a.id, purpose: "pass" });
    const biz = await business();
    await refused(biz.auth, { purpose: "pro-plan", key: "starter" }, { accountId: biz.id });
    await refused(biz.auth, { purpose: "pro-plan", key: "studio" }, { accountId: biz.id });
    await refused(biz.auth, { purpose: "wish-pack", packs: 1 }, { accountId: biz.id });
    const orderId = (await http().post("/v1/concierge-orders").set("Authorization", a.auth).send({ brief: `ab19r ${RUN}-${++n}`, count: 1, kind: "single", rush: false })).body.id as string;
    await refused(a.auth, { purpose: "concierge", subjectId: orderId }, { subjectId: orderId });
    // lines that include no video are sold as before
    const live = await draft(a.id, { status: "sealed", ticket: "keepsake", opensAt: new Date(NOW.getTime() + 86_400_000) });
    expect((await start(a.auth, { purpose: "keep", id: "month", subjectId: live })).status).not.toBe(409);
    expect((await start(biz.auth, { purpose: "vault-space", id: "block" })).status).toBe(201);
  });

  it("the ticket step's read (GET /v1/ticket-offers) says Signature and Premiere are not available; Moment and Keepsake quote", async () => {
    const biz = await business();
    const offer = (ticket: string) => http().get("/v1/ticket-offers").query({ ticket }).set("Authorization", biz.auth);
    for (const t of ["ticket.signature", "ticket.premiere"]) {
      const r = await offer(t);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("extra_not_sold");
      expect(r.body.error.message).toBe(NOT_SOLD);
    }
    for (const t of ["ticket.moment", "ticket.keepsake"]) expect((await offer(t)).status).toBe(200);
    expect(k.t.app.get(PublicBookService)).toBeDefined();
  });

  it("a payment taken before is still settled, and a stand-in renderer sells everything as before", async () => {
    const a = await k.account();
    const w = await draft(a.id);
    const p = ids.next();
    const unit = 100000n;
    await db.payment.create({
      data: { id: p, accountId: a.id, payerContact: "x@example.com", purpose: "ticket", subjectId: w, lines: [{ sku: "ticket.signature", name: "s", qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN", priceBookVersion: (await db.price.findFirstOrThrow({ where: { sku: "ticket.signature" }, orderBy: { version: "desc" } })).version,
        status: "pending", provider: "paystack", providerReference: `fw-${p}`, idempotencyKey: `${a.id}:${p}`, channel: "card", options: { request: { purpose: "ticket", subjectId: w }, server: { fingerprint: p, flags: [] } } } as never,
    });
    const o = await k.t.app.get(SettlementService).settle({ reference: `fw-${p}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: NOW });
    expect(o.outcome).toBe("fulfilled");
  });
});

describe("API-BASE-19 r2 H1: with the stand-in renderer everything is sold as before", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("ab19s2", NOW);
  });
  afterAll(() => k.t.close());
  it("Signature, Premiere, the Pass, a plan, a pack and ticket-offers all answer as before", async () => {
    expect(k.t.app.get<StandinVideoRenderer>(VideoRenderer)).toBeInstanceOf(StandinVideoRenderer);
    const a = await k.account();
    const biz = await k.account(["person", "business"]);
    await k.db.business.create({ data: { id: ids.next(), accountId: biz.id, name: "Studio", business: "Studio", since: NOW, plan: "starter", allowance: 10, used: 0, rolled: 0, month: "2027-06", renews: new Date("2027-07-01T09:00:00.000Z") } as never });
    const go = (auth: string, body: Record<string, unknown>) => k.t.http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab19s2-${RUN}-${++n}-k`).send(body);
    for (const t of ["signature", "premiere"]) expect((await go(a.auth, { purpose: "ticket", ticket: t, subjectId: await k.wish(a.id, { status: "draft", name: "Ada" }) })).status).toBe(201);
    expect((await go(a.auth, { purpose: "pass" })).status).toBe(201);
    expect((await go(biz.auth, { purpose: "pro-plan", key: "starter" })).status).toBe(201);
    expect((await go(biz.auth, { purpose: "wish-pack", packs: 1 })).status).toBe(201);
    for (const t of ["ticket.signature", "ticket.premiere"]) expect((await k.t.http().get("/v1/ticket-offers").query({ ticket: t }).set("Authorization", biz.auth)).status).toBe(200);
  });
});

/** M1 (IK4a), L1: an erased wish and a refunded extra give no video read and no download; the erase takes the stored video file with the other files. */
describe("API-BASE-19 r2 M1, L1 (IK4a): erased wish, sent refund", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  beforeAll(async () => {
    k = await boot("ab19m1", NOW);
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

  async function readyVideo(over: Record<string, unknown> = {}) {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "signature", opensAt: new Date(NOW.getTime() + 86_400_000), ...over });
    const job = (await ask(a.auth, w)).body.item;
    expect(await k.t.app.get(RenderJobsService).run(job.id)).toBe("done");
    expect((await read(a.auth, w)).body.downloadUrl).toMatch(/signature=/);
    const row = await k.db.renderJob.findUniqueOrThrow({ where: { id: job.id } });
    return { a, w, job, fileId: row.outputFileId as string };
  }

  it("M1: after the wish is erased the video read is 404 with no address, and the stored video file goes with the wish's other files", async () => {
    const { a, w, job, fileId } = await readyVideo();
    const file = await k.db.storedFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(await k.t.storage.readStart(file.objectKey, 10)).not.toBeNull();
    await k.t.app.get(WishLifecycleService).eraseNow(w, "test");
    // the same transaction queued one cleanup job for the file, as for the wish's photos
    const queued = await k.db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM job WHERE type::text = 'upload-cleanup' AND "subjectId" = ${`${ERASE_WISH_FILE_PREFIX}${fileId}`}`;
    expect(Number(queued[0].n)).toBe(1);
    for (const r of [await read(a.auth, w), await ask(a.auth, w)]) {
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.body)).not.toMatch(/downloadUrl|signature=/);
    }
    await k.t.app.get(JobsService).runDue(50, [`${ERASE_WISH_FILE_PREFIX}${fileId}`]);
    expect(await k.db.storedFile.findUnique({ where: { id: fileId } })).toBeNull();
    expect(await k.t.storage.readStart(file.objectKey, 10)).toBeNull();
    expect((await k.db.renderJob.findUniqueOrThrow({ where: { id: job.id } })).outputFileId).toBeNull();
  });

  it("M1: a job that finishes after the erase writes no file", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "signature", opensAt: new Date(NOW.getTime() + 86_400_000) });
    const job = (await ask(a.auth, w)).body.item;
    await k.t.app.get(WishLifecycleService).eraseNow(w, "test");
    const files = await k.db.storedFile.count({ where: { ownerAccountId: a.id } });
    expect(await k.t.app.get(RenderJobsService).run(job.id)).toBe("failed");
    expect(await k.db.storedFile.count({ where: { ownerAccountId: a.id } })).toBe(files);
  });

  it("L1: an extra whose refund was SENT gives no download and no new ask; a refund that failed gives it back", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "keepsake", adds: [SKU], opensAt: new Date(NOW.getTime() + 86_400_000) });
    const job = (await ask(a.auth, w)).body.item;
    expect(await k.t.app.get(RenderJobsService).run(job.id)).toBe("done");
    expect((await read(a.auth, w)).body.downloadUrl).toMatch(/signature=/);
    const pid = ids.next();
    await k.db.payment.create({
      data: { id: pid, accountId: a.id, payerContact: "x@example.com", purpose: "extra", subjectId: w, lines: [{ sku: SKU, name: "v", qty: 1, unitKobo: 100, totalKobo: 100 }], amountKobo: 100n, currency: "NGN", priceBookVersion: (await k.db.price.findFirstOrThrow({ where: { sku: SKU }, orderBy: { version: "desc" } })).version,
        status: "succeeded", provider: "paystack", providerReference: `fw-${pid}`, idempotencyKey: `${a.id}:${pid}`, channel: "card", options: { request: { purpose: "extra", subjectId: w }, server: { fingerprint: pid, flags: [] } } } as never,
    });
    await k.db.purchaseGrant.create({ data: { id: ids.next(), paymentId: pid, accountId: a.id, wishId: w, kind: "extra", sku: SKU, detail: {}, startsAt: NOW, createdAt: NOW } as never });
    const refund = await k.db.refund.create({ data: { id: ids.next(), paymentId: pid, amountKobo: 100n, status: "sent", reason: "staff_decision", requestedBy: (await k.staff(["finance"])).id, createdAt: NOW } as never });
    const gone = await read(a.auth, w);
    expect(gone.status).toBe(404);
    expect(JSON.stringify(gone.body)).not.toMatch(/downloadUrl|signature=/);
    const again = await ask(a.auth, w); // the extra is no longer theirs: asking is "get the video" (402), never a download
    expect(again.status).toBe(402);
    expect(JSON.stringify(again.body)).not.toMatch(/downloadUrl|signature=/);
    await k.db.refund.update({ where: { id: refund.id }, data: { status: "failed" } as never });
    expect((await read(a.auth, w)).body.downloadUrl).toMatch(/signature=/);
  });
});
