import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { FileJobs } from "../../stored-files/file-jobs";
import { WishLifecycleService, ERASE_WISH_FILE_PREFIX } from "../../wishes/wish-lifecycle.service";
import { JPEG, WEBM } from "../../stored-files/tests/files-kit";
import { boot, ids } from "./kit";

const NOW = new Date("2027-04-12T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;
type Who = { id: string; auth: string };

/** API-BASE-10 case 2 (IC7): the buyer's photos and voice note for a Concierge order. */
describe("IC7: the buyer's files for a Concierge order", () => {
  let k: Kit;
  let db: PrismaService;
  /** Two makers for the whole spec (the makers list is one page of the suite's shared database: a spec must not add many). Both are suspended at the end. */
  let makerA: Who;
  let makerB: Who;
  beforeAll(async () => {
    k = await boot("ab10c", NOW);
    db = k.db;
    makerA = await k.staff(["maker"]);
    makerB = await k.staff(["maker"]);
  });
  afterAll(async () => {
    await db.staffAccount.updateMany({ where: { id: { in: [makerA.id, makerB.id] } }, data: { status: "suspended" } });
    await k.t.close();
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
  const runCleanup = async (id: string) => k.t.app.get(WishLifecycleService).eraseWishFileJob({ subjectId: `${ERASE_WISH_FILE_PREFIX}${id}` } as never);

  it("the buyer gives a photo and a voice note from the order's placing, lists them, removes one; they are theirs and touch no limit of theirs", async () => {
    const buyer = await k.account(["person", "business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: buyer.id, name: `Biz ${run}`, business: "Biz", since: NOW, vault: 0n } });
    const order = await placed(buyer);
    const photo = await give(buyer, order, "photo");
    const voice = await give(buyer, order, "voice");
    expect(photo.tk.body.purpose).toBe("order-photo");
    expect(voice.tk.body.purpose).toBe("order-voice");
    expect(photo.cf?.body).toMatchObject({ status: "ready", kind: "image" });
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: photo.id } });
    expect(row).toMatchObject({ ownerAccountId: buyer.id, purpose: "wish_photo" });
    const list = await buyerList(buyer.auth, order);
    expect(list.status).toBe(200);
    expect(list.body.limits).toEqual({ photos: 20, voices: 3 });
    expect(list.body.nextCursor).toBeNull();
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: photo.id, kind: "photo", status: "ready", inWish: false, contentType: "image/jpeg", bytes: 2000, seconds: null }),
      expect.objectContaining({ id: voice.id, kind: "voice", status: "ready", inWish: false, contentType: "audio/webm", seconds: 9 }),
    ]));
    expect(list.body.items[0].url).toBeUndefined();
    // the Vault and the buyer's wishes are not touched
    expect((await db.business.findUniqueOrThrow({ where: { id: businessId } })).vault).toBe(0n);
    expect(await db.wishFile.count({ where: { fileId: { in: [photo.id, voice.id] } } })).toBe(0);
    expect((await http().get("/v1/wishes").set("Authorization", buyer.auth)).body.items).toEqual([]);
    // remove one through the upload route
    expect((await http().delete(`/v1/uploads/${voice.id}`).set("Authorization", buyer.auth).send({})).status).toBe(204);
    const after = await buyerList(buyer.auth, order);
    expect((after.body.items as { id: string }[]).map((i) => i.id)).toEqual([photo.id]);
    expect(await fileRow(voice.id)).toBeNull();
    expect(await db.conciergeOrderFile.count({ where: { fileId: voice.id } })).toBe(0);
  });

  it("attacks: another buyer, an unknown order, a file over the size limit, a wrong type, and 40 files (the order's own limits)", async () => {
    const buyer = await k.account();
    const other = await k.account();
    const order = await placed(buyer);
    const mine = await give(buyer, order, "photo");
    // another buyer: no ticket, no list, no removal; the answers are the same as for an order that does not exist
    const ask = (auth: string, subjectId: string) => http().post("/v1/uploads").set("Authorization", auth).send({ purpose: "order-photo", contentType: "image/jpeg", bytes: 1000, subjectId });
    expect((await ask(other.auth, order)).status).toBe(404);
    expect((await ask(buyer.auth, ids.next())).status).toBe(404);
    expect((await ask(buyer.auth, "nope")).status).toBe(422);
    expect((await buyerList(other.auth, order)).status).toBe(404);
    expect((await http().delete(`/v1/uploads/${mine.id}`).set("Authorization", other.auth).send({})).status).toBe(404);
    expect(await fileRow(mine.id)).not.toBeNull();
    // a file over the limit of a wish photo, and a type a photo does not take
    const big = await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-photo", contentType: "image/jpeg", bytes: 16 * 1024 * 1024, subjectId: order });
    expect(big.status).toBe(422);
    expect((await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-photo", contentType: "audio/webm", bytes: 1000, subjectId: order })).status).toBe(422);
    expect((await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-voice", contentType: "image/jpeg", bytes: 1000, subjectId: order })).status).toBe(422);
    // 40 photo tickets: the order takes 20 (one is already there), the rest are 409 with words
    const statuses: number[] = [];
    let last: { body: { error: { code: string; message: string } } } | undefined;
    for (let i = 0; i < 39; i++) {
      const r = await ask(buyer.auth, order);
      statuses.push(r.status);
      last = r;
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(19);
    expect(statuses.filter((s) => s === 409)).toHaveLength(20);
    expect(last?.body.error.code).toBe("order_files_full");
    expect(last?.body.error.message).toMatch(/at most 20 photos/);
    expect(await db.conciergeOrderFile.count({ where: { orderId: order, kind: "photo" } })).toBe(20);
    // voice notes have their own limit
    for (let i = 0; i < 3; i++) expect((await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-voice", contentType: "audio/webm", bytes: 1000, seconds: 5, subjectId: order })).status).toBe(201);
    const fourth = await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-voice", contentType: "audio/webm", bytes: 1000, seconds: 5, subjectId: order });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.message).toMatch(/at most 3 voice notes/);
    // a removed place is free again
    const first = (await buyerList(buyer.auth, order)).body.items[0].id as string;
    expect((await http().delete(`/v1/uploads/${first}`).set("Authorization", buyer.auth).send({})).status).toBe(204);
    expect((await ask(buyer.auth, order)).status).toBe(201);
  });

  it("the order's maker lists them by signed reads and adds them to the wish being made; they stay the buyer's; only the right people read them", async () => {
    const m = makerA;
    const other = makerB;
    const owner = await k.staff(["owner"]);
    const buyer = await k.account();
    const stranger = await k.account();
    const o = await paidOrder(buyer, m.id);
    const photo = await give(buyer, o.id, "photo");
    const photo2 = await give(buyer, o.id, "photo");
    const voice = await give(buyer, o.id, "voice");
    const waiting = await give(buyer, o.id, "photo", { confirm: false });
    // signed reads for the ready files, none for the one that has not arrived
    const list = await staffList(m.auth, o.id);
    expect(list.status).toBe(200);
    expect(list.body.limits).toEqual({ photos: 20, voices: 3 });
    const byId = new Map((list.body.items as { id: string; url: string | null; expiresAt: string | null; status: string; inWish: boolean }[]).map((i) => [i.id, i]));
    for (const id of [photo.id, photo2.id, voice.id]) {
      expect(byId.get(id)?.url).toEqual(expect.stringMatching(/^https:\/\//));
      expect(byId.get(id)?.expiresAt).toBe(new Date(NOW.getTime() + 10 * 60_000).toISOString());
    }
    expect(byId.get(waiting.id)).toMatchObject({ status: "pending", url: null, expiresAt: null });
    // nobody else reads them
    expect((await staffList(other.auth, o.id)).status).toBe(404);
    expect((await staffList(o.ops.auth, o.id)).status).toBe(403);
    expect((await staffList(buyer.auth, o.id)).status).toBe(403);
    expect((await buyerList(stranger.auth, o.id)).status).toBe(404);
    expect((await staffList(owner.auth, o.id)).status).toBe(200);
    // the wish being made
    const w = (await make(m.auth, o.id)).body.id as string;
    expect((await addTo(other.auth, o.id, w, [photo.id])).status).toBe(404);
    expect((await addTo(o.ops.auth, o.id, w, [photo.id])).status).toBe(403);
    expect((await addTo(buyer.auth, o.id, w, [photo.id])).status).toBe(403);
    expect((await db.wishFile.count({ where: { wishId: w } }))).toBe(0);
    // a file that has not arrived, a file that is not the order's, a wish of another order, a wish of the buyer's own
    const bad = await addTo(m.auth, o.id, w, [waiting.id]);
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.fileIds).toMatch(/Not ready yet/);
    const elsewhere = await k.account();
    const o2 = await paidOrder(elsewhere, m.id);
    const alien = await give(elsewhere, o2.id, "photo");
    const notMine = await addTo(m.auth, o.id, w, [alien.id]);
    expect(notMine.status).toBe(422);
    expect(notMine.body.error.fields.fileIds).toMatch(/Not a file of this order/);
    const w2 = (await make(m.auth, o2.id)).body.id as string;
    expect((await addTo(m.auth, o.id, w2, [photo.id])).status).toBe(404);
    const own = await k.wish(buyer.id, { status: "draft" });
    expect((await addTo(m.auth, o.id, own, [photo.id])).status).toBe(404);
    expect((await addTo(m.auth, o.id, w, [])).status).toBe(422);
    // the add: a photo and the voice note join the wish; the files stay the buyer's
    const added = await addTo(m.auth, o.id, w, [photo.id, voice.id]);
    expect(added.status).toBe(200);
    const inWish = new Map((added.body.items as { id: string; inWish: boolean }[]).map((i) => [i.id, i.inWish]));
    expect(inWish.get(photo.id)).toBe(true);
    expect(inWish.get(voice.id)).toBe(true);
    expect(inWish.get(photo2.id)).toBe(false);
    const wish = await http().get(`/v1/wishes/${w}`).set("Authorization", m.auth);
    expect(wish.body.content.story.photos).toEqual([{ photoId: photo.id }]);
    expect(wish.body.content.voices.items).toEqual([{ voiceId: voice.id, name: "Voice note" }]);
    expect(await db.wishFile.count({ where: { wishId: w, fileId: { in: [photo.id, voice.id] } } })).toBe(2);
    expect((await fileRow(photo.id))?.ownerAccountId).toBe(buyer.id);
    expect((await fileRow(voice.id))?.ownerAccountId).toBe(buyer.id);
    expect((await db.voiceNote.findUniqueOrThrow({ where: { id: voice.id } })).wishId).toBe(w);
    expect(await db.auditEntry.count({ where: { action: "concierge.add-files", subjectId: o.id } })).toBe(1);
    // adding again changes nothing; the buyer reads the order's list with the marks, and cannot remove a file the wish uses
    expect((await addTo(m.auth, o.id, w, [photo.id])).status).toBe(200);
    expect((await db.wishFile.count({ where: { wishId: w, fileId: photo.id } }))).toBe(1);
    const mine = await buyerList(buyer.auth, o.id);
    expect((mine.body.items as { id: string; inWish: boolean }[]).find((i) => i.id === photo.id)?.inWish).toBe(true);
    const blocked = await http().delete(`/v1/uploads/${photo.id}`).set("Authorization", buyer.auth).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("file_in_use");
    expect((await http().delete(`/v1/uploads/${photo2.id}`).set("Authorization", buyer.auth).send({})).status).toBe(204);
    // the wish's own limit applies when adding (a wish with no ticket is on the Moment line: 6 photos)
    const seven: string[] = [];
    for (let i = 0; i < 7; i++) seven.push((await give(buyer, o.id, "photo")).id);
    const over = await addTo(m.auth, o.id, w, seven);
    expect(over.status).toBe(422);
    expect(JSON.stringify(over.body.error.fields)).toMatch(/Over the limit/);
    // the order moves to another maker: the first loses the files and the add at once
    await http().post(`/v1/admin/concierge/orders/${o.id}/maker`).set("Authorization", o.ops.auth).send({ makerId: other.id, reason: "hand over", expectedMaker: m.id }).expect(200);
    expect((await staffList(m.auth, o.id)).status).toBe(404);
    expect((await addTo(m.auth, o.id, w, [seven[0]])).status).toBe(404);
    expect((await staffList(other.auth, o.id)).status).toBe(200);
    expect((await addTo(other.auth, o.id, w, seven.slice(0, 2))).status).toBe(200);
  });

  it("delivery keeps the files the wish uses with the wish and removes the unused ones; the maker no longer reads them", async () => {
    const m = makerA;
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const used = await give(buyer, o.id, "photo");
    const unused = await give(buyer, o.id, "photo");
    const voice = await give(buyer, o.id, "voice");
    const w = (await make(m.auth, o.id)).body.id as string;
    expect((await addTo(m.auth, o.id, w, [used.id])).status).toBe(200);
    const v = (await http().get(`/v1/wishes/${w}`).set("Authorization", m.auth)).body.version as number;
    const saved = await http().patch(`/v1/wishes/${w}`).set("Authorization", m.auth).send({ version: v, content: { letter: { paras: ["Hello."] }, story: { photos: [{ photoId: used.id }] } } });
    expect(saved.status).toBe(200);
    expect((await http().post(`/v1/wishes/${w}/seal`).set("Authorization", m.auth).send({ version: saved.body.version, openNow: true })).status).toBe(200);
    expect((await http().post(`/v1/admin/concierge-orders/${o.id}/delivery`).set("Authorization", m.auth).send({ reason: "all made" })).status).toBe(200);
    // the unused ones are gone for everyone at once (marked removed, no longer listed), and the cleanup removes their objects and rows
    expect((await fileRow(unused.id))?.status).toBe("deleted");
    expect((await fileRow(voice.id))?.status).toBe("deleted");
    expect((await buyerList(buyer.auth, o.id)).body.items).toEqual([]);
    expect((await staffList(m.auth, o.id)).status).toBe(404);
    expect(await db.conciergeOrderFile.count({ where: { orderId: o.id } })).toBe(0);
    await runCleanup(unused.id);
    await runCleanup(voice.id);
    await runCleanup(used.id);
    expect(await fileRow(unused.id)).toBeNull();
    expect(await fileRow(voice.id)).toBeNull();
    // the file the wish uses stays with the wish, the buyer's own
    expect((await fileRow(used.id))?.status).toBe("ready");
    expect(await db.wishFile.count({ where: { wishId: w, fileId: used.id } })).toBe(1);
    expect((await fileRow(used.id))?.ownerAccountId).toBe(buyer.id);
    // an order that ended takes no more
    const late = await http().post("/v1/uploads").set("Authorization", buyer.auth).send({ purpose: "order-photo", contentType: "image/jpeg", bytes: 1000, subjectId: o.id });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("order_ended");
  });

  it("cancel (the buyer's before it is with a maker, and staff's with a wish half made) takes every file; a refund of the order's payment takes them too", async () => {
    const m = makerA;
    // the buyer cancels a placed order
    const b1 = await k.account();
    const placedOrder = await placed(b1);
    const f1 = await give(b1, placedOrder, "photo");
    const p1 = await give(b1, placedOrder, "photo", { confirm: false });
    expect((await http().post(`/v1/concierge-orders/${placedOrder}/cancel`).set("Authorization", b1.auth)).status).toBe(200);
    expect((await fileRow(f1.id))?.status).toBe("deleted");
    expect((await fileRow(p1.id))?.status).toBe("deleted");
    expect((await buyerList(b1.auth, placedOrder)).body.items).toEqual([]);
    // a file whose upload was never confirmed cannot be finished after the cancel
    const late = await http().post(`/v1/uploads/${p1.id}/confirm`).set("Authorization", b1.auth).send({ fileId: p1.id });
    expect(late.status).toBe(404);
    // staff cancel an order with a wish half made and a file in it
    const b2 = await k.account();
    const o2 = await paidOrder(b2, m.id);
    const f2 = await give(b2, o2.id, "photo");
    const f2b = await give(b2, o2.id, "voice");
    const w2 = (await make(m.auth, o2.id)).body.id as string;
    expect((await addTo(m.auth, o2.id, w2, [f2.id])).status).toBe(200);
    expect((await http().post(`/v1/admin/concierge/orders/${o2.id}/cancel`).set("Authorization", o2.ops.auth).send({ reason: "buyer asked" })).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w2 } })).erasedAt).not.toBeNull();
    expect((await fileRow(f2.id))?.status).toBe("deleted");
    expect((await fileRow(f2b.id))?.status).toBe("deleted");
    expect(await db.wishFile.count({ where: { fileId: f2.id } })).toBe(0);
    await runCleanup(f2.id);
    expect(await fileRow(f2.id)).toBeNull();
    // a refund of the order's payment
    const b3 = await k.account();
    const o3 = await paidOrder(b3, m.id);
    const f3 = await give(b3, o3.id, "photo");
    const owner = await k.staff(["owner"]);
    expect((await http().post(`/v1/admin/payments/fw-${o3.payId}/refund`).set("Authorization", owner.auth).send({ reason: "buyer asked for the money back" })).status).toBe(200);
    const body = JSON.stringify({ event: "refund.processed", data: { id: 990000 + n, transaction_reference: `fw-${o3.payId}`, amount: Number((await db.payment.findUniqueOrThrow({ where: { id: o3.payId } })).amountKobo), status: "processed" } });
    expect((await http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", k.t.payments.sign(body)).send(body)).status).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: o3.payId } })).status).toBe("refunded");
    expect((await fileRow(f3.id))?.status).toBe("deleted");
    expect((await staffList(m.auth, o3.id)).body.items).toEqual([]);
  });

  it("the buyer's erase removes the files with the rest of the buyer's files, and nobody reads them after", async () => {
    const m = makerA;
    const owner = await k.staff(["owner"]);
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const f = await give(buyer, o.id, "photo");
    const v = await give(buyer, o.id, "voice");
    const erased = await http().post(`/v1/admin/people/${buyer.id}/actions`).set("Authorization", owner.auth).send({ action: "erase", reason: "asked to be erased" });
    expect([200, 202, 204]).toContain(erased.status);
    await k.t.app.get(FileJobs).eraseFilesOf(buyer.id);
    expect(await fileRow(f.id)).toBeNull();
    expect(await fileRow(v.id)).toBeNull();
    expect(await db.conciergeOrderFile.count({ where: { orderId: o.id } })).toBe(0);
    expect((await staffList(m.auth, o.id)).body.items).toEqual([]);
  });

  it("the weekly sweep of unattached uploads never takes a file an open order holds", async () => {
    const buyer = await k.account();
    const order = await placed(buyer);
    const f = await give(buyer, order, "photo");
    k.t.clock.set(new Date(NOW.getTime() + 30 * 86_400_000));
    await db.storedFile.update({ where: { id: f.id }, data: { updatedAt: NOW } });
    await k.t.app.get(FileJobs).sweepUnattached();
    expect((await fileRow(f.id))?.status).toBe("ready");
  });
});
