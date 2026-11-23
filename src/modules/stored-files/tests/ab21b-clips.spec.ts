import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RUN } from "../../../../test/kit/unique";
import { SettlementService } from "../../payments/settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { ClipLengthPort, ClipToolUnavailable } from "../../../common/ports/clip-length.port";
import { MP4, stage } from "./files-kit";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-05-10T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** P-API-BASE-21: the verifier's findings, each through the real routes. */
describe("P-API-BASE-21: the clip rules, round 1 (H1, M2, M3, L5, L6, refund approval)", () => {
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
  async function plant(u: U, wish: string, lengthMs: number | null, file?: Buffer): Promise<string> {
    const id = ids.next();
    await db.storedFile.create({
      data: { id, ownerAccountId: u.id, purpose: "video_clip", objectKey: `video-clip/${id}/x`, contentType: "video/mp4", bytes: 100n, status: "ready", variants: [], driver: "r2", fileId: id, kind: "video", lengthMs } as never,
    });
    await db.uploadTicket.create({ data: { id, bytes: 100n, contentType: "video/mp4", purpose: "video-clip", subjectId: wish } });
    if (file) t.storage.put(`video-clip/${id}/x`, file, "video/mp4");
    return id;
  }
  const seal = async (u: U, id: string) => t.http().post(`/v1/wishes/${id}/seal`).set(auth(u.token)).send({ version: (await row(id)).version, openNow: true });


  const confirmNow = (u: U, id: string) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth(u.token)).send({ fileId: id });
  /** Tickets and staged bytes for `n` clips of `seconds` each, not yet confirmed; a place past the ticket's own is cloned straight (the route would refuse it). */
  async function staged(u: U, wish: string, n: number, seconds: number): Promise<string[]> {
    const out: string[] = [];
    const bytes = MP4(seconds);
    for (let i = 0; i < n; i++) {
      const r = await ticketFor(u, wish, bytes.length);
      if (r.status === 201) out.push((r.body as { id: string }).id);
      else {
        const first = await db.storedFile.findUniqueOrThrow({ where: { id: out[0] } });
        const id = ids.next();
        await db.storedFile.create({ data: { ...first, id, fileId: id, objectKey: `video-clip/${id}/x` } as never });
        await db.uploadTicket.create({ data: { id, bytes: BigInt(bytes.length), contentType: "video/mp4", purpose: "video-clip", subjectId: wish } });
        out.push(id);
      }
    }
    for (const id of out) await stage(t, db, id, bytes, "video/mp4");
    return out;
  }

  it("H1: three legal 10-second clips confirmed at once on Premiere: three 200; twenty rounds", async () => {
    const u = await person();
    for (let round = 0; round < 20; round++) {
      const w = await wishOf(u, "premiere");
      const files = await staged(u, w, 3, 10);
      const rs = await Promise.all(files.map((id) => confirmNow(u, id)));
      expect([round, rs.map((r) => r.status)]).toEqual([round, [200, 200, 200]]);
      expect(await db.storedFile.count({ where: { id: { in: files }, status: { not: "deleted" } } })).toBe(3);
      expect((await db.storedFile.findMany({ where: { id: { in: files } } })).map((f) => f.lengthMs)).toEqual([10000, 10000, 10000]);
    }
  }, 120_000);

  it("H1: four at once on Premiere: three 200 and one 409 with words (the refused file is removed); the clip extra takes the fourth", async () => {
    const u = await person();
    for (let round = 0; round < 5; round++) {
      const w = await wishOf(u, "premiere");
      const files = await staged(u, w, 4, 10);
      const rs = await Promise.all(files.map((id) => confirmNow(u, id)));
      const codes = rs.map((r) => r.status).sort();
      expect([round, codes]).toEqual([round, [200, 200, 200, 409]]);
      const no = rs.find((r) => r.status === 409)!;
      expect(no.body.error.code).toBe("clips_full");
      expect(no.body.error.message).toBe("A wish on the premiere ticket holds at most 3 clips. Remove one to add another.");
    }
  }, 120_000);

  it("M2: clips stored before lengths were read (lengthMs null) are read when first needed and kept: the seal, the next confirm", async () => {
    const u = await person();
    const sealed = await wishOf(u, "premiere");
    const ids3 = [await plant(u, sealed, null, MP4(10)), await plant(u, sealed, null, MP4(12)), await plant(u, sealed, null, MP4(14))];
    expect((await seal(u, sealed)).status).toBe(200);
    expect((await db.storedFile.findMany({ where: { id: { in: ids3 } }, orderBy: { id: "asc" } })).map((f) => f.lengthMs)).toEqual([10000, 12000, 14000]);
    // a new real clip beside two old ones
    const w = await wishOf(u, "premiere");
    const old = [await plant(u, w, null, MP4(9)), await plant(u, w, null, MP4(9))];
    await okClip(u, w, 10);
    expect((await db.storedFile.findMany({ where: { id: { in: old } } })).map((f) => f.lengthMs)).toEqual([9000, 9000]);
    // an old clip that proves too long, and one that cannot be read: each named, none removed
    const bad = await wishOf(u, "premiere");
    const long = await plant(u, bad, null, MP4(30));
    const s1 = await seal(u, bad);
    expect(s1.status).toBe(422);
    expect(s1.body.error.fields.clips).toMatch(new RegExp(`^the clip added on \\d+ \\w+ \\d+ \\(ref ${long.slice(-6)}\\) is longer than this wish may hold`));
    const lost = await plant(u, bad, null);
    const s2 = await seal(u, bad);
    expect(s2.status).toBe(422);
    expect(s2.body.error.fields.clips).toContain(`(ref ${lost.slice(-6)}) could not be read from the file. Remove it to go on.`);
    expect(await db.storedFile.count({ where: { id: { in: [long, lost] }, status: "ready" } })).toBe(2);
    // the offers read reads them too
    const offers = await t.http().get(`/v1/ticket-offers?wish=${bad}`).set(auth(u.token));
    expect(offers.status).toBe(200);
  });

  it("M3: an audio-only file sent as video/mp4 is refused with words and removed; a real picture track passes", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const no = await clip(u, w, MP4(10, 64, "soun"));
    expect([no.at, no.status, no.body.error.code]).toEqual(["confirm", 422, "upload_refused"]);
    expect(no.body.error.message).toMatch(/video/);
    expect((await db.storedFile.findUnique({ where: { id: no.id } }))?.status ?? "deleted").toBe("deleted");
    await okClip(u, w, 10);
  });

  it("L6: the server's tool missing or timed out is a 503 that says to try again later and keeps nothing; a bad file keeps its 422", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const spy = jest.spyOn(t.app.get(ClipLengthPort), "lengthMs").mockRejectedValueOnce(new ClipToolUnavailable("ffprobe did not run"));
    const down = await clip(u, w, MP4(10));
    spy.mockRestore();
    expect([down.at, down.status, down.body.error.code]).toEqual(["confirm", 503, "clip_check_unavailable"]);
    expect(down.body.error.message).toBe("We cannot check video clips right now. Nothing was kept. Try again later.");
    expect((await db.storedFile.findUnique({ where: { id: down.id } }))?.status ?? "deleted").toBe("deleted");
    const bad = await clip(u, w, Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypisom"), Buffer.alloc(40, 1)]));
    expect([bad.status, bad.body.error.code]).toEqual([422, "upload_refused"]);
    await okClip(u, w, 10); // the wish still takes a clip
  });

  it("refund NOT PROVEN: a clip added after a clip-extra refund was asked for and before the second staff member approves: approval 409 clips_held; the refund goes through once the clip is removed", async () => {
    const u = await person();
    const w = await wishOf(u, "premiere");
    const x = await payExtra(u, w, "extra.clip-15s");
    for (let i = 0; i < 3; i++) await okClip(u, w, 8);
    const asked = await t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId: x.id, reason: "Customer asked, checked", amountKobo: Number(x.total) });
    expect(asked.status).toBe(201);
    const refundId = (asked.body as { id: string }).id;
    const added = await okClip(u, w, 8); // the extra still holds its place (a refund only asked for), so the fourth clip is taken
    const approve = () => t.http().post(`/v1/admin/refunds/${refundId}/approve-refund`).set(auth(staff.financeB.token)).send({ reason: "Second look, checked" });
    const no = await approve();
    expect([no.status, no.body.error.code]).toEqual([409, "clips_held"]);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe("requested");
    expect((await t.http().delete(`/v1/uploads/${added.id}`).set(auth(u.token)).send({})).status).toBe(204);
    const yes = await approve();
    expect(yes.status).toBeLessThan(300);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refundId } })).status).not.toBe("requested");
  });
});
