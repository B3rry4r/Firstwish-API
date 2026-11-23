import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RUN } from "../../../../test/kit/unique";
import { SettlementService } from "../../payments/settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { MP4, stage, WEBM } from "./files-kit";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-05-10T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** API-BASE-21 (IL1a): the server enforces the video clips it sells: how many, how long (read from the file), at the upload, the seal, the ticket start and the refund of an extra. */
describe("API-BASE-21: the clip rules", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  const staff: Record<string, { id: string; token: string }> = {};
  type U = { id: string; token: string };

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    for (const name of ["financeA", "financeB"]) {
      const s = await makeStaff(db, ["finance"]);
      const token = `ab21-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: ["finance"] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const person = async (): Promise<U> => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab21-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab21u-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  };
  const wishOf = async (u: U, ticket: string | null) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: u.id, status: "draft", kind: "love", occasion: "birthday", styleSlug: "status", styleTakenLevel: "standard", ticket, timeZone: "Africa/Lagos", name: "Ada", content: { letter: { paras: ["Happy birthday."] } } } as never });
    return id;
  };
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const ticketFor = (u: U, wish: string, bytes = 100) => t.http().post("/v1/uploads").set(auth(u.token)).send({ purpose: "clip", contentType: "video/mp4", bytes, subjectId: wish });
  /** One whole clip upload through the real routes: the ticket, the bytes, the confirm. */
  async function clip(u: U, wish: string, bytes: Buffer): Promise<{ at: "ticket" | "confirm"; status: number; body: { id?: string; error: { code: string; message: string; fields: Record<string, string> } }; id?: string }> {
    const r = await ticketFor(u, wish, bytes.length);
    if (r.status !== 201) return { at: "ticket", status: r.status, body: r.body as never };
    const id = (r.body as { id: string }).id;
    await stage(t, db, id, bytes, "video/mp4");
    const c = await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(u.token)).send({ fileId: id });
    return { at: "confirm", status: c.status, body: c.body as never, id };
  }
  const okClip = async (u: U, wish: string, seconds: number) => {
    const r = await clip(u, wish, MP4(seconds));
    expect([r.at, r.status]).toEqual(["confirm", 200]);
    return r;
  };
  /** An extra's payment, settled through the one settle path (the start is not asked: the video renderer's gate is not what is tried here). */
  const payExtra = async (u: U, wishId: string, sku: string) => {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: u.id, payerContact: null, purpose: "extra", subjectId: wishId,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${u.id}:${id}`, channel: "card",
        options: { request: { purpose: "extra", subjectId: wishId }, server: { fingerprint: id } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n });
    expect(out.outcome).toBe("fulfilled");
    return { id, reference, total };
  };
  /** A clip row that the routes would refuse (as if the ticket or an extra had changed since): inserted straight, to meet the seal and the ticket start with it. */
  async function plant(u: U, wish: string, lengthMs: number | null): Promise<string> {
    const id = ids.next();
    await db.storedFile.create({
      data: { id, ownerAccountId: u.id, purpose: "video_clip", objectKey: `video-clip/${id}/x`, contentType: "video/mp4", bytes: 100n, status: "ready", variants: [], driver: "r2", fileId: id, kind: "video", lengthMs } as never,
    });
    await db.uploadTicket.create({ data: { id, bytes: 100n, contentType: "video/mp4", purpose: "video-clip", subjectId: wish } });
    return id;
  }
  const seal = async (u: U, id: string) => t.http().post(`/v1/wishes/${id}/seal`).set(auth(u.token)).send({ version: (await row(id)).version, openNow: true });

  it("1a: a draft with no ticket, Moment, Keepsake and Signature hold no clip: refused in words, nothing made", async () => {
    const u = await person();
    for (const ticket of [null, "moment", "keepsake", "signature"]) {
      const w = await wishOf(u, ticket);
      const r = await ticketFor(u, w);
      expect([ticket, r.status]).toEqual([ticket, 403]);
      expect(r.body.error.message).toBe("This wish's ticket does not take clips.");
      expect(await db.uploadTicket.count({ where: { subjectId: w } })).toBe(0);
    }
  });

  it("1b: Premiere holds three; the fourth is refused in words; the extras add one each (read from the book); the wish read says so", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const read = async (): Promise<unknown> => ((await t.http().get(`/v1/wishes/${w}`).set(auth(u.token))).body as { limits: unknown }).limits;
    expect(await read()).toEqual({ photos: 20, voices: 12, clips: { count: 3, seconds: [15, 15, 15] } });
    for (let i = 0; i < 3; i++) await okClip(u, w, 10);
    const four = await ticketFor(u, w);
    expect(four.status).toBe(409);
    expect(four.body.error.code).toBe("clips_full");
    expect(four.body.error.message).toBe("A wish on the premiere ticket holds at most 3 clips. Remove one to add another.");
    expect(await db.uploadTicket.count({ where: { subjectId: w, purpose: "video-clip" } })).toBe(3);
    // the 15-second clip extra: one more
    await payExtra(u, w, "extra.clip-15s");
    expect(await read()).toEqual({ photos: 20, voices: 12, clips: { count: 4, seconds: [15, 15, 15, 15] } });
    await okClip(u, w, 12);
    const five = await ticketFor(u, w);
    expect([five.status, five.body.error.code]).toEqual([409, "clips_full"]);
    expect(five.body.error.message).toBe("A wish on the premiere ticket holds at most 4 clips. Remove one to add another.");
    // the long clip extra: one place of up to 60 seconds more
    await payExtra(u, w, "extra.clip-60s");
    expect(await read()).toEqual({ photos: 20, voices: 12, clips: { count: 5, seconds: [60, 15, 15, 15, 15] } });
    await okClip(u, w, 50);
    expect((await ticketFor(u, w)).status).toBe(409);
    // a removed clip gives its place back
    const mine = await db.uploadTicket.findMany({ where: { subjectId: w, purpose: "video-clip" } });
    expect((await t.http().delete(`/v1/uploads/${mine[0].id}`).set(auth(u.token)).send({})).status).toBe(204);
    expect((await ticketFor(u, w)).status).toBe(201);
  });

  it("1c: twenty uploads at once never pass the limit; an upload never confirmed gives its place back after its 15 minutes", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const all = await Promise.all(Array.from({ length: 20 }, () => ticketFor(u, w)));
    expect(all.filter((r) => r.status === 201)).toHaveLength(3);
    expect(all.filter((r) => r.status === 409)).toHaveLength(17);
    expect(await db.uploadTicket.count({ where: { subjectId: w, purpose: "video-clip" } })).toBe(3);
    expect((await ticketFor(u, w)).status).toBe(409);
    // the three were never uploaded: after the 15 minutes their places are free again
    const later = new Date(NOW.getTime() + 16 * 60_000);
    await db.storedFile.updateMany({ where: { id: { in: all.filter((r) => r.status === 201).map((r) => r.body.id as string) } }, data: { createdAt: new Date(NOW.getTime() - 16 * 60_000) } });
    t.clock.set(later);
    expect((await ticketFor(u, w)).status).toBe(201);
  });

  it("2a: the length is read from the file: 15 seconds pass, a little over passes, 16 is refused in words and the file is removed", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const a = await okClip(u, w, 15);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: a.id } })).lengthMs).toBe(15000);
    await okClip(u, w, 15.4);
    const long = await clip(u, w, MP4(16));
    expect([long.at, long.status]).toEqual(["confirm", 422]);
    expect(long.body.error.message).toBe("1 clip is longer than this wish may hold: the premiere ticket gives 3 clips of up to 15 seconds. Remove it or send a shorter clip.");
    expect(await db.storedFile.count({ where: { id: long.id } })).toBe(0);
    // a long file that says nothing in a field: the file is judged, not what is sent with it
    const lie = await t.http().post("/v1/uploads").set(auth(u.token)).send({ purpose: "clip", contentType: "video/mp4", bytes: 100, subjectId: w, seconds: 5 });
    expect(lie.status).toBe(422);
    expect(lie.body.error.fields.seconds).toBeDefined();
    const big = await clip(u, w, MP4(40));
    expect(big.status).toBe(422);
    expect(await db.storedFile.count({ where: { id: big.id } })).toBe(0);
    // the two that stayed still hold their places: one more fits, the next does not
    await okClip(u, w, 15);
    expect((await ticketFor(u, w)).status).toBe(409);
  });

  it("2b: one clip of up to 60 seconds with the long-clip extra, and only one; with no extra 60 seconds is refused", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    expect((await clip(u, w, MP4(60))).status).toBe(422);
    await payExtra(u, w, "extra.clip-60s");
    const first = await okClip(u, w, 60);
    expect(first.status).toBe(200);
    const second = await clip(u, w, MP4(60));
    expect(second.status).toBe(422);
    expect(second.body.error.message).toMatch(/gives 3 clips of up to 15 seconds and one of up to 60 seconds\. Remove it/);
    expect((await clip(u, w, MP4(61))).status).toBe(422);
    await okClip(u, w, 15);
  });

  it("2c: a file whose length cannot be read is refused and removed: the browser's word is never taken", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const noLength = await clip(u, w, Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypisom"), Buffer.alloc(40, 1)]));
    expect([noLength.at, noLength.status, noLength.body.error.code]).toEqual(["confirm", 422, "upload_refused"]);
    expect(noLength.body.error.message).toMatch(/could not read this clip's length/);
    expect(await db.storedFile.count({ where: { id: noLength.id } })).toBe(0);
    // a WebM with no length in it is the same
    const r = await ticketFor(u, w, 64);
    await stage(t, db, r.body.id, WEBM(64), "video/webm");
    expect(r.status).toBe(201);
    const c = await t.http().post(`/v1/uploads/${r.body.id}/confirm`).set(auth(u.token)).send({ fileId: r.body.id });
    expect(c.status).toBe(422);
  });

  it("3a: the seal refuses more clips, or a longer clip, than the ticket gives, in words that say what to remove; a fitting wish seals", async () => {
    const u = await person();
    const four = await wishOf(u, "premiere");
    for (let i = 0; i < 3; i++) await okClip(u, four, 10);
    const extra = await plant(u, four, 9000);
    const no = await seal(u, four);
    expect(no.status).toBe(422);
    expect(no.body.error.fields.clips).toBe("This wish holds 4 clips and the premiere ticket gives 3 clips of up to 15 seconds. Remove 1 clip to go on.");
    expect((await row(four)).status).toBe("draft");
    await db.uploadTicket.delete({ where: { id: extra } });
    await db.storedFile.delete({ where: { id: extra } });
    expect((await seal(u, four)).status).toBe(200);
    // a clip longer than any place
    const longer = await wishOf(u, "premiere");
    await plant(u, longer, 20_000);
    const l = await seal(u, longer);
    expect(l.status).toBe(422);
    expect(l.body.error.fields.clips).toMatch(/^1 clip is longer than this wish may hold: the premiere ticket gives 3 clips of up to 15 seconds\. Remove it/);
    // a clip whose length was never read from its file
    const unread = await wishOf(u, "premiere");
    await plant(u, unread, null);
    expect((await seal(u, unread)).body.error.fields.clips).toMatch(/never read from the file/);
    // an extra that was refunded away no longer gives its place
    const refunded = await wishOf(u, "premiere");
    const x = await payExtra(u, refunded, "extra.clip-15s");
    for (let i = 0; i < 3; i++) await okClip(u, refunded, 5);
    await okClip(u, refunded, 5);
    await db.refund.create({ data: { id: ids.next(), paymentId: x.id, amountKobo: x.total, status: "sent", reason: "staff_decision", requestedBy: staff.financeA.id } as never });
    const r = await seal(u, refunded);
    expect(r.status).toBe(422);
    expect(r.body.error.fields.clips).toMatch(/holds 4 clips and the premiere ticket gives 3 clips/);
    // a wish with no clips at all on Signature seals as before
    const plain = await wishOf(u, "signature");
    expect((await seal(u, plain)).status).toBe(200);
  });

  it("3b: the ticket start, the offers read and a ticket change downward: a wish holding clips is refused a ticket that gives fewer, in words, with no payment row", async () => {
    const u = await person();
    const w = await wishOf(u, null);
    await plant(u, w, 9000);
    const before = await db.payment.count({ where: { accountId: u.id } });
    const start = await t.http().post("/v1/payments").set(auth(u.token)).set("Idempotency-Key", `ab21-${RUN}-${++seq}-a`).send({ purpose: "ticket", id: "keepsake", subjectId: w });
    expect(start.status).toBe(422);
    expect(start.body.error.fields.subjectId).toBe("This wish holds 1 clip and the keepsake ticket gives none. Remove 1 clip to go on.");
    expect(await db.payment.count({ where: { accountId: u.id } })).toBe(before);
    const offers = await t.http().get(`/v1/ticket-offers?wish=${w}`).set(auth(u.token));
    expect(offers.status).toBe(200);
    const keep = (offers.body.tickets as { ticket: string; canBuy: boolean; reason: string | null; words: string | null }[]).find((x) => x.ticket === "ticket.keepsake");
    expect(keep).toMatchObject({ canBuy: false, reason: "clips_above_ticket" });
    expect(keep?.words).toMatch(/Remove 1 clip to go on/);
    // a wish with no clip is not held back by it
    const free = await wishOf(u, null);
    const ok = (await t.http().get(`/v1/ticket-offers?wish=${free}`).set(auth(u.token))).body.tickets as { ticket: string; reason: string | null }[];
    expect(ok.find((x) => x.ticket === "ticket.keepsake")?.reason).toBeNull();
  });

  it("3c: a ticket refund on a draft that holds clips is refused when the ticket before it gives none", async () => {
    const u = await person();
    const w = await wishOf(u, null);
    const tk = await db.price.findFirstOrThrow({ where: { sku: "ticket.keepsake" }, orderBy: { version: "desc" } });
    const total = tk.promoKobo ?? tk.listKobo;
    const pid = ids.next();
    const reference = `fw-${pid}`;
    await db.payment.create({
      data: {
        id: pid, accountId: u.id, payerContact: null, purpose: "ticket", subjectId: w, lines: [{ sku: tk.sku, name: tk.sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: tk.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${u.id}:${pid}`, channel: "card",
        options: { request: { purpose: "ticket", subjectId: w }, server: { fingerprint: pid } },
      },
    });
    expect((await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n })).outcome).toBe("fulfilled");
    expect((await row(w)).ticket).toBe("keepsake");
    await plant(u, w, 9000);
    const no = await t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId: pid, reason: "Customer asked, checked", amountKobo: Number(total) });
    expect(no.status).toBe(409);
    expect(no.body.error.code).toBe("clips_held");
    expect(no.body.error.message).toMatch(/cannot be refunded while the wish holds clips/);
  });

  it("4: a clip extra is not refundable alone while the wish holds the clip it paid for; refundable once that clip is removed", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const x = await payExtra(u, w, "extra.clip-15s");
    for (let i = 0; i < 3; i++) await okClip(u, w, 8);
    const fourth = await okClip(u, w, 8);
    const start = () => t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId: x.id, reason: "Customer asked, checked", amountKobo: Number(x.total) });
    const before = await db.refund.count({ where: { paymentId: x.id } });
    const no = await start();
    expect(no.status).toBe(409);
    expect(no.body.error.code).toBe("clips_held");
    expect(no.body.error.message).toMatch(/A clip extra cannot be refunded on its own while the wish holds the clip it paid for\. This wish holds 4 clips and the premiere ticket gives 3 clips of up to 15 seconds\. Remove 1 clip to go on\. Remove the clip first/);
    expect(await db.refund.count({ where: { paymentId: x.id } })).toBe(before);
    expect((await row(w)).adds).toEqual(["extra.clip-15s"]);
    expect((await t.http().delete(`/v1/uploads/${fourth.id}`).set(auth(u.token)).send({})).status).toBe(204);
    expect((await start()).status).toBe(201);
    // a held extra never refunds away a longer clip either: the long-clip extra with its 50-second clip
    const w2 = await wishOf(u, "premiere");
    const y = await payExtra(u, w2, "extra.clip-60s");
    await okClip(u, w2, 50);
    const no2 = await t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId: y.id, reason: "Customer asked, checked", amountKobo: Number(y.total) });
    expect([no2.status, no2.body.error.code]).toEqual([409, "clips_held"]);
    expect(no2.body.error.message).toMatch(/longer than this wish may hold/);
  });
});
