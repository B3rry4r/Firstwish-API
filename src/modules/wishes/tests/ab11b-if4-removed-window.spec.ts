import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { testSlug, testWishNo } from "../../../../test/kit/unique";
import { JobsService } from "../../jobs/jobs.service";
import { ERASE_WISH_FILE_PREFIX } from "../wish-lifecycle.service";
import { filesApp, ids, makeAccount, PNG, WEBM } from "../../stored-files/tests/files-kit";

const DAY = 86_400_000;
const NOW = new Date("2027-03-01T09:00:00.000Z");

/** API-BASE-11B case 1 (IF4): a wish its owner removes can be brought back until a day, then the erase job erases it with its files. */
describe("IF4 a removed wish: the day it can be brought back until, then the erase job", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  // The jobs table and the stand-in storage are read as a whole by some checks; the spec has a database of its own.
  const own = ownDatabase("if4");
  beforeAll(async () => {
    own.use();
    ({ t, db } = await filesApp());
    jobs = t.app.get(JobsService);
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });
  beforeEach(() => t.clock.set(NOW));

  async function liveWish(over: Record<string, unknown> = {}) {
    const me = await makeAccount(db, t);
    const id = ids.next();
    const slug = testSlug("if4");
    await db.wish.create({
      data: {
        id, accountId: me.id, status: "live", ticket: "keepsake", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", name: "Chidi Eze",
        content: { letter: { paras: ["private words"] } }, no: testWishNo(), sealedAt: new Date(NOW.getTime() - 3 * DAY), opensAt: new Date(NOW.getTime() - 2 * DAY),
        openedAt: new Date(NOW.getTime() - 2 * DAY), endsAt: new Date(NOW.getTime() + 10 * DAY), ...over,
      } as never,
    });
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    return { me, id, slug, auth: { authorization: `Bearer ${me.token}` } };
  }
  async function photo(accountId: string, wishId: string) {
    const id = ids.next();
    const objectKey = `files/${id}`;
    t.storage.put(objectKey, PNG(100), "image/png");
    await db.storedFile.create({ data: { id, ownerAccountId: accountId, purpose: "wish_photo", objectKey, contentType: "image/png", bytes: BigInt(100), status: "ready", driver: "r2", variants: [] } as never });
    await db.uploadTicket.create({ data: { id, bytes: BigInt(100), contentType: "image/png", purpose: "wish-photo" } });
    await db.wishFile.create({ data: { id: ids.next(), wishId, fileId: id, role: "photo" } as never });
    return { id, key: objectKey };
  }
  const remove = (w: { id: string; auth: Record<string, string> }) => t.http().delete(`/v1/wishes/${w.id}`).set(w.auth).send({});
  const restore = (w: { id: string; auth: Record<string, string> }) => t.http().post(`/v1/wishes/${w.id}/restore`).set(w.auth).send({});
  const windowJob = (id: string) => jobs.runDue(5, [id]);

  it("1a. a removed wish carries the day it can be brought back until (the price book's days); bringing it back before then works as before and clears it", async () => {
    const w = await liveWish();
    const days = (await db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } }))?.RESTORE_DAYS ?? 30;
    const gone = await remove(w);
    expect(gone.status).toBe(200);
    expect(gone.body.state).toBe("taken_down");
    expect(gone.body.restorableUntil).toBe(new Date(NOW.getTime() + days * DAY).toISOString());
    expect((await t.http().get(`/v1/w/${w.slug}`)).status).toBe(410);
    t.clock.set(new Date(NOW.getTime() + (days - 1) * DAY));
    const back = await restore(w);
    expect(back.status).toBe(200);
    expect(back.body.state).toBe("live");
    expect(back.body.restorableUntil).toBeNull();
    expect((await t.http().get(`/v1/w/${w.slug}`)).status).toBe(200);
    expect(await db.job.findFirst({ where: { type: "restore_window_end", subjectId: w.id, status: "scheduled" } })).toBeNull();
    // it can be removed again: a new day is carried
    t.clock.set(new Date(NOW.getTime() + 5 * DAY));
    expect((await remove(w)).body.restorableUntil).toBe(new Date(NOW.getTime() + (5 + days) * DAY).toISOString());
  });

  it("1b. after the day the wish cannot be brought back, and the erase job erases it and its files (rows and stored objects); the link answers as an ended wish does", async () => {
    const w = await liveWish();
    const files = [await photo(w.me.id, w.id), await photo(w.me.id, w.id)];
    // two friends' voices given through the gather link while the wish was a draft: a name row, a voice note and a ready file each
    const voices: string[] = [];
    for (const n of ["Kemi", "Tobi"]) {
      const id = ids.next();
      const objectKey = `files/${id}`;
      t.storage.put(objectKey, WEBM(4000), "audio/webm");
      await db.storedFile.create({ data: { id, ownerAccountId: w.me.id, purpose: "voice_note", objectKey, contentType: "audio/webm", bytes: BigInt(4000), status: "ready", driver: "r2", variants: [] } as never });
      await db.voiceNote.create({ data: { id, wishId: w.id, seconds: 12 } });
      await db.wishGatherVoice.create({ data: { id, wishId: w.id, fromName: n } });
      voices.push(id);
    }
    const days = (await db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } }))?.RESTORE_DAYS ?? 30;
    expect((await remove(w)).status).toBe(200);
    // the day has not passed: the job finds nothing due
    t.clock.set(new Date(NOW.getTime() + (days - 1) * DAY));
    expect(await windowJob(w.id)).toBe(0);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).erasedAt).toBeNull();
    // the day has passed
    t.clock.set(new Date(NOW.getTime() + days * DAY + 60_000));
    const late = await restore(w);
    expect(late.status).toBe(409);
    expect(await windowJob(w.id)).toBe(1);
    const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    expect(row.erasedAt).not.toBeNull();
    expect(row.content).toBeNull();
    expect(row.name).toBeNull();
    expect(row.restorableUntil).toBeNull();
    expect(row.no).not.toBeNull(); // the number stays (a record), as for any erase
    // the files: rows at once, objects by the cleanup jobs the erase wrote
    expect(await db.wishFile.count({ where: { wishId: w.id } })).toBe(0);
    expect(await db.wishGatherVoice.count({ where: { wishId: w.id } })).toBe(0);
    const keys = [...files, ...voices.map((id) => ({ id, key: `files/${id}` }))];
    expect(await jobs.runDue(20, keys.map((f) => `${ERASE_WISH_FILE_PREFIX}${f.id}`))).toBe(keys.length);
    for (const f of keys) {
      expect(await t.storage.head(f.key)).toBeNull();
      expect(await db.storedFile.count({ where: { id: f.id } })).toBe(0);
    }
    expect(await db.voiceNote.count({ where: { wishId: w.id } })).toBe(0);
    // the link answers as an ended wish does: 410, and the owner reads a wish that is erased
    // (an erase takes the receiver's name off the front of the slug, so the link is read as the row now holds it)
    const link = await db.wishLink.findFirstOrThrow({ where: { wishId: w.id } });
    expect(link.active).toBe(false);
    expect((await t.http().get(`/v1/w/${link.slug}`)).status).toBe(410);
    expect((await restore(w)).status).toBe(409);
    expect(await windowJob(w.id)).toBe(0); // a second run finds nothing
  });

  it("1c. what a removed wish that held a paid ticket and a keep leaves: the payments and the ticket stay as records; the payer's email on a link holder's keep goes", async () => {
    const w = await liveWish();
    const book = (await db.price.findFirst({ orderBy: { version: "desc" } }))?.version ?? 1;
    const pay = (purpose: "ticket" | "keep", accountId: string | null, payerContact: string | null) =>
      db.payment.create({
        data: {
          id: ids.next(), accountId, payerContact, purpose, subjectId: w.id, lines: [{ sku: purpose === "ticket" ? "ticket.keepsake" : "keep.month", qty: 1, unitKobo: 100000, totalKobo: 100000 }], amountKobo: 100000n,
          currency: "NGN", priceBookVersion: book, status: "succeeded", provider: "paystack", providerReference: `fw-${ids.next()}`, idempotencyKey: `if4-${ids.next()}`, fulfilledAt: NOW,
        } as never,
      });
    const ticket = await pay("ticket", w.me.id, null);
    const keep = await pay("keep", null, "friend@example.com");
    expect((await remove(w)).status).toBe(200);
    t.clock.set(new Date(NOW.getTime() + 31 * DAY));
    expect(await windowJob(w.id)).toBe(1);
    const after = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    expect(after.ticket).toBe("keepsake"); // the kind of ticket is a record
    expect((await db.payment.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("succeeded");
    const k = await db.payment.findUniqueOrThrow({ where: { id: keep.id } });
    expect(k.status).toBe("succeeded"); // nothing is refunded by an erase
    expect(k.payerContact).toBeNull(); // a person's email on a payment with no account goes with the wish
  });

  it("1d. a wish removed before this change has its window start at the migration: the migration gives it the day and a job", async () => {
    const w = await liveWish();
    expect((await remove(w)).status).toBe(200);
    // make it look like a wish removed before: no day, no job
    await db.wish.update({ where: { id: w.id }, data: { restorableUntil: null } });
    await db.job.deleteMany({ where: { subjectId: w.id } });
    const sql = readFileSync(join(__dirname, "../../../../prisma/migrations/20261203090000_removed_wish_window_ab11b/migration.sql"), "utf8");
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean)) await db.$executeRawUnsafe(stmt);
    const days = (await db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } }))?.RESTORE_DAYS ?? 30;
    const migrated = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    // the clock of the migration is the database's own now(); it is within a minute of the real time, days ahead
    const ahead = migrated.restorableUntil!.getTime() - Date.now();
    expect(Math.abs(ahead - days * DAY)).toBeLessThan(120_000);
    const job = await db.job.findFirst({ where: { subjectId: w.id, type: "restore_window_end" } });
    expect(job?.status).toBe("scheduled");
    expect(job?.runAt.getTime()).toBe(migrated.restorableUntil!.getTime());
    // a wish that was not removed by its owner, or is erased, is left alone by the migration
    const other = await liveWish();
    await db.wish.update({ where: { id: other.id }, data: { status: "removed", removedAt: NOW } });
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean)) await db.$executeRawUnsafe(stmt);
    expect((await db.wish.findUniqueOrThrow({ where: { id: other.id } })).restorableUntil).toBeNull();
  });

  it("1e. a wish staff took down is not erased by the window job", async () => {
    const w = await liveWish();
    await db.wishTransition.create({ data: { id: ids.next(), wishId: w.id, from: "live", to: "taken_down", cause: "staff-take-down" } });
    await db.wish.update({ where: { id: w.id }, data: { status: "removed", removedAt: NOW } });
    await jobs.schedule("restore-window-end", new Date(NOW.getTime() - 1000), w.id);
    expect(await windowJob(w.id)).toBe(1); // the job ran and left it alone
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).erasedAt).toBeNull();
  });
});
