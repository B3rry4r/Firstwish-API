import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { FileJobs } from "../../stored-files/file-jobs";
import { JobHandlers } from "../../job-handlers/job-handlers.service";
import { JobsService } from "../../jobs/jobs.service";
import { JPEG, WEBM } from "../../stored-files/tests/files-kit";
import { boot, ids } from "./kit";

const NOW = new Date("2027-04-12T09:00:00.000Z");
const DAY = 86_400_000;
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;
type Who = { id: string; auth: string };

/** API-BASE-10 patch (IE1, IE3, F4): a Concierge wish is a Signature wish; the files of an order never paid; the erase. */
describe("IE: Concierge wishes, order files and the erase", () => {
  let k: Kit;
  let db: PrismaService;
  let makerA: Who;
  const prefix = process.env.TEST_DB_PREFIX || "fw";
  const dbName = `${prefix}_test_ab10e_${process.pid}`;
  const rootDir = join(__dirname, "../../../..");
  const before = process.env.DATABASE_URL;
  beforeAll(async () => {
    const made = spawnSync(process.execPath, [join(rootDir, "scripts/db.mjs"), "create", dbName, prefix], { encoding: "utf8" });
    if (made.status !== 0) throw new Error(`no database: ${made.stderr}`);
    process.env.DATABASE_URL = made.stdout.trim().split("\n").pop();
    k = await boot("ab10e", NOW);
    db = k.db;
    makerA = await k.staff(["maker"]);
  });
  afterAll(async () => {
    await k.t.close();
    process.env.DATABASE_URL = before;
    spawnSync(process.execPath, [join(rootDir, "scripts/db.mjs"), "drop", dbName], { encoding: "utf8" });
  });
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;

  async function placed(buyer: Who, over: Record<string, unknown> = {}): Promise<string> {
    const r = await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `brief ${run}-${++n}`, count: 1, kind: "single", rush: false, ...over });
    expect(r.status).toBe(201);
    return r.body.id as string;
  }
  async function paidOrder(buyer: Who, makerId: string | null) {
    const ops = await k.staff(["ops"]);
    const id = await placed(buyer);
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: id, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: id }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    if (makerId) await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId, reason: "to maker", expectedMaker: "" }).expect(200);
    return { id, payId, ops };
  }
  /** The whole upload path through the real routes: the ticket, the signed put to the stand-in storage, confirm. */
  async function give(buyer: Who, order: string, kind: "photo" | "voice", opts: { confirm?: boolean; bytes?: Buffer } = {}) {
    const bytes = opts.bytes ?? (kind === "photo" ? JPEG(2000) : WEBM(3000));
    const body = { purpose: kind === "photo" ? "order-photo" : "order-voice", contentType: kind === "photo" ? "image/jpeg" : "audio/webm", bytes: bytes.length, subjectId: order, ...(kind === "voice" ? { seconds: 9 } : {}) };
    const tk = await http().post("/v1/uploads").set("Authorization", buyer.auth).send(body);
    if (tk.status !== 201) return { tk, id: "" };
    if (opts.confirm === false) return { tk, id: tk.body.id as string };
    const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
    expect(k.t.storage.putSigned(key, bytes, body.contentType)).toBe(true);
    const cf = await http().post(`/v1/uploads/${tk.body.id}/confirm`).set("Authorization", buyer.auth).send({ fileId: tk.body.id });
    expect(cf.status).toBe(200);
    return { tk, cf, id: tk.body.id as string };
  }
  const buyerList = (auth: string, order: string) => http().get(`/v1/concierge-orders/${order}/files`).set("Authorization", auth);
  const staffList = (auth: string, order: string) => http().get(`/v1/admin/concierge/orders/${order}/files`).set("Authorization", auth);
  const addTo = (auth: string, order: string, wish: string, fileIds: string[]) =>
    http().post(`/v1/admin/concierge/orders/${order}/wishes/${wish}/files`).set("Authorization", auth).send({ reason: "the buyer's photos", fileIds });
  const make = (auth: string, order: string) =>
    http().post(`/v1/admin/concierge/orders/${order}/wishes`).set("Authorization", auth).send({ reason: "making it", kind: "birthday", occasion: "birthday", name: "Ada Obi" });
  const fileRow = (id: string) => db.storedFile.findUnique({ where: { id } });


  const held = (key: string): boolean => (k.t.storage as unknown as { objects: Map<string, unknown> }).objects.has(key);
  const wishRead = (auth: string, id: string) => http().get(`/v1/wishes/${id}`).set("Authorization", auth);
  const ledgerRows = (accountId: string) => db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ledger_entry l JOIN payment p ON p.id = l."paymentId" WHERE p."accountId" = ${accountId}::uuid`.then((r) => r[0].n);

  it("F1: a buyer gives the most a 2-wish order allows; the maker puts ALL of it in the order's wishes, seals and delivers; the wish is Signature, paid by the order", async () => {
    const m = makerA;
    const buyer = await k.account();
    const ordered = await placed(buyer, { count: 2, kind: "list" });
    // pay it (a list order is priced by staff first)
    const ops = await k.staff(["ops"]);
    await http().post(`/v1/admin/concierge/orders/${ordered}/quote`).set("Authorization", ops.auth).send({ quoteKobo: 3000000, reason: "quoted" });
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${ordered}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: ordered, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: ordered }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    await http().post(`/v1/admin/concierge/orders/${ordered}/maker`).set("Authorization", ops.auth).send({ makerId: m.id, reason: "to maker", expectedMaker: "" }).expect(200);
    const rowsBefore = await ledgerRows(buyer.id);
    const paymentsBefore = await db.payment.count({ where: { accountId: buyer.id } });
    // the buyer gives the most: 2 x 15 photos and 2 x 10 voice notes; one more of each is refused
    const photos: string[] = [];
    const voices: string[] = [];
    for (let i = 0; i < 30; i++) photos.push((await give(buyer, ordered, "photo")).id);
    for (let i = 0; i < 20; i++) voices.push((await give(buyer, ordered, "voice")).id);
    const list = await buyerList(buyer.auth, ordered);
    expect(list.body.limits).toEqual({ photos: 30, voices: 20 });
    expect((await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-photo", contentType: "image/jpeg", bytes: 1000, subjectId: ordered })).status).toBe(409);
    expect((await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-voice", contentType: "audio/webm", bytes: 1000, seconds: 5, subjectId: ordered })).status).toBe(409);
    // the maker makes both wishes: Signature from the start, before anything is added
    const wishes: string[] = [];
    for (let i = 0; i < 2; i++) {
      const w = (await make(m.auth, ordered)).body.id as string;
      wishes.push(w);
      expect(await db.wish.findUniqueOrThrow({ where: { id: w }, select: { ticket: true, status: true } })).toEqual({ ticket: "signature", status: "draft" });
      expect(await db.payment.count({ where: { subjectId: w } })).toBe(0);
      expect((await wishRead(buyer.auth, w)).status).toBe(404);
      expect((await http().post("/v1/payments").set("Authorization", buyer.auth).set("Idempotency-Key", `ab10e-${run}-${i}-k1`).send({ purpose: "ticket", ticket: "keepsake", subjectId: w })).status).not.toBe(201);
    }
    // ALL of it goes into the wishes (15 photos and 10 voices in each) and nothing is refused
    for (let i = 0; i < 2; i++) {
      const added = await addTo(m.auth, ordered, wishes[i], [...photos.slice(i * 15, i * 15 + 15), ...voices.slice(i * 10, i * 10 + 10)]);
      expect(added.status).toBe(200);
    }
    const rows = (await buyerList(buyer.auth, ordered)).body.items as { inWish: boolean }[];
    expect(rows).toHaveLength(50);
    expect(rows.every((r) => r.inWish)).toBe(true);
    // one more in a wish is over what Signature holds
    const extra = await give(buyer, ordered, "photo").catch(() => null);
    expect(extra === null || extra.id === "").toBe(true);
    for (let i = 0; i < 2; i++) {
      const got = await wishRead(m.auth, wishes[i]);
      expect(got.body.content.story.photos).toHaveLength(15);
      expect(got.body.content.voices.items).toHaveLength(10);
      const saved = await http().patch(`/v1/wishes/${wishes[i]}`).set("Authorization", m.auth).send({ version: got.body.version, content: { ...got.body.content, letter: { paras: ["Hello."] } } });
      expect(saved.status).toBe(200);
      expect((await http().post(`/v1/wishes/${wishes[i]}/seal`).set("Authorization", m.auth).send({ version: saved.body.version, openNow: true })).status).toBe(200);
    }
    expect((await http().post(`/v1/admin/concierge-orders/${ordered}/delivery`).set("Authorization", m.auth).send({ reason: "all made", wishIds: wishes })).status).toBe(200);
    // nothing given was lost, the order paid for everything: no ticket payment, no second ledger line
    expect(await db.wishFile.count({ where: { wishId: { in: wishes } } })).toBeGreaterThanOrEqual(30);
    expect(await db.payment.count({ where: { accountId: buyer.id } })).toBe(paymentsBefore);
    expect(await db.payment.count({ where: { purpose: "ticket", subjectId: { in: wishes } } })).toBe(0);
    expect(await ledgerRows(buyer.id)).toBe(rowsBefore);
    expect(await db.purchaseGrant.count({ where: { wishId: { in: wishes } } })).toBe(0);
    // after delivery the buyer's wish reads as Signature
    for (const w of wishes) expect((await wishRead(buyer.auth, w)).body).toMatchObject({ ticket: "signature", styleLevel: "premium" });
  }, 180_000);

  it("F1: a wish made for an order that holds no ticket yet (older data) is read on the Signature line too", async () => {
    const m = makerA;
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const photos: string[] = [];
    for (let i = 0; i < 15; i++) photos.push((await give(buyer, o.id, "photo")).id);
    const w = (await make(m.auth, o.id)).body.id as string;
    await db.wish.update({ where: { id: w }, data: { ticket: null } });
    expect((await addTo(m.auth, o.id, w, photos)).status).toBe(200);
  }, 120_000);

  it("F3: the files of an order never paid go 30 days after the order last changed (rows and stored objects); the order stays; a paid order's files stay", async () => {
    const buyer = await k.account();
    const never = await placed(buyer);
    const f1 = await give(buyer, never, "photo");
    const f2 = await give(buyer, never, "voice");
    const key1 = (await fileRow(f1.id))!.objectKey;
    expect(held(key1)).toBe(true);
    const quotedOne = await placed(buyer);
    const f3 = await give(buyer, quotedOne, "photo");
    const paid = await paidOrder(buyer, null);
    const f4 = await give(buyer, paid.id, "photo");
    const young = await placed(buyer);
    const f5 = await give(buyer, young, "photo");
    const touch = (id: string, at: Date) => db.$executeRaw`UPDATE concierge_order SET "updatedAt" = ${at} WHERE id = ${id}::uuid`;
    await touch(never, NOW);
    await touch(quotedOne, NOW);
    await touch(paid.id, NOW);
    await touch(young, new Date(NOW.getTime() + 2 * DAY));
    const jobs = k.t.app.get(FileJobs);
    // day 29: nothing goes
    k.t.clock.set(new Date(NOW.getTime() + 29 * DAY + 3_600_000));
    expect(await jobs.sweepUnpaidOrderFiles()).toBe(0);
    expect((await fileRow(f1.id))?.status).toBe("ready");
    // day 30 and an hour: the two never-paid orders older than that lose their files; the young one and the paid one keep theirs
    k.t.clock.set(new Date(NOW.getTime() + 30 * DAY + 3_600_000));
    expect(await jobs.sweepUnpaidOrderFiles()).toBe(3);
    for (const f of [f1, f2, f3]) expect(await fileRow(f.id)).toBeNull();
    expect(held(key1)).toBe(false);
    expect(await db.conciergeOrderFile.count({ where: { orderId: { in: [never, quotedOne] } } })).toBe(0);
    expect((await fileRow(f4.id))?.status).toBe("ready");
    expect((await fileRow(f5.id))?.status).toBe("ready");
    expect(await db.conciergeOrder.count({ where: { id: { in: [never, quotedOne] }, status: { in: ["brief", "quoted"] } } })).toBe(2);
    expect(await jobs.sweepUnpaidOrderFiles()).toBe(0);
    // the figure is a price-book setting: 5 days, and the young order's file goes at day 7
    await db.$executeRaw`UPDATE lifecycle_config SET "conciergeFilesDays" = 5`;
    k.t.clock.set(new Date(NOW.getTime() + 6 * DAY));
    expect(await jobs.sweepUnpaidOrderFiles()).toBe(0);
    k.t.clock.set(new Date(NOW.getTime() + 7 * DAY + 3_600_000));
    expect(await jobs.sweepUnpaidOrderFiles()).toBe(1);
    expect(await fileRow(f5.id)).toBeNull();
    expect((await fileRow(f4.id))?.status).toBe("ready");
    await db.$executeRaw`UPDATE lifecycle_config SET "conciergeFilesDays" = 30`;
    // the figure is listed with the other limits, marked PROVISIONAL
    const owner = await k.staff(["owner"]);
    const prices = await http().get("/v1/admin/prices").set("Authorization", owner.auth);
    expect(JSON.stringify(prices.body)).toMatch(/limits\.conciergeFilesDays/);
    expect(JSON.stringify(prices.body)).toMatch(/PROVISIONAL/);
  }, 120_000);

  it("F3: the recurring upload-cleanup job does the sweep", async () => {
    const buyer = await k.account();
    const order = await placed(buyer);
    const f = await give(buyer, order, "photo");
    await db.$executeRaw`UPDATE concierge_order SET "updatedAt" = ${NOW} WHERE id = ${order}::uuid`;
    k.t.clock.set(new Date(NOW.getTime() + 31 * DAY));
    k.t.app.get(JobHandlers).registerAll();
    const jobs = k.t.app.get(JobsService);
    await k.t.app.get(JobHandlers).scheduleRecurring();
    await jobs.runDue(100, ["sweep"]);
    expect(await fileRow(f.id)).toBeNull();
  });

  it("F3: a refunded order reads as refunded, not paid; its files are gone and it is no longer the maker's", async () => {
    const m = makerA;
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const f = await give(buyer, o.id, "photo");
    const w = (await make(m.auth, o.id)).body.id as string;
    const owner = await k.staff(["owner"]);
    expect((await http().post(`/v1/admin/payments/fw-${o.payId}/refund`).set("Authorization", owner.auth).send({ reason: "buyer asked for the money back" })).status).toBe(200);
    const body = JSON.stringify({ event: "refund.processed", data: { id: 880000 + (++n), transaction_reference: `fw-${o.payId}`, amount: Number((await db.payment.findUniqueOrThrow({ where: { id: o.payId } })).amountKobo), status: "processed" } });
    expect((await http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", k.t.payments.sign(body)).send(body)).status).toBe(200);
    const read = await http().get(`/v1/concierge-orders/${o.id}`).set("Authorization", buyer.auth);
    expect(read.body).toMatchObject({ status: "refunded", state: "refunded" });
    expect((await staffList(m.auth, o.id)).status).toBe(404);
    expect((await fileRow(f.id))?.status).toBe("deleted");
    expect((await db.wish.findUniqueOrThrow({ where: { id: w } })).erasedAt).not.toBeNull();
    const ownerRead = await http().get(`/v1/admin/concierge/orders/${o.id}`).set("Authorization", owner.auth);
    expect([200, 404]).toContain(ownerRead.status);
    if (ownerRead.status === 200) expect(ownerRead.body.status).toBe("refunded");
  });

  it("F4: from the moment of the buyer's erase the maker cannot list or read the order's files; the real erase job then removes them", async () => {
    const m = makerA;
    const owner = await k.staff(["owner"]);
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const f = await give(buyer, o.id, "photo");
    const v = await give(buyer, o.id, "voice");
    const w = (await make(m.auth, o.id)).body.id as string;
    expect((await staffList(m.auth, o.id)).body.items).toHaveLength(2);
    const erased = await http().post(`/v1/admin/people/${buyer.id}/actions`).set("Authorization", owner.auth).send({ action: "erase", reason: "asked to be erased" });
    expect([200, 202, 204]).toContain(erased.status);
    // before any job runs
    expect(await fileRow(f.id)).not.toBeNull();
    const after = await staffList(m.auth, o.id);
    expect(after.status).toBe(200);
    expect(after.body.items).toEqual([]);
    expect((await staffList(owner.auth, o.id)).body.items).toEqual([]);
    expect((await addTo(m.auth, o.id, w, [f.id])).status).toBeGreaterThanOrEqual(400);
    // the real job, registered in the test app and run by the jobs frame
    k.t.app.get(JobHandlers).registerAll();
    const job = await db.job.findFirst({ where: { type: "upload_cleanup", subjectId: `erase-files:${buyer.id}` } });
    expect(job).not.toBeNull();
    await db.job.update({ where: { id: job!.id }, data: { runAt: NOW } });
    await k.t.app.get(JobsService).runDue(100, [`erase-files:${buyer.id}`]);
    expect(await fileRow(f.id)).toBeNull();
    expect(await fileRow(v.id)).toBeNull();
    expect(await db.conciergeOrderFile.count({ where: { orderId: o.id } })).toBe(0);
  }, 120_000);
});
