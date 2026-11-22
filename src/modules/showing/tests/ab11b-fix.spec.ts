import { PrismaService } from "../../../common/db/prisma.service";
import { ownDatabase } from "../../../../test/kit/own-db";
import { testSlug } from "../../../../test/kit/unique";
import { uniqueHandle } from "../../accounts/tests/sides.kit";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { FileJobs } from "../../stored-files/file-jobs";
import { ERASE_WISH_FILE_PREFIX } from "../../wishes/wish-lifecycle.service";
import { account, B12App, b13App, bearer, liveWish, staffOf, uniqueAddress, type Who } from "./b13-kit";

const DAY = 86_400_000;
const actor = { type: "staff" as const, id: null, requestId: "ab11b-fix" };

/** API-BASE-11B check fixes F1 to F4 (IF4a), through the real routes and the real jobs. */
describe("IF4a fixes: account erase and friends' voices, creator reads by account, Concierge wishes never listed, removed wishes under a report", () => {
  let t: B12App;
  let db: PrismaService;
  let jobs: JobsService;
  let mod: { id: string; token: string };
  const own = ownDatabase("fix");
  beforeAll(async () => {
    own.use();
    t = await b13App();
    db = t.db;
    jobs = t.app.get(JobsService);
    mod = await staffOf(t, "moderator");
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });

  async function creator(name = "Ada Maker") {
    const who = await account(t, ["creator"]);
    const handle = uniqueHandle("c");
    await db.account.update({ where: { id: who.accountId }, data: { handle, name } });
    const row = await db.creator.create({ data: { id: t.id(), accountId: who.accountId, name } });
    return { ...who, handle, creatorId: row.id };
  }
  async function style(creatorId: string | null, name = "Mine") {
    const slug = testSlug("st");
    await db.style.create({ data: { id: t.id(), slug, name, level: "standard", tier: "standard", house: false, on: true, by: "x", get: "", record: [], addedAt: new Date(), creator: creatorId ? { creatorId } : undefined } as never });
    return slug;
  }
  async function voice(ownerId: string, wishId: string, from: string) {
    const id = t.id();
    const objectKey = `files/${id}`;
    t.storage.put(objectKey, Buffer.from("VOICE"), "audio/webm");
    await db.storedFile.create({ data: { id, ownerAccountId: ownerId, purpose: "voice_note", objectKey, contentType: "audio/webm", bytes: BigInt(5), status: "ready", driver: "r2", variants: [] } as never });
    await db.uploadTicket.create({ data: { id, bytes: BigInt(5), contentType: "audio/webm", purpose: "voice-note" } });
    await db.voiceNote.create({ data: { id, wishId, seconds: 3 } });
    await db.wishGatherVoice.create({ data: { id, wishId, fromName: from } });
    return { id, key: objectKey };
  }
  async function publish(owner: Who, name = "Ada") {
    const w = await liveWish(t, owner, { name });
    expect((await t.http().post(`/v1/wishes/${w.id}/publish-requests`).set(bearer(owner.token)).send({ consent: true })).status).toBe(201);
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id, status: "waiting" } });
    expect((await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(mod.token)).send({ decision: "approve", reason: "Looks lovely" })).status).toBe(200);
    return { ...w, rowId: (await db.publishedWish.findFirstOrThrow({ where: { wishId: w.id } })).id };
  }

  it("F1. an account's erase removes every friend's voice given to its wishes (rows, first names, stored objects); another account's voices stay", async () => {
    const me = await account(t, ["person"]);
    const other = await account(t, ["person"]);
    const w1 = await liveWish(t, me);
    const w2 = await liveWish(t, me);
    const mine = [await voice(me.accountId, w1.id, "Kemi"), await voice(me.accountId, w2.id, "Tobi")];
    const w3 = await liveWish(t, other);
    const theirs = await voice(other.accountId, w3.id, "Ngozi");
    for (const v of [...mine, theirs]) expect(await t.storage.head(v.key)).not.toBeNull();
    await t.app.get(AccountErasureService).erase(me.accountId, { actor, reason: "test" });
    expect(await db.wishGatherVoice.count({ where: { wishId: { in: [w1.id, w2.id] } } })).toBe(0);
    await t.app.get(FileJobs).cleanupUnconfirmed();
    await jobs.runDue(50, [`${ERASE_WISH_FILE_PREFIX}${mine[0].id}`, `${ERASE_WISH_FILE_PREFIX}${mine[1].id}`]);
    for (const v of mine) {
      expect(await t.storage.head(v.key)).toBeNull();
      expect(await db.storedFile.count({ where: { id: v.id } })).toBe(0);
      expect(await db.voiceNote.count({ where: { id: v.id } })).toBe(0);
    }
    expect(await db.wishGatherVoice.count({ where: { id: theirs.id } })).toBe(1);
    expect(await db.voiceNote.count({ where: { id: theirs.id } })).toBe(1);
    expect(await t.storage.head(theirs.key)).not.toBeNull();
  });

  it("F2. a creator's public reads follow the creator's account: a handle that changes hands never shows another person's styles", async () => {
    const a = await creator("Ada");
    const sa = await style(a.creatorId);
    const wa = await publish(a);
    expect(((await t.http().get(`/v1/creators/${a.handle}/styles`)).body.items as { slug: string }[]).map((s) => s.slug)).toEqual([sa]);
    // A is erased and B takes the handle
    await t.app.get(AccountErasureService).erase(a.accountId, { actor, reason: "test" });
    const b = await creator("Bola");
    await db.account.update({ where: { id: b.accountId }, data: { handle: a.handle } });
    const sb = await style(b.creatorId, "Bola's");
    const styles = await t.http().get(`/v1/creators/${a.handle}/styles`);
    expect(styles.status).toBe(200);
    expect((styles.body.items as { slug: string }[]).map((s) => s.slug)).toEqual([sb]);
    const wishes = await t.http().get(`/v1/creators/${a.handle}/wishes`);
    expect(JSON.stringify(wishes.body)).not.toContain(wa.rowId);
    // C renames the handle: the new handle lists C's styles; the old one is 404 or the new holder's own
    const c = await creator("Cora");
    const sc = await style(c.creatorId, "Cora's");
    const wc = await publish(c);
    const old = c.handle;
    const renamed = uniqueHandle("r");
    await db.account.update({ where: { id: c.accountId }, data: { handle: renamed } });
    expect(((await t.http().get(`/v1/creators/${renamed}/styles`)).body.items as { slug: string }[]).map((s) => s.slug)).toEqual([sc]);
    expect(((await t.http().get(`/v1/creators/${renamed}/wishes`)).body.items as { id: string }[]).map((x) => x.id)).toEqual([wc.rowId]);
    expect((await t.http().get(`/v1/creators/${old}/styles`)).status).toBe(404);
    const d = await creator("Dina");
    await db.account.update({ where: { id: d.accountId }, data: { handle: old } });
    const sd = await style(d.creatorId, "Dina's");
    expect(((await t.http().get(`/v1/creators/${old}/styles`)).body.items as { slug: string }[]).map((s) => s.slug)).toEqual([sd]);
  });

  it("F3. a wish tied to an undelivered Concierge order is never listed by any public read, even with a published row", async () => {
    const owner = await creator("Eve");
    const sl = await style(null, "Conc style");
    const w = await publish(owner);
    await db.wish.update({ where: { id: w.id }, data: { styleSlug: sl } });
    await db.publishedWish.update({ where: { id: w.rowId }, data: { style: sl } });
    const urls = [`/v1/showing?limit=50`, `/v1/showing?style=${sl}`, `/v1/styles/${sl}/wishes`, `/v1/creators/${owner.handle}/wishes`];
    for (const u of urls) expect(JSON.stringify((await t.http().get(u)).body)).toContain(w.rowId);
    const order = t.id();
    await db.conciergeOrder.create({ data: { id: order, accountId: owner.accountId, kind: "single", count: 1, rush: false, brief: "", status: "making" } });
    await db.wish.update({ where: { id: w.id }, data: { conciergeOrderId: order } });
    for (const u of urls) expect([u, JSON.stringify((await t.http().get(u)).body).includes(w.rowId)]).toEqual([u, false]);
    // delivered: the order's wish row names it, and it is listed again
    await db.conciergeOrderWish.create({ data: { orderId: order, wishId: w.id } as never });
    for (const u of urls) expect(JSON.stringify((await t.http().get(u)).body)).toContain(w.rowId);
  });

  describe("F4 (IF4a): a removed wish under an open report", () => {
    async function removedWithReport() {
      const owner = await account(t, ["person"]);
      const w = await liveWish(t, owner);
      const rep = await t.http().post("/v1/reports").set("X-Forwarded-For", uniqueAddress()).send({ slug: w.slug, reason: "abuse" });
      expect(rep.status).toBe(201);
      expect((await t.http().delete(`/v1/wishes/${w.id}`).set(bearer(owner.token)).send({})).status).toBe(200);
      return { owner, w, report: rep.body.id as string };
    }
    const decide = (id: string, decision: string) => t.http().post(`/v1/admin/moderation/${id}/decide`).set(bearer(mod.token)).send({ decision, reason: "checked" });
    const erased = async (id: string) => (await db.wish.findUniqueOrThrow({ where: { id } })).erasedAt !== null;

    it("4a. the day passes with the report open: not erased; dismissed afterwards: erased at once", async () => {
      const x = await removedWithReport();
      t.clock.advance(31 * DAY);
      expect(await jobs.runDue(5, [x.w.id])).toBe(1);
      expect(await erased(x.w.id)).toBe(false);
      expect((await decide(x.report, "keep")).status).toBe(200);
      expect(await erased(x.w.id)).toBe(true);
    });

    it("4b. dismissed before the day: nothing erased then, the job erases it at the day", async () => {
      const x = await removedWithReport();
      expect((await decide(x.report, "keep")).status).toBe(200);
      expect(await erased(x.w.id)).toBe(false);
      t.clock.advance(31 * DAY);
      expect(await jobs.runDue(5, [x.w.id])).toBe(1);
      expect(await erased(x.w.id)).toBe(true);
    });

    it("4c. upheld: it stays the staff's take-down: not erased at the day, and the owner cannot bring it back", async () => {
      const x = await removedWithReport();
      expect((await decide(x.report, "take_down")).status).toBe(200);
      t.clock.advance(31 * DAY);
      await jobs.runDue(5, [x.w.id]);
      expect(await erased(x.w.id)).toBe(false);
      expect((await t.http().post(`/v1/wishes/${x.w.id}/restore`).set(bearer(x.owner.token)).send({})).status).toBe(403);
    });
  });
});
