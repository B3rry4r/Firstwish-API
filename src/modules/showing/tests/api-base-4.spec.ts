import { PrismaService } from "../../../common/db/prisma.service";
import { account, B12App, b13App, bearer, liveWish, staffOf } from "./b13-kit";

/** API-BASE-4: HP9 (the viewer's own mark on each row) and HP13 (a published row carries the creator's handle and the cover). */
describe("API-BASE-4 Now showing (HP9, HP13) through the real routes", () => {
  let t: B12App;
  let db: PrismaService;
  let mod: { id: string; token: string };
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
    mod = await staffOf(t, "moderator");
  });
  afterAll(() => t.close());

  const run = String(process.pid);
  type Row = { id: string; wish: string; creator: { handle?: string; name: string } | null; img: string; pos: string; mine: { reaction?: string | null; saved?: boolean } };
  async function publish(sides: ("person" | "creator")[], handle: string | null, withCover: boolean) {
    const owner = await account(t, sides);
    if (handle) await db.account.update({ where: { id: owner.accountId }, data: { handle, name: "Ada Maker" } });
    const w = await liveWish(t, owner);
    let fileId: string | null = null;
    if (withCover) {
      fileId = t.id();
      t.storage.put(`files/${fileId}`, Buffer.from("COVERPIXELS"), "image/png");
      await db.storedFile.create({ data: { id: fileId, ownerAccountId: owner.accountId, purpose: "wish_photo", objectKey: `files/${fileId}`, contentType: "image/png", bytes: BigInt(11), status: "ready", variants: [], driver: "r2" } });
      await db.uploadTicket.create({ data: { id: fileId, bytes: BigInt(11), contentType: "image/png", purpose: "wish-photo" } });
      await db.wish.update({ where: { id: w.id }, data: { content: { cover: { photoId: fileId } } } });
      await db.wishFile.create({ data: { id: t.id(), wishId: w.id, fileId, role: "photo" } });
    }
    expect((await t.http().post(`/v1/wishes/${w.id}/publish-requests`).set(bearer(owner.token)).send({ consent: true })).status).toBe(201);
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id, status: "waiting" } });
    expect((await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(mod.token)).send({ decision: "approve", reason: "Looks lovely" })).status).toBe(200);
    const row = await db.publishedWish.findFirstOrThrow({ where: { wishId: w.id } });
    return { owner, w, row, fileId };
  }
  const rowOf = async (id: string, token?: string): Promise<Row> => {
    const req = t.http().get("/v1/showing?limit=50");
    const r = token ? await req.set(bearer(token)) : await req;
    expect(r.status).toBe(200);
    return (r.body.items as Row[]).find((i) => i.id === id) as Row;
  };

  it("HP13: a published wish carries the creator's handle and the cover picture as a short-lived signed read; a publisher who no longer has the creator side holds {name} only (only a creator can publish, so this is the one way a row has none); a row published before reads the same", async () => {
    const a = await publish(["creator"], `ada${run}`, true);
    const row = await rowOf(a.row.id);
    expect(row.creator).toEqual({ handle: `ada${run}`, name: "Ada Maker" });
    expect(row.img).toContain(`files/${a.fileId}`);
    expect(row.pos).toBe("50% 50%");
    const bytes = await t.http().get(`/v1/standin-storage${new URL(row.img).pathname}${new URL(row.img).search}`);
    expect(bytes.status).toBe(200);
    const b = await publish(["creator"], `gone${run}`, false);
    await db.account.update({ where: { id: b.owner.accountId }, data: { sides: ["person"] as never, lastSide: "person" } }); // the creator side was turned off after publishing
    const plain = await rowOf(b.row.id);
    expect(plain.creator).toEqual({ name: plain.creator?.name });
    expect(plain.creator).not.toHaveProperty("handle");
    expect(plain.img).toBe("");
    // a row written before this change (stored creator {name}, img "") is filled in on read, no backfill needed
    await db.publishedWish.update({ where: { id: a.row.id }, data: { creator: { name: "Ada Maker" }, img: "", pos: "" } });
    expect((await rowOf(a.row.id)).creator).toEqual({ handle: `ada${run}`, name: "Ada Maker" });
    // a cover still in screening is not shown
    await db.storedFile.update({ where: { id: a.fileId as string }, data: { status: "screening" } });
    expect((await rowOf(a.row.id)).img).toBe("");
  });

  it("HP9: a signed-in viewer's row carries {reaction, saved} that survive a reload; another viewer and a visitor see none of it", async () => {
    const a = await publish(["creator"], null, false);
    const me = await account(t, ["person"]);
    const other = await account(t, ["person"]);
    expect((await rowOf(a.row.id, me.token)).mine).toEqual({ reaction: null, saved: false });
    expect((await t.http().put(`/v1/feed/wishes/${a.row.id}/reaction`).set(bearer(me.token)).send({ wish: a.row.id, reaction: "joy" })).status).toBe(200);
    expect((await t.http().put(`/v1/feed/wishes/${a.row.id}/save`).set(bearer(me.token)).send({ wish: a.row.id })).status).toBe(200);
    expect((await rowOf(a.row.id, me.token)).mine).toEqual({ reaction: "joy", saved: true });
    expect((await rowOf(a.row.id, me.token)).mine).toEqual({ reaction: "joy", saved: true });
    expect((await rowOf(a.row.id, other.token)).mine).toEqual({ reaction: null, saved: false });
    expect((await rowOf(a.row.id)).mine).toEqual({});
    expect((await rowOf(a.row.id, "not-a-token")).mine).toEqual({});
    expect((await t.http().delete(`/v1/feed/wishes/${a.row.id}/reaction`).set(bearer(me.token)).send({ wish: a.row.id })).status).toBe(200);
    expect((await t.http().delete(`/v1/feed/wishes/${a.row.id}/save`).set(bearer(me.token)).send({ wish: a.row.id })).status).toBe(200);
    expect((await rowOf(a.row.id, me.token)).mine).toEqual({ reaction: null, saved: false });
  });
});
