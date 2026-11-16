import { PrismaService } from "../../../common/db/prisma.service";
import { StoragePort } from "../../../common/ports/storage.port";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, ids, JPEG, makeAccount, PNG, ScoredScreening } from "./files-kit";

/** HQ3: the stand-in storage takes the signed put (only with PROVIDERS=standin) and the upload runs end to end through the real routes. */
describe("API-BASE-5 case 1: the stand-in storage receives the signed put", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  let me: { id: string; token: string };
  const auth = { authorization: "" };

  beforeAll(async () => {
    ({ t, db, scored } = await filesApp());
    me = await makeAccount(db, t);
    auth.authorization = `Bearer ${me.token}`;
  });
  afterAll(() => t.close());

  const ticket = async (bytes: number, contentType = "image/jpeg") => {
    const r = await t.http().post("/v1/uploads").set(auth).send({ purpose: "photo", contentType, bytes });
    expect(r.status).toBe(201);
    const u = new URL(r.body.upload.url as string);
    return { id: r.body.id as string, path: `/v1/standin-storage${u.pathname}`, qs: u.search };
  };
  const put = (path: string, body: Buffer, type = "image/jpeg") => t.http().put(path).set("content-type", type).send(body);
  const confirm = (id: string) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth).send({ fileId: id });

  it("takes the signed put, confirm checks the stored object and screens it, and the signed read gives back the bytes put", async () => {
    const bytes = JPEG(3000);
    const tk = await ticket(3000);
    expect((await put(tk.path + tk.qs, bytes)).status).toBe(200);
    const before = scored.screened.length;
    const c = await confirm(tk.id);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ status: "ready", kind: "image" });
    expect(scored.screened.length).toBe(before + 1);
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: tk.id } });
    expect(Number(row.bytes)).toBe(3000);
    const read = new URL(await t.app.get(StoragePort).signDownload(row.objectKey, 60));
    const got = await t.http().get(`/v1/standin-storage${read.pathname}${read.search}`);
    expect(got.status).toBe(200);
    expect(Buffer.compare(Buffer.from(got.body as Buffer), bytes)).toBe(0);
  });

  it("refuses a put with a bad signature, a borrowed one, another kind, another size or an expired one, and stores nothing", async () => {
    const a = await ticket(2000);
    const b = await ticket(2000);
    const sig = (qs: string) => new URLSearchParams(qs).get("signature") as string;
    expect((await put(`${a.path}?expires=${new URLSearchParams(a.qs).get("expires")}&signature=0000`, JPEG(2000))).status).toBe(403);
    // b's signature on a's key
    expect((await put(`${a.path}?expires=${new URLSearchParams(a.qs).get("expires")}&signature=${sig(b.qs)}`, JPEG(2000))).status).toBe(403);
    const kind = await put(a.path + a.qs, PNG(2000), "image/png");
    expect(kind.status).toBe(403);
    expect(kind.body.error.message).toMatch(/kind/);
    const over = await put(a.path + a.qs, JPEG(2001));
    expect(over.status).toBe(403);
    expect(over.body.error.message).toMatch(/size/);
    expect((await put(a.path + a.qs, JPEG(1999))).status).toBe(403);
    const none = await confirm(a.id); // nothing was stored
    expect(none.status).toBe(422);
    expect(none.body.error.message).toMatch(/never uploaded/);
    const now = t.clock.now();
    t.clock.set(new Date(now.getTime() + 16 * 60 * 1000));
    expect((await put(b.path + b.qs, JPEG(2000))).status).toBe(403);
    t.clock.set(now);
    expect((await put("/v1/standin-storage/other-bucket/x?expires=1&signature=0", JPEG(5))).status).toBe(404);
  });

  it("confirm refuses a stored object whose bytes are not the kind asked for", async () => {
    const tk = await ticket(2000);
    expect((await put(tk.path + tk.qs, Buffer.alloc(2000, 7))).status).toBe(200); // the right type and size, the wrong bytes
    const c = await confirm(tk.id);
    expect(c.status).toBe(422);
    expect(c.body.error.message).toMatch(/not of the type asked/);
  });

  it("the id of a put is only for the account that asked: another person's confirm answers 404", async () => {
    const tk = await ticket(1500);
    expect((await put(tk.path + tk.qs, JPEG(1500))).status).toBe(200);
    const other = await makeAccount(db, t);
    expect((await t.http().post(`/v1/uploads/${tk.id}/confirm`).set({ authorization: `Bearer ${other.token}` }).send({ fileId: tk.id })).status).toBe(404);
    expect(ids).toBeDefined();
  });
});
