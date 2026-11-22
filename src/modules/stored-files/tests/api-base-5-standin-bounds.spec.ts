import { request as httpRequest } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaService } from "../../../common/db/prisma.service";
import { StandinStorage } from "../../../common/ports/adapters/standins";
import { StoragePort } from "../../../common/ports/storage.port";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, JPEG, makeAccount } from "./files-kit";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";

// the book's limits are shared by every spec in the run's database: hold the setting lock for the file
holdSettingLockForFile();

/** API-BASE-5 patch (M2, L1): the stand-in storage (test stacks only) is bounded, cuts a too-big put off early, and keeps the first put. */
describe("API-BASE-5 patch: the stand-in storage is bounded", () => {
  let t: TestApp;
  let db: PrismaService;
  let me: { id: string; token: string };
  let store: StandinStorage;
  const auth = { authorization: "" };

  beforeAll(async () => {
    ({ t, db } = await filesApp());
    me = await makeAccount(db, t);
    auth.authorization = `Bearer ${me.token}`;
    store = t.app.get<StandinStorage>(StoragePort);
  });
  afterAll(() => t.close());

  const ticket = async (bytes: number, contentType = "image/jpeg") => {
    const r = await t.http().post("/v1/uploads").set(auth).send({ purpose: "photo", contentType, bytes });
    expect(r.status).toBe(201);
    const u = new URL(r.body.upload.url as string);
    return { id: r.body.id as string, path: `/v1/standin-storage${u.pathname}`, qs: u.search, key: decodeURI(u.pathname.replace(/^\/[^/]+\//, "")) };
  };
  const put = (path: string, body: Buffer, type = "image/jpeg") => t.http().put(path).set("content-type", type).send(body);
  const confirm = (id: string) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth).send({ fileId: id });

  it("M2: a total-bytes cap drops the oldest objects first, and a signed read of a dropped one says it is gone (410), not missing", async () => {
    expect(store.maxBytes).toBe(256 * 1024 * 1024);
    const small = new StandinStorage(t.clock, "standin-bucket", undefined, 100);
    small.put("a", Buffer.alloc(40), "x/y");
    small.put("b", Buffer.alloc(40), "x/y");
    small.put("a", Buffer.alloc(40), "x/y"); // a is the newest now
    small.put("c", Buffer.alloc(40), "x/y"); // 120 > 100: the oldest, b, goes
    expect(await small.head("b")).toBeNull();
    expect(small.wasDropped("b")).toBe(true);
    expect(await small.head("a")).toMatchObject({ size: 40 });
    expect(await small.head("c")).toMatchObject({ size: 40 });
    await small.delete("a");
    small.put("d", Buffer.alloc(60), "x/y"); // 100 fits: nothing more is dropped
    expect(small.wasDropped("c")).toBe(false);
    small.put("big", Buffer.alloc(150), "x/y"); // one object over the cap alone: kept, and everything older goes
    expect(await small.head("big")).toMatchObject({ size: 150 });
    expect(small.wasDropped("c") && small.wasDropped("d")).toBe(true);
    // through the route: the read of a dropped object
    const tk = await ticket(2000);
    expect((await put(tk.path + tk.qs, JPEG(2000))).status).toBe(200);
    const row = new URL(await store.signDownload(tk.key, 60));
    expect((await t.http().get(`/v1/standin-storage${row.pathname}${row.search}`)).status).toBe(200);
    const mem = store as unknown as { remove(k: string): void; dropped: Set<string> };
    mem.remove(tk.key);
    mem.dropped.add(tk.key); // as the cap would have
    const gone = await t.http().get(`/v1/standin-storage${row.pathname}${row.search}`);
    expect(gone.status).toBe(410);
    expect(gone.body.error.message).toMatch(/dropped/);
    expect((await t.http().get(`/v1/standin-storage${row.pathname}?expires=1&signature=0`)).status).toBe(404); // a bad signature learns nothing
  });

  it("M2: a put whose body passes the ticket's size is cut off as soon as it does (refused at once, not read to the end)", async () => {
    const tk = await ticket(1000);
    const server = t.app.getHttpServer() as Server;
    await new Promise<void>((ok) => server.listen(5200, "127.0.0.1", ok));
    try {
      const total = 64 * 1024 * 1024;
      const chunk = Buffer.alloc(64 * 1024, 1);
      const out = await new Promise<{ status: number; written: number }>((done, fail) => {
        let written = 0;
        let status = 0;
        const req = httpRequest({ host: "127.0.0.1", port: (server.address() as AddressInfo).port, method: "PUT", path: tk.path + tk.qs, headers: { "content-type": "image/jpeg", "content-length": String(total) } }, (res) => {
          status = res.statusCode ?? 0;
          res.resume();
          res.on("end", () => done({ status, written }));
        });
        req.on("error", () => (status ? done({ status, written }) : fail(new Error("no answer"))));
        const send = (): void => {
          while (written < total) {
            written += chunk.length;
            if (!req.write(chunk)) return void req.once("drain", send);
          }
          req.end();
        };
        send();
      });
      expect(out.status).toBe(403);
      expect(out.written).toBeLessThan(total / 2);
    } finally {
      await new Promise<void>((ok) => server.close(() => ok()));
    }
    expect((await confirm(tk.id)).status).toBe(422); // nothing was stored
  });

  it("L1: a second put to a ticket is refused once the first landed, and always after confirm; the bytes kept are the first ones", async () => {
    const first = JPEG(3000);
    const tk = await ticket(3000);
    expect((await put(tk.path + tk.qs, first)).status).toBe(200);
    const again = await put(tk.path + tk.qs, JPEG(3000));
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already has its file/);
    expect((await confirm(tk.id)).status).toBe(200);
    expect((await put(tk.path + tk.qs, JPEG(3000))).status).toBe(409); // after confirm
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: tk.id } });
    const read = new URL(await store.signDownload(row.objectKey, 60));
    const got = await t.http().get(`/v1/standin-storage${read.pathname}${read.search}`);
    expect(Buffer.compare(Buffer.from(got.body as Buffer), first)).toBe(0);
    // a refused put (wrong size) does not use up the ticket
    const tk2 = await ticket(2000);
    expect((await put(tk2.path + tk2.qs, JPEG(1999))).status).toBe(403);
    expect((await put(tk2.path + tk2.qs, JPEG(2000))).status).toBe(200);
  });
});
