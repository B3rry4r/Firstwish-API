import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { SavedWishesService } from "../../saved-wishes/saved-wishes.service";
import { FileJobs } from "../file-jobs";
import { filesApp, ids, makeAccount, makeBusiness, makeWish, PNG } from "./files-kit";

describe("X10 and BB6: erasing an account removes its files and its wishes' saves", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    ({ t, db } = await filesApp());
  });
  afterAll(() => t.close());
  const actor = { type: "staff" as const, id: null, requestId: "test-join2" };

  /** A confirmed (ready) file with an object and one image size, both in the stand-in storage. */
  async function file(accountId: string, businessId?: string): Promise<{ id: string; keys: string[] }> {
    const id = ids.next();
    const objectKey = `files/${id}`;
    const sized = `${objectKey}.w320`;
    t.storage.put(objectKey, PNG(100), "image/png");
    t.storage.put(sized, PNG(50), "image/png");
    await db.storedFile.create({
      data: { cleanAt: new Date(),
        id, ownerAccountId: accountId, businessId: businessId ?? null, purpose: "wish_photo", objectKey, contentType: "image/png", bytes: BigInt(100),
        status: "ready", variants: [{ width: 320, key: sized }], driver: "r2",
      },
    });
    await db.uploadTicket.create({ data: { id, bytes: BigInt(100), contentType: "image/png", purpose: "wish-photo" } });
    return { id, keys: [objectKey, sized] };
  }

  it("J1: after the handler runs, no row and no object of the erased account is left; another account's files stay; a second run is quiet", async () => {
    const me = await makeAccount(db, t, ["person", "business"]);
    const biz = await makeBusiness(db, me.id);
    const other = await makeAccount(db, t);
    const wishId = await makeWish(db, me.id);
    const mine = [await file(me.id), await file(me.id), await file(me.id, biz)];
    const theirs = await file(other.id);
    await db.wishFile.create({ data: { id: ids.next(), wishId, fileId: mine[0].id, role: "photo" } as never });

    await t.app.get(AccountErasureService).erase(me.id, { actor, reason: "test" });
    // The erase only wrote a job row: nothing was removed from storage inside its transaction.
    expect(await db.job.count({ where: { type: "upload_cleanup", subjectId: `erase-files:${me.id}`, status: "scheduled" } })).toBe(1);
    expect(await db.storedFile.count({ where: { id: { in: mine.map((m) => m.id) } } })).toBe(3);
    expect(await t.storage.head(mine[0].keys[0])).not.toBeNull();

    const jobs = t.app.get(FileJobs);
    await jobs.cleanupUnconfirmed();
    expect(await db.storedFile.count({ where: { id: { in: mine.map((m) => m.id) } } })).toBe(0);
    expect(await db.uploadTicket.count({ where: { id: { in: mine.map((m) => m.id) } } })).toBe(0);
    expect(await db.wishFile.count({ where: { wishId } })).toBe(0);
    for (const k of mine.flatMap((m) => m.keys)) expect(await t.storage.head(k)).toBeNull();
    expect(await db.job.count({ where: { subjectId: `erase-files:${me.id}`, status: "succeeded" } })).toBe(1);

    expect(await db.storedFile.count({ where: { id: theirs.id } })).toBe(1);
    for (const k of theirs.keys) expect(await t.storage.head(k)).not.toBeNull();

    await jobs.removeAccountFiles(me.id);
    await expect(jobs.cleanupUnconfirmed()).resolves.toMatchObject({ removed: 0 });
    await expect(jobs.cleanupUnconfirmed()).resolves.toBeDefined();
    expect(await db.storedFile.count({ where: { id: theirs.id } })).toBe(1);
  });

  it("J2: other people's saves of the erased account's wishes are gone, and so are the erased account's own saves", async () => {
    const me = await makeAccount(db, t);
    const fan = await makeAccount(db, t);
    const wishId = await makeWish(db, me.id);
    const otherWish = await makeWish(db, fan.id);
    const feedId = ids.next();
    await db.publishedWish.create({ data: { id: feedId, wish: wishId } });
    const save = (accountId: string, wish: string) => db.savedWish.create({ data: { id: ids.next(), accountId, wish } });
    await save(fan.id, wishId);
    await save(fan.id, feedId);
    await save(fan.id, otherWish);
    await save(me.id, otherWish);

    await t.app.get(AccountErasureService).erase(me.id, { actor, reason: "test" });
    expect(await db.savedWish.count({ where: { accountId: fan.id, wish: { in: [wishId, feedId] } } })).toBe(0);
    expect(await db.savedWish.count({ where: { accountId: me.id } })).toBe(0);
    expect(await db.savedWish.count({ where: { accountId: fan.id, wish: otherWish } })).toBe(1);
    expect(t.app.get(SavedWishesService)).toBeDefined();
  });
});
