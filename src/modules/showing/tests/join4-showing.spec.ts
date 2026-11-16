import { PrismaService } from "../../../common/db/prisma.service";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { account, B12App, b13App, bearer, liveWish, NOW, staffOf } from "./b13-kit";

describe("Wave 4 join: Now showing with the wish lifecycle (J2, J3)", () => {
  let t: B12App;
  let db: PrismaService;
  let mod: { id: string; token: string };
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
    mod = await staffOf(t, "moderator");
  });
  afterAll(() => t.close());

  const ask = (token: string, id: string) => t.http().post(`/v1/wishes/${id}/publish-requests`).set(bearer(token)).send({ consent: true });
  async function listed() {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    expect((await ask(owner.token, w.id)).status).toBe(201);
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id, status: "waiting" } });
    expect((await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(mod.token)).send({ decision: "approve", reason: "Looks lovely" })).status).toBe(200);
    return { owner, w };
  }
  const publicHas = async (wishId: string) => {
    let cursor: string | null = null;
    do {
      const r = await t.http().get(`/v1/showing?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
      if ((r.body.items as { wish: string }[]).some((i) => i.wish === wishId)) return true;
      cursor = r.body.nextCursor as string | null;
    } while (cursor);
    return false;
  };
  const rowsOf = async (wishId: string) => (await db.publishedWish.count({ where: { wishId } })) + (await db.publishRequest.count({ where: { wishId } }));

  it("J2: the owner's wish detail carries publish (none, waiting, listed, declined) and no one else reads it", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    const none = await t.http().get(`/v1/wishes/${w.id}`).set(bearer(owner.token));
    expect(none.status).toBe(200);
    expect(none.body.publish).toBeNull();
    await ask(owner.token, w.id);
    expect((await t.http().get(`/v1/wishes/${w.id}`).set(bearer(owner.token))).body.publish).toMatchObject({ status: "waiting", listed: false });
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id } });
    await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(mod.token)).send({ decision: "approve", reason: "Looks lovely" });
    expect((await t.http().get(`/v1/wishes/${w.id}`).set(bearer(owner.token))).body.publish).toMatchObject({ status: "approved", listed: true });
    const other = await account(t, ["creator"]);
    expect((await t.http().get(`/v1/wishes/${w.id}`).set(bearer(other.token))).status).toBe(404);
    const o2 = await account(t, ["creator"]);
    const w2 = await liveWish(t, o2);
    await ask(o2.token, w2.id);
    const r2 = await db.publishRequest.findFirstOrThrow({ where: { wishId: w2.id } });
    await t.http().post(`/v1/admin/showing/requests/${r2.id}/decide`).set(bearer(mod.token)).send({ decision: "decline", reason: "Not this time" });
    expect((await t.http().get(`/v1/wishes/${w2.id}`).set(bearer(o2.token))).body.publish).toMatchObject({ status: "refused", reason: "Not this time", listed: false });
  });

  it("J3: a wish that rests, is taken down, is removed or is erased leaves no row in the showing tables and is not in the public list", async () => {
    const lifecycle = t.app.get(WishLifecycleService);
    const rest = await listed();
    const down = await listed();
    const removed = await listed();
    const erased = await listed();
    const owners = await listed();
    for (const x of [rest, down, removed, erased, owners]) {
      expect(await rowsOf(x.w.id)).toBe(2);
      expect(await publicHas(x.w.id)).toBe(true);
    }
    await db.$transaction(async (tx) => lifecycle.move(tx, await lifecycle.lock(tx, rest.w.id), "resting", { cause: "test.rest" }));
    await lifecycle.takeDown(down.w.id, "test");
    expect((await t.http().delete(`/v1/wishes/${removed.w.id}`).set(bearer(removed.owner.token))).status).toBe(200);
    const er = await t.http().post(`/v1/wishes/${erased.w.id}/erase`).set(bearer(erased.owner.token));
    expect(er.status).toBe(204);
    await t.app.get(AccountErasureService).erase(owners.owner.accountId, { actor: { type: "system", id: null, requestId: "join4" }, reason: "test" });
    for (const x of [rest, down, removed, erased, owners]) {
      expect(await rowsOf(x.w.id)).toBe(0);
      expect(await publicHas(x.w.id)).toBe(false);
    }
  });

  // Restoring a resting wish schedules its rest-wish job at now + the restore window. Specs share one job table: this test runs on a
  // clock no other spec reaches, so that job can never be due under another spec's clock (every other runDue names its own keys).
  it("J3: a resting wish that comes back is live and not listed; it needs a new ask and a new approval", async () => {
    t.clock.set(new Date("2300-01-01T09:00:00.000Z"));
    try {
      await comesBack();
    } finally {
      t.clock.set(NOW);
    }
  });

  async function comesBack() {
    const x = await listed();
    const lifecycle = t.app.get(WishLifecycleService);
    await db.$transaction(async (tx) => lifecycle.move(tx, await lifecycle.lock(tx, x.w.id), "resting", { cause: "test.rest", data: { restingSince: t.clock.now() } }));
    expect((await t.http().post(`/v1/wishes/${x.w.id}/restore`).set(bearer(x.owner.token))).status).toBe(200);
    expect((await t.http().get(`/v1/wishes/${x.w.id}`).set(bearer(x.owner.token))).body.publish).toBeNull();
    expect(await publicHas(x.w.id)).toBe(false);
    const again = await ask(x.owner.token, x.w.id);
    expect(again.status).toBe(201);
    expect(again.body.publish).toMatchObject({ status: "waiting", listed: false });
    expect(await publicHas(x.w.id)).toBe(false);
  }
});
