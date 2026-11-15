import { PrismaService } from "../../../common/db/prisma.service";
import { R2_HOST_SUFFIX, S3Storage, s3ConfigFor } from "../../../common/ports/adapters/s3-storage.adapter";
import type { Env } from "../../../common/env/env";
import type { TestApp } from "../../../../test/kit/app";
import { FileJobs } from "../file-jobs";
import { ImageSizesPort } from "../../../common/ports/image-sizes.port";
import { StandinImageSizes } from "../../../common/ports/adapters/standins";
import { SignedUrlsService } from "../signed-urls.service";
import { scoreOf, verdictOf } from "../screening.service";
import { filesApp, GB, ids, JPEG, makeAccount, makeBusiness, makeWish, MB, ScoredScreening, WEBM } from "./files-kit";

describe("storage adapters (case 1: one port, two adapters)", () => {
  it("switching STORAGE_DRIVER between r2 and spaces changes only the signed host", async () => {
    const base = { PROVIDERS: "live" } as unknown as Env;
    const r2 = new S3Storage(s3ConfigFor({ ...base, STORAGE_DRIVER: "r2", R2_ACCOUNT_ID: "acct", R2_BUCKET: "fw", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" }));
    const sp = new S3Storage(
      s3ConfigFor({ ...base, STORAGE_DRIVER: "spaces", SPACES_ENDPOINT: "https://fra1.spaces.standin.invalid", SPACES_REGION: "fra1", SPACES_BUCKET: "fw", SPACES_ACCESS_KEY_ID: "k", SPACES_SECRET_ACCESS_KEY: "s" }),
    );
    const key = "wish-photo/019a0000-0000-7000-8000-000000000001/abc";
    const a = new URL((await r2.signUpload({ key, contentType: "image/jpeg", contentLength: 1000, expiresInSeconds: 900 })).url);
    const b = new URL((await sp.signUpload({ key, contentType: "image/jpeg", contentLength: 1000, expiresInSeconds: 900 })).url);
    expect(a.host.endsWith(`acct.${R2_HOST_SUFFIX}`)).toBe(true);
    expect(b.host).toMatch(/(^|\.)fra1\.spaces\.standin\.invalid$/);
    expect(a.pathname.endsWith(`/${key}`)).toBe(true);
    expect(b.pathname.endsWith(`/${key}`)).toBe(true);
    expect([...a.searchParams.keys()].sort()).toEqual([...b.searchParams.keys()].sort());
    expect(a.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(b.searchParams.get("X-Amz-Expires")).toBe("900");
  });

  it("maps a provider score to a verdict: reject at 0.9, review from 0.5", () => {
    expect(verdictOf(0.9)).toBe("reject");
    expect(verdictOf(0.89)).toBe("review");
    expect(verdictOf(0.5)).toBe("review");
    expect(verdictOf(0.49)).toBe("pass");
    expect(scoreOf({ verdict: "rejected", reason: "x", score: 1, labels: ["x"] })).toBe(1);
    expect(scoreOf({ verdict: "clean", score: 0, labels: [] })).toBe(0);
  });
});

describe("E-182, E-184, E-183 uploads (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  let me: { id: string; token: string };
  let other: { id: string; token: string };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db, scored } = await filesApp());
    me = await makeAccount(db, t);
    other = await makeAccount(db, t);
    t.tokens.set("staff", { kind: "staff", staffId: ids.next(), roles: ["owner"] });
  });
  afterAll(() => t.close());

  const ticket = (body: object, token = me.token) => t.http().post("/v1/uploads").set(auth(token)).send(body);
  const confirm = (id: string, token = me.token) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth(token)).send({ fileId: id });
  const keyOf = async (id: string) => (await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey;
  async function uploaded(bytes = 1000, body: object = {}): Promise<string> {
    const r = await ticket({ purpose: "photo", contentType: "image/jpeg", bytes, ...body });
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    t.storage.put(await keyOf(id), JPEG(bytes), "image/jpeg");
    return id;
  }

  it("E-182 issues a signed PUT for one server-made key, good for 15 minutes; the purpose and type are normalised", async () => {
    const r = await ticket({ purpose: " Photo ", contentType: "image/JPG; charset=binary", bytes: 2048, kind: "image" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ purpose: "wish-photo", contentType: "image/jpeg", bytes: 2048, status: "pending", upload: { method: "PUT" } });
    expect(r.body.fileId).toBe(r.body.id);
    expect(r.body.upload.expiresAt).toBe(new Date(t.clock.now().getTime() + 15 * 60 * 1000).toISOString());
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: r.body.id as string } });
    expect(row).toMatchObject({ status: "pending", ownerAccountId: me.id, purpose: "wish_photo", contentType: "image/jpeg" });
    expect(row.objectKey).toMatch(new RegExp(`^wish-photo/${row.id}/[A-Za-z0-9_-]{20,}$`));
    expect(r.body.upload.url).toContain(encodeURI(row.objectKey));
    expect(await db.uploadTicket.findUnique({ where: { id: row.id } })).toMatchObject({ purpose: "wish-photo", contentType: "image/jpeg" });
  });

  it("E-182 refuses without a token (401) and a staff token (403)", async () => {
    expect((await t.http().post("/v1/uploads").send({ purpose: "photo", contentType: "image/jpeg", bytes: 1 })).status).toBe(401);
    expect((await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 1 }, "staff")).status).toBe(403);
  });

  it.each([
    [{ purpose: "photo", contentType: "image/jpeg", bytes: 15 * MB + 1 }, "bytes"],
    [{ purpose: "voice", contentType: "audio/webm", bytes: 10 * MB + 1 }, "bytes"],
    [{ purpose: "vault", contentType: "image/jpeg", bytes: 100 * MB + 1 }, "bytes"],
    [{ purpose: "photo", contentType: "text/html", bytes: 10 }, "contentType"],
    [{ purpose: "song", contentType: "image/jpeg", bytes: 10 }, "purpose"],
    [{ purpose: "photo", contentType: "image/jpeg", bytes: 0 }, "bytes"],
    [{ purpose: "photo", contentType: "image/jpeg", bytes: 10, kind: "sound" }, "kind"],
    [{ purpose: "voice", contentType: "audio/webm", bytes: 10, seconds: 181 }, "seconds"],
    [{ purpose: "photo", contentType: "image/jpeg", bytes: "ten" }, "bytes"],
    [{ purpose: "clip", contentType: "video/mp4", bytes: 10 }, "subjectId"],
  ])("E-182 refuses %j with 422 on %s", async (body, field) => {
    const r = await ticket(body);
    expect(r.status).toBe(422);
    expect(r.body.error.fields).toHaveProperty(field);
  });

  it("E-182 holds a clip to 200 MB and to a ticket that takes clips", async () => {
    const keepsake = await makeWish(db, me.id, "draft", "keepsake");
    const premiere = await makeWish(db, me.id, "draft", "premiere");
    expect((await ticket({ purpose: "clip", contentType: "video/mp4", bytes: 10, subjectId: keepsake })).status).toBe(403);
    expect((await ticket({ purpose: "clip", contentType: "video/mp4", bytes: 200 * MB + 1, subjectId: premiere })).status).toBe(422);
    expect((await ticket({ purpose: "clip", contentType: "video/mp4", bytes: 200 * MB, subjectId: premiere })).status).toBe(201);
    expect((await ticket({ purpose: "clip", contentType: "video/mp4", bytes: 10, subjectId: premiere }, other.token)).status).toBe(404);
    const sealed = await makeWish(db, me.id, "sealed", "premiere");
    expect((await ticket({ purpose: "clip", contentType: "video/mp4", bytes: 10, subjectId: sealed })).status).toBe(409);
  });

  it("E-184 reads the real size and type, screens, makes the file ready and queues its image sizes; confirming twice makes one row", async () => {
    const id = await uploaded(1500);
    const r = await confirm(id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id, fileId: id, status: "ready", bytes: 1500, purpose: "wish-photo", driver: "r2" });
    const again = await confirm(id);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("ready");
    expect(await db.screeningResult.count({ where: { fileId: id } })).toBe(1);
    expect(await db.storedFile.count({ where: { id } })).toBe(1);
    expect(await db.job.count({ where: { subjectId: id, type: "make_image_sizes", status: "scheduled" } })).toBe(1);
  });

  it("E-184 sent twice at once makes one screening and one row", async () => {
    const id = await uploaded(800);
    const before = scored.screened.length;
    const [a, b] = await Promise.all([confirm(id), confirm(id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(scored.screened.length - before).toBe(1);
    expect(await db.screeningResult.count({ where: { fileId: id } })).toBe(1);
  });

  it("E-184 refuses and removes a file never uploaded, larger than asked, or of another type", async () => {
    const never = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const r1 = await confirm(never);
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe("upload_refused");
    expect(await db.storedFile.count({ where: { id: never } })).toBe(0);

    const big = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const bigKey = await keyOf(big);
    t.storage.put(bigKey, JPEG(101), "image/jpeg");
    expect((await confirm(big)).status).toBe(422);
    expect(await t.storage.head(bigKey)).toBeNull();
    expect(await db.storedFile.count({ where: { id: big } })).toBe(0);

    const png = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const pngKey = await keyOf(png);
    t.storage.put(pngKey, JPEG(100), "image/png");
    expect((await confirm(png)).status).toBe(422);
    expect(await t.storage.head(pngKey)).toBeNull();
  });

  it("E-184 is the owner's only (404 for another account), 401 without a token, 422 for a fileId not the path's, 404 for a non-uuid", async () => {
    const id = await uploaded(100);
    expect((await confirm(id, other.token)).status).toBe(404);
    expect((await t.http().post(`/v1/uploads/${id}/confirm`).send({ fileId: id })).status).toBe(401);
    expect((await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: ids.next() })).status).toBe(422);
    expect((await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({})).status).toBe(422);
    expect((await t.http().post(`/v1/uploads/not-a-uuid/confirm`).set(auth(me.token)).send({ fileId: "not-a-uuid" })).status).toBe(404);
  });

  it("screening: at or above 0.9 the file is rejected, removed and never served; from 0.5 it is held and served to its owner only", async () => {
    const reads = t.app.get(SignedUrlsService);
    const bad = await uploaded(300);
    const badKey = await keyOf(bad);
    scored.next.push(0.95);
    const r = await confirm(bad);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("rejected");
    expect(await t.storage.head(badKey)).toBeNull();
    await expect(reads.signedRead({ fileId: bad }, { type: "owner", accountId: me.id })).rejects.toMatchObject({ code: "not_found" });

    const held = await uploaded(300);
    scored.next.push(0.6);
    expect((await confirm(held)).body.status).toBe("screening");
    const result = await db.screeningResult.findFirstOrThrow({ where: { fileId: held } });
    expect(result).toMatchObject({ verdict: "review", finalVerdict: null });
    await expect(reads.signedRead({ fileId: held }, { type: "owner", accountId: me.id })).resolves.toMatchObject({ fileId: held });
    await expect(reads.signedRead({ fileId: held }, { type: "allowed" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("E-173 signed read: a GET good for 10 minutes for the owner only, recorded; sizes have their own keys", async () => {
    const reads = t.app.get(SignedUrlsService);
    const id = await uploaded(400);
    await confirm(id);
    const read = await reads.signedRead({ fileId: id }, { type: "owner", accountId: me.id });
    expect(read.url).toContain(encodeURI(await keyOf(id)));
    expect(read.expiresAt).toBe(new Date(t.clock.now().getTime() + 10 * 60 * 1000).toISOString());
    expect(await db.signedUrl.count({ where: { fileId: id } })).toBe(1);
    await expect(reads.signedRead({ fileId: id }, { type: "owner", accountId: other.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(reads.signedRead({ fileId: "nope" }, { type: "owner", accountId: me.id })).rejects.toMatchObject({ code: "not_found" });

    const sizes = t.app.get<ImageSizesPort, StandinImageSizes>(ImageSizesPort);
    const jobs = t.app.get(FileJobs);
    expect(await jobs.makeImageSizes(id)).toEqual({ made: 3 });
    const made = sizes.made.filter((m) => m.targetKey.startsWith(`wish-photo/${id}/`));
    expect(made.map((m) => m.width)).toEqual([320, 768, 1600]);
    expect(new Set(made.map((m) => m.targetKey)).size).toBe(3);
    const w320 = await reads.signedRead({ fileId: id, variant: "w320" }, { type: "owner", accountId: me.id });
    expect(w320.url).toContain(".w320");
    expect(await jobs.makeImageSizes(id)).toEqual({ made: 0 });
  });

  it("E-183 removes the row and the object; 404 for another account; 409 while a sealed wish uses it; 401 without a token", async () => {
    const id = await uploaded(200);
    await confirm(id);
    const key = await keyOf(id);
    expect((await t.http().delete(`/v1/uploads/${id}`).set(auth(other.token))).status).toBe(404);
    expect((await t.http().delete(`/v1/uploads/${id}`)).status).toBe(401);
    expect((await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token)).send({ fileId: ids.next() })).status).toBe(422);
    const r = await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id, status: "deleted" });
    expect(await db.storedFile.count({ where: { id } })).toBe(0);
    expect(await t.storage.head(key)).toBeNull();

    const used = await uploaded(200);
    await confirm(used);
    await makeWish(db, me.id, "sealed", "keepsake", [{ fileId: used }]);
    const blocked = await t.http().delete(`/v1/uploads/${used}`).set(auth(me.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("file_in_use");
    expect(await db.storedFile.count({ where: { id: used } })).toBe(1);
  });

  it("the link triggers: a row may only name a stored file, and a file still named cannot be deleted", async () => {
    const id = await uploaded(200);
    await confirm(id);
    await expect(db.signedUrl.create({ data: { id: ids.next(), fileId: ids.next(), variant: "original" } })).rejects.toThrow(/not a stored file|Foreign key/);
    await expect(db.signedUrl.create({ data: { id: ids.next(), fileId: "free text", variant: "original" } })).rejects.toThrow(/not a stored file|Foreign key/);
    await db.qrCard.create({ data: { id: ids.next(), kind: "wish_card", status: "done", fileId: id } });
    await expect(db.qrCard.create({ data: { id: ids.next(), kind: "wish_card", status: "done", fileId: ids.next() } })).rejects.toThrow(/not a stored file|Foreign key/);
    const r = await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token));
    expect(r.status).toBe(409);
  });

  it("upload cleanup removes uploads unconfirmed after 24 hours and keeps younger ones", async () => {
    const old = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 10 })).body.id as string;
    const oldKey = await keyOf(old);
    t.storage.put(oldKey, JPEG(10), "image/jpeg");
    t.clock.advance(23 * 60 * 60 * 1000);
    const young = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 10 })).body.id as string;
    t.clock.advance(2 * 60 * 60 * 1000);
    const out = await t.app.get(FileJobs).cleanupUnconfirmed();
    expect(out.removed).toBeGreaterThanOrEqual(1);
    expect(await db.storedFile.count({ where: { id: old } })).toBe(0);
    expect(await db.uploadTicket.count({ where: { id: old } })).toBe(0);
    expect(await t.storage.head(oldKey)).toBeNull();
    expect(await db.storedFile.count({ where: { id: young } })).toBe(1);
  });

  it("a voice ticket makes its voice-note row; WEBM bytes confirm", async () => {
    const wish = await makeWish(db, me.id);
    const r = await ticket({ purpose: "voice_note", contentType: "audio/webm;codecs=opus", bytes: 500, seconds: 42, subjectId: wish, kind: "sound" });
    expect(r.status).toBe(201);
    t.storage.put(await keyOf(r.body.id as string), WEBM(500), "audio/webm");
    expect((await confirm(r.body.id as string)).body.status).toBe("ready");
    expect(await db.voiceNote.findUnique({ where: { id: r.body.id as string } })).toMatchObject({ wishId: wish, seconds: 42 });
  });

  describe("Vault (case 7)", () => {
    let owner: { id: string; token: string };
    let bizId: string;
    beforeAll(async () => {
      owner = await makeAccount(db, t, ["person", "business"]);
      bizId = await makeBusiness(db, owner.id, { plan: "starter" });
    });

    it("needs a business side (403) and refuses a ticket that would go over the plan and packs (409)", async () => {
      expect((await ticket({ purpose: "vault", contentType: "image/jpeg", bytes: 10 })).status).toBe(403);
      await db.business.update({ where: { id: bizId }, data: { vault: BigInt(100 * GB - 50 * MB) } });
      const over = await ticket({ purpose: "vault", contentType: "video/mp4", bytes: 60 * MB }, owner.token);
      expect(over.status).toBe(409);
      expect(over.body.error.code).toBe("vault_full");
      await db.business.update({ where: { id: bizId }, data: { pack: 1, packEnds: new Date(t.clock.now().getTime() + 86_400_000) } });
      expect((await ticket({ purpose: "vault", contentType: "video/mp4", bytes: 60 * MB }, owner.token)).status).toBe(201);
      await db.business.update({ where: { id: bizId }, data: { vault: 0n, pack: null, packEnds: null } });
    });

    it("20 confirms at once count the exact sum into the business's usage", async () => {
      const made: string[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await ticket({ purpose: "vault", contentType: "image/jpeg", bytes: 1000 + i }, owner.token);
        expect(r.status).toBe(201);
        t.storage.put(await keyOf(r.body.id as string), JPEG(1000 + i), "image/jpeg");
        made.push(r.body.id as string);
      }
      const before = (await db.business.findUniqueOrThrow({ where: { id: bizId } })).version;
      const res = await Promise.all(made.map((id) => confirm(id, owner.token)));
      expect(res.map((r) => r.status)).toEqual(Array(20).fill(200));
      const biz = await db.business.findUniqueOrThrow({ where: { id: bizId } });
      expect(Number(biz.vault)).toBe(20 * 1000 + (19 * 20) / 2);
      expect(biz.version - before).toBe(20);
    });

    it("20 confirms at once near the limit: exactly those that fit are counted, the rest refused and removed", async () => {
      await db.business.update({ where: { id: bizId }, data: { vault: 0n } });
      const made: string[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await ticket({ purpose: "vault", contentType: "image/jpeg", bytes: MB }, owner.token);
        t.storage.put(await keyOf(r.body.id as string), JPEG(MB), "image/jpeg");
        made.push(r.body.id as string);
      }
      await db.business.update({ where: { id: bizId }, data: { vault: BigInt(100 * GB - Math.floor(15.5 * MB)) } });
      const res = await Promise.all(made.map((id) => confirm(id, owner.token)));
      expect(res.filter((r) => r.status === 200)).toHaveLength(15);
      expect(res.filter((r) => r.status === 409 && r.body.error.code === "vault_full")).toHaveLength(5);
      const biz = await db.business.findUniqueOrThrow({ where: { id: bizId } });
      expect(Number(biz.vault)).toBe(100 * GB - Math.floor(15.5 * MB) + 15 * MB);
      expect(await db.storedFile.count({ where: { id: { in: made } } })).toBe(15);
    });

    it("deleting a Vault file gives its bytes back", async () => {
      await db.business.update({ where: { id: bizId }, data: { vault: 0n } });
      const r = await ticket({ purpose: "vault", contentType: "image/jpeg", bytes: 5000 }, owner.token);
      t.storage.put(await keyOf(r.body.id as string), JPEG(5000), "image/jpeg");
      await confirm(r.body.id as string, owner.token);
      expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(5000);
      expect((await t.http().delete(`/v1/uploads/${r.body.id as string}`).set(auth(owner.token))).status).toBe(200);
      expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(0);
    });
  });
});
