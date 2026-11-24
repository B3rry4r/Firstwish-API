import { PrismaService } from "../../../common/db/prisma.service";
import { R2_HOST_SUFFIX, S3Storage, s3ConfigFor } from "../../../common/ports/adapters/s3-storage.adapter";
import type { Env } from "../../../common/env/env";
import type { TestApp } from "../../../../test/kit/app";
import { FileJobs } from "../file-jobs";
import { ImageSizesPort } from "../../../common/ports/image-sizes.port";
import { StandinImageSizes } from "../../../common/ports/adapters/standins";
import { SignedUrlsService } from "../signed-urls.service";
import { verdictOf } from "../screening.service";
import { stagingKeyOf } from "../file-rules";
import { filesApp, GB, ids, JPEG, makeAccount, makeBusiness, makeWish, MB, PNG, ScoredScreening, stage, SVG, WEBM } from "./files-kit";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { ownDatabase } from "../../../../test/kit/own-db";

// the book's limits are shared by every spec in the run's database: hold the setting lock for the file
holdSettingLockForFile();
// cleanupUnconfirmed sweeps every open upload ticket of the database by this spec's own clock, so in a shared database it also removes another spec's open ticket: both describes here use a database of their own
const own = ownDatabase("sfc");
beforeAll(() => own.use());
afterAll(() => own.drop());

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

  it("X21: maps a provider score to a verdict: reject at 0.9, review from 0.5", () => {
    expect(verdictOf(0.9)).toBe("reject");
    expect(verdictOf(0.89)).toBe("review");
    expect(verdictOf(0.5)).toBe("review");
    expect(verdictOf(0.49)).toBe("pass");
    expect(verdictOf(0.1, true)).toBe("review");
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
    await stage(t, db, id, JPEG(bytes), "image/jpeg");
    return id;
  }

  it("X20, X25, Y1, X26: E-182 answers {id, purpose, upload} with a signed PUT for a STAGING key bound to type and length, good for 15 minutes; the purpose and type are normalised", async () => {
    const r = await ticket({ purpose: " Photo ", contentType: "image/JPG; charset=binary", bytes: 2048, kind: "image" });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body as object).sort()).toEqual(["id", "purpose", "upload"]);
    expect(Object.keys(r.body.upload as object).sort()).toEqual(["expiresAt", "headers", "method", "url"]);
    expect(r.body).toMatchObject({ purpose: "wish-photo", upload: { method: "PUT", headers: { "content-type": "image/jpeg", "content-length": "2048" } } });
    expect(r.body.upload.expiresAt).toBe(new Date(t.clock.now().getTime() + 15 * 60 * 1000).toISOString());
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: r.body.id as string } });
    expect(row).toMatchObject({ status: "pending", ownerAccountId: me.id, purpose: "wish_photo", contentType: "image/jpeg" });
    expect(row.objectKey).toMatch(new RegExp(`^wish-photo/${row.id}/[A-Za-z0-9_-]{20,}$`));
    expect(row.kind).toBe("image");
    // Y1: the PUT points at the staging key, never at the file's own key.
    expect(r.body.upload.url).toContain(encodeURI(stagingKeyOf(row.objectKey)));
    expect(t.storage.bound.get(stagingKeyOf(row.objectKey))).toEqual({ contentType: "image/jpeg", contentLength: 2048 });
    expect(t.storage.bound.has(row.objectKey)).toBe(false);
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
    [{ purpose: "photo", contentType: "image/svg+xml", bytes: 10 }, "contentType"],
    [{ purpose: "brand", contentType: "image/svg+xml", bytes: 10 }, "contentType"],
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

  it("E-184 refuses and removes a file never uploaded, larger than asked, or not the type its bytes say", async () => {
    const never = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const r1 = await confirm(never);
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe("upload_refused");
    expect(await db.storedFile.count({ where: { id: never } })).toBe(0);

    const big = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const bigKey = stagingKeyOf(await keyOf(big));
    t.storage.put(bigKey, JPEG(101), "image/jpeg");
    expect((await confirm(big)).status).toBe(422);
    expect(await t.storage.head(bigKey)).toBeNull();
    expect(await db.storedFile.count({ where: { id: big } })).toBe(0);
  });

  it("Y3: the type is decided from the file's first bytes, not from the storage header; the real size is stored; an SVG is never a photo", async () => {
    // PNG bytes sent as a "jpeg" ticket, with a header that agrees: refused, removed.
    const png = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const pngFinal = await keyOf(png);
    const pngKey = await stage(t, db, png, PNG(100), "image/jpeg");
    const r1 = await confirm(png);
    expect(r1.status).toBe(422);
    expect(await t.storage.head(pngKey)).toBeNull();
    expect(await t.storage.head(pngFinal)).toBeNull();
    // An SVG with an image header, on a png ticket and on a jpeg ticket.
    for (const type of ["image/png", "image/jpeg"]) {
      const svg = (await ticket({ purpose: "photo", contentType: type, bytes: 90 })).body.id as string;
      await stage(t, db, svg, SVG(90), type);
      const r2 = await confirm(svg);
      expect(r2.status).toBe(422);
      expect(r2.body.error.message).toMatch(/SVG/);
      expect(await db.storedFile.count({ where: { id: svg } })).toBe(0);
    }
    // A header that lies the other way does not matter: the bytes are a jpeg, so it is one.
    const ok = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 100 })).body.id as string;
    const okKey = stagingKeyOf(await keyOf(ok));
    t.storage.put(okKey, JPEG(100), "application/octet-stream");
    expect((await confirm(ok)).body).toMatchObject({ status: "ready", bytes: 100, kind: "image", contentType: "image/jpeg" });
    // Smaller than asked: the real size is the one stored.
    const small = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 500 })).body.id as string;
    t.storage.put(stagingKeyOf(await keyOf(small)), JPEG(120), "image/jpeg");
    expect((await confirm(small)).body).toMatchObject({ status: "ready", bytes: 120 });
    expect(Number((await db.storedFile.findUniqueOrThrow({ where: { id: small } })).bytes)).toBe(120);
    // A sound with audio bytes and the kind column.
    const wish = await makeWish(db, me.id);
    const v = (await ticket({ purpose: "voice", contentType: "audio/webm", bytes: 64, subjectId: wish, kind: "sound" })).body.id as string;
    await stage(t, db, v, WEBM(64), "audio/webm");
    expect((await confirm(v)).body).toMatchObject({ kind: "sound", purpose: "voice-note" });
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

  it("E-183 (X20) answers 204 and removes the row and the object; 404 for another account; 409 while a sealed wish names it (Y5); 401 without a token", async () => {
    const id = await uploaded(200);
    await confirm(id);
    const key = await keyOf(id);
    expect((await t.http().delete(`/v1/uploads/${id}`).set(auth(other.token))).status).toBe(404);
    expect((await t.http().delete(`/v1/uploads/${id}`)).status).toBe(401);
    expect((await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token)).send({ fileId: ids.next() })).status).toBe(422);
    const r = await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token));
    expect(r.status).toBe(204);
    expect(r.text).toBe("");
    expect(await db.storedFile.count({ where: { id } })).toBe(0);
    expect(await t.storage.head(key)).toBeNull();
    expect((await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token))).status).toBe(404);

    const used = await uploaded(200);
    await confirm(used);
    const sealedWish = await makeWish(db, me.id, "sealed", "keepsake");
    await db.wishFile.create({ data: { id: ids.next(), wishId: sealedWish, fileId: used, role: "photo" } });
    const blocked = await t.http().delete(`/v1/uploads/${used}`).set(auth(me.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("file_in_use");
    expect(await db.storedFile.count({ where: { id: used } })).toBe(1);
  });

  it("X23: every file link is a uuid with a real foreign key; a file still named cannot be deleted; a draft wish's link goes with the file", async () => {
    const id = await uploaded(200);
    await confirm(id);
    await expect(db.signedUrl.create({ data: { id: ids.next(), fileId: ids.next(), variant: "original" } })).rejects.toThrow(/Foreign key/);
    await expect(db.signedUrl.create({ data: { id: ids.next(), fileId: "free text", variant: "original" } })).rejects.toThrow();
    const card = ids.next();
    await db.qrCard.create({ data: { id: card, kind: "wish_card", status: "done", fileId: id } });
    await expect(db.qrCard.create({ data: { id: ids.next(), kind: "wish_card", status: "done", fileId: ids.next() } })).rejects.toThrow(/Foreign key/);
    const r = await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("file_in_use");
    // Any other update to a row that names a file is not tripped by it (no trigger fires on unrelated updates).
    await db.qrCard.update({ where: { id: card }, data: { status: "failed" } });
    await db.qrCard.delete({ where: { id: card } });
    const draft = await makeWish(db, me.id, "draft");
    await db.wishFile.create({ data: { id: ids.next(), wishId: draft, fileId: id, role: "photo" } });
    expect((await t.http().delete(`/v1/uploads/${id}`).set(auth(me.token))).status).toBe(204);
    expect(await db.wishFile.count({ where: { wishId: draft } })).toBe(0);
  });

  it("upload cleanup removes uploads unconfirmed after 24 hours and keeps younger ones", async () => {
    const old = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 10 })).body.id as string;
    const oldKey = await keyOf(old);
    t.storage.put(stagingKeyOf(oldKey), JPEG(10), "image/jpeg");
    t.clock.advance(23 * 60 * 60 * 1000);
    const young = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 10 })).body.id as string;
    t.clock.advance(2 * 60 * 60 * 1000);
    const out = await t.app.get(FileJobs).cleanupUnconfirmed();
    expect(out.removed).toBeGreaterThanOrEqual(1);
    expect(await db.storedFile.count({ where: { id: old } })).toBe(0);
    expect(await db.uploadTicket.count({ where: { id: old } })).toBe(0);
    expect(await t.storage.head(oldKey)).toBeNull();
    expect(await t.storage.head(stagingKeyOf(oldKey))).toBeNull();
    expect(await db.storedFile.count({ where: { id: young } })).toBe(1);
  });

  it("a voice ticket makes its voice-note row; WEBM bytes confirm", async () => {
    const wish = await makeWish(db, me.id);
    const r = await ticket({ purpose: "voice_note", contentType: "audio/webm;codecs=opus", bytes: 500, seconds: 42, subjectId: wish, kind: "sound" });
    expect(r.status).toBe(201);
    await stage(t, db, r.body.id as string, WEBM(500), "audio/webm");
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
      // GG4 (INT-4): Vault space from a pack is the GB of its live grant (business.pack counts wishes left)
      const payId = ids.next();
      const at = t.clock.now();
      await db.payment.create({ data: { id: payId, purpose: "wish_pack", lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `vp-${payId}`, idempotencyKey: `vp-${payId}`, updatedAt: at } });
      const grantId = ids.next();
      await db.purchaseGrant.create({ data: { id: grantId, paymentId: payId, sku: "pro.pack", kind: "wish-pack", businessId: bizId, detail: { vaultGb: 20 }, startsAt: at, endsAt: new Date(at.getTime() + 86_400_000), createdAt: at } });
      expect((await ticket({ purpose: "vault", contentType: "video/mp4", bytes: 60 * MB }, owner.token)).status).toBe(201);
      await db.business.update({ where: { id: bizId }, data: { vault: 0n } });
      await db.purchaseGrant.update({ where: { id: grantId }, data: { revokedAt: at } });
    });

    it("20 confirms at once count the exact sum into the business's usage", async () => {
      const made: string[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await ticket({ purpose: "vault", contentType: "image/jpeg", bytes: 1000 + i }, owner.token);
        expect(r.status).toBe(201);
        await stage(t, db, r.body.id as string, JPEG(1000 + i), "image/jpeg");
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
        await stage(t, db, r.body.id as string, JPEG(MB), "image/jpeg");
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
      await stage(t, db, r.body.id as string, JPEG(5000), "image/jpeg");
      await confirm(r.body.id as string, owner.token);
      expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(5000);
      expect((await t.http().delete(`/v1/uploads/${r.body.id as string}`).set(auth(owner.token))).status).toBe(204);
      expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(0);
    });
  });
});

describe("patch rulings Y1, Y3, Y4, X21, X22, X25, AA1, AA5 (real database, real parallel requests)", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  let me: { id: string; token: string };
  let biz: { id: string; token: string };
  let bizId: string;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db, scored } = await filesApp());
    me = await makeAccount(db, t);
    biz = await makeAccount(db, t, ["business"]);
    bizId = await makeBusiness(db, biz.id, { plan: "starter" });
  });
  afterAll(() => t.close());

  const ticket = (body: object, token = me.token) => t.http().post("/v1/uploads").set(auth(token)).send(body);
  const confirm = (id: string, token = me.token) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth(token)).send({ fileId: id });
  const rowOf = (id: string) => db.storedFile.findUniqueOrThrow({ where: { id } });

  it("Y1 attack: confirm a clean file, then PUT other bytes with the old signed URL: the served file and the Vault count are unchanged, and the cleanup handler removes the stray object", async () => {
    const t0 = await ticket({ purpose: "vault", contentType: "image/png", bytes: 400 }, biz.token);
    const id = t0.body.id as string;
    const finalKey = (await rowOf(id)).objectKey;
    const staging = stagingKeyOf(finalKey);
    expect(new URL(t0.body.upload.url as string).pathname).toContain(encodeURI(staging));
    const good = PNG(400);
    expect(t.storage.putSigned(staging, good, "image/png")).toBe(true);
    const c = await confirm(id, biz.token);
    expect(c.body).toMatchObject({ status: "ready", bytes: 400 });
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(400);
    const served = await t.storage.readStart(finalKey, 1000);
    expect(served?.equals(good)).toBe(true);
    // The attack: same type, same length (so the bound signature accepts it), other bytes, the old URL.
    const evil = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(392, 9)]);
    expect(t.storage.putSigned(staging, evil, "image/png")).toBe(true);
    // A PUT with another length or type is refused by storage itself (X26).
    expect(t.storage.putSigned(staging, Buffer.alloc(900, 1), "image/png")).toBe(false);
    expect(t.storage.putSigned(staging, evil, "image/svg+xml")).toBe(false);
    // The final key was never signed, and nothing changed there.
    expect(t.storage.bound.has(finalKey)).toBe(false);
    expect((await t.storage.readStart(finalKey, 1000))?.equals(good)).toBe(true);
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(400);
    expect(await db.storedFile.count({ where: { id, status: "ready", bytes: 400n } })).toBe(1);
    expect(await t.storage.head(staging)).not.toBeNull();
    // Before the old URL has expired, the handler leaves the stray alone; after, it removes it.
    expect(await t.app.get(FileJobs).cleanupUnconfirmed()).toMatchObject({ swept: 0 });
    t.clock.advance(16 * 60 * 1000);
    const out = await t.app.get(FileJobs).cleanupUnconfirmed();
    expect(out.swept).toBeGreaterThanOrEqual(1);
    expect(await t.storage.head(staging)).toBeNull();
    expect((await t.storage.readStart(finalKey, 1000))?.equals(good)).toBe(true);
    expect(await db.storedFile.count({ where: { id, status: "ready" } })).toBe(1);
  });

  it("Y1: a stray left after a refusal or a delete is swept too", async () => {
    const a = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 50 })).body.id as string;
    const aStaging = stagingKeyOf((await rowOf(a)).objectKey);
    expect((await confirm(a)).status).toBe(422);
    t.storage.put(aStaging, JPEG(50), "image/jpeg");
    const b = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 50 })).body.id as string;
    const bStaging = await stage(t, db, b, JPEG(50), "image/jpeg");
    await confirm(b);
    expect((await t.http().delete(`/v1/uploads/${b}`).set(auth(me.token))).status).toBe(204);
    t.storage.put(bStaging, JPEG(50), "image/jpeg");
    t.clock.advance(16 * 60 * 1000);
    await t.app.get(FileJobs).cleanupUnconfirmed();
    expect(await t.storage.head(aStaging)).toBeNull();
    expect(await t.storage.head(bStaging)).toBeNull();
  });

  it("Y4: storage and the screening port are called outside any database transaction; the upload row is claimed by one conditional UPDATE, so 10 parallel confirms copy and screen once", async () => {
    const id = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 300 })).body.id as string;
    await stage(t, db, id, JPEG(300), "image/jpeg");
    // Counts the transactions this app has open (spec files share a database, so the server's own view is not used).
    let inTx = 0;
    const open: number[] = [];
    const probe = () => {
      open.push(inTx);
      return Promise.resolve();
    };
    const txOrig = db.$transaction.bind(db) as (fn: unknown, opts?: unknown) => Promise<unknown>;
    const txSpy = jest.spyOn(db, "$transaction").mockImplementation(((fn: unknown, opts?: unknown) => {
      if (typeof fn !== "function") return txOrig(fn, opts);
      inTx++;
      return txOrig(fn, opts).finally(() => {
        inTx--;
      });
    }));
    const spies = (["head", "copy", "readStart", "delete"] as const).map((m) => {
      const orig = t.storage[m].bind(t.storage) as (...a: unknown[]) => Promise<unknown>;
      return jest.spyOn(t.storage, m).mockImplementation(async (...a: unknown[]) => {
        await probe();
        return orig(...a) as never;
      });
    });
    const screenOrig = scored.screen.bind(scored);
    const screenSpy = jest.spyOn(scored, "screen").mockImplementation(async (i) => {
      await probe();
      return screenOrig(i);
    });
    const before = scored.screened.length;
    const res = await Promise.all(Array.from({ length: 10 }, () => confirm(id)));
    const copies = spies[1].mock.calls.length;
    spies.forEach((s) => s.mockRestore());
    txSpy.mockRestore();
    screenSpy.mockRestore();
    expect(res.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(res.every((r) => r.body.status === "ready")).toBe(true);
    expect(copies).toBe(1);
    expect(scored.screened.length - before).toBe(1);
    expect(await db.screeningResult.count({ where: { fileId: id } })).toBe(1);
    expect(await db.job.count({ where: { subjectId: id, type: "make_image_sizes" } })).toBe(1);
    expect(open.length).toBeGreaterThanOrEqual(5);
    expect(open.every((n) => n === 0)).toBe(true);
  });

  it("X21: the port's score and labels decide: reject from 0.9, hold from 0.5; its labels are recorded", async () => {
    const run = async (score: number, labels: string[]) => {
      const id = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 70 })).body.id as string;
      await stage(t, db, id, JPEG(70), "image/jpeg");
      scored.next.push(score);
      scored.nextLabels.push(labels);
      const r = await confirm(id);
      const res = await db.screeningResult.findFirstOrThrow({ where: { fileId: id } });
      return { status: r.body.status as string, res };
    };
    const cases: [number, string, string][] = [
      [0.9, "rejected", "reject"],
      [0.89, "screening", "review"],
      [0.5, "screening", "review"],
      [0.49, "ready", "pass"],
    ];
    for (const [score, status, verdict] of cases) {
      const out = await run(score, score >= 0.5 ? ["weapons", "text"] : []);
      expect(out.status).toBe(status);
      expect(out.res.verdict).toBe(verdict);
      if (score >= 0.5) expect(out.res.labels).toEqual(expect.arrayContaining(["weapons", "text"]));
      else expect(out.res.labels).toEqual([]);
    }
  });

  it("X22: sizes are made through the kernel's image-sizes port, three widths, each under its own key", async () => {
    const sizes = t.app.get<ImageSizesPort, StandinImageSizes>(ImageSizesPort);
    expect(sizes).toBeInstanceOf(StandinImageSizes);
    const id = (await ticket({ purpose: "photo", contentType: "image/jpeg", bytes: 70 })).body.id as string;
    await stage(t, db, id, JPEG(70), "image/jpeg");
    await confirm(id);
    const made = (await t.app.get(FileJobs).makeImageSizes(id)).made;
    expect(made).toBe(3);
    const mine = sizes.made.filter((m) => m.targetKey.includes(id));
    expect(new Set(mine.map((m) => m.targetKey)).size).toBe(3);
  });

  it("X25: purpose is in E-182's body (photo, voice, clip, vault, studio, brand) and kind is the media kind", async () => {
    const wish = await makeWish(db, me.id, "draft", "premiere");
    const cases: [object, string, string][] = [
      [{ purpose: "photo", contentType: "image/png", bytes: 9, kind: "image" }, "wish-photo", "image"],
      [{ purpose: "voice", contentType: "audio/mpeg", bytes: 9, kind: "sound", subjectId: wish }, "voice-note", "sound"],
      [{ purpose: "clip", contentType: "video/mp4", bytes: 9, kind: "video", subjectId: wish }, "video-clip", "video"],
      [{ purpose: "studio", contentType: "image/webp", bytes: 9 }, "studio-asset", "image"],
    ];
    for (const [body, purpose, kind] of cases) {
      const r = await ticket(body);
      expect(r.status).toBe(201);
      expect(r.body.purpose).toBe(purpose);
      expect((await rowOf(r.body.id as string)).kind).toBe(kind);
    }
    const vault = await ticket({ purpose: "vault", contentType: "video/mp4", bytes: 9, kind: "video" }, biz.token);
    expect(vault.status).toBe(201);
    expect((await ticket({ purpose: "photo", contentType: "image/png", bytes: 9, kind: "video" })).body.error.fields).toHaveProperty("kind");
    expect((await ticket({ purpose: "voice", contentType: "audio/mpeg", bytes: 9, kind: "image", subjectId: wish })).status).toBe(422);
  });

  it("AA5: purpose brand takes the photo rules (screened, typed by its bytes, no SVG) and needs a business", async () => {
    expect((await ticket({ purpose: "brand", contentType: "image/png", bytes: 80 })).status).toBe(403);
    const vaultBefore = Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault ?? 0n);
    const r = await ticket({ purpose: "brand", contentType: "image/png", bytes: 80 }, biz.token);
    expect(r.status).toBe(201);
    expect(r.body.purpose).toBe("brand-logo");
    const id = r.body.id as string;
    expect(await rowOf(id)).toMatchObject({ purpose: "brand_logo", businessId: bizId, kind: "image" });
    await stage(t, db, id, PNG(80), "image/png");
    expect((await confirm(id, biz.token)).body).toMatchObject({ status: "ready", purpose: "brand-logo", bytes: 80 });
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault ?? 0n)).toBe(vaultBefore);
    // An SVG sent as a png logo: refused by its bytes and removed.
    const svg = (await ticket({ purpose: "brand", contentType: "image/png", bytes: 90 }, biz.token)).body.id as string;
    await stage(t, db, svg, SVG(90), "image/png");
    const rs = await confirm(svg, biz.token);
    expect(rs.status).toBe(422);
    expect(await db.storedFile.count({ where: { id: svg } })).toBe(0);
    // Held logo at 0.6, rejected at 0.95.
    const bad = (await ticket({ purpose: "brand", contentType: "image/png", bytes: 80 }, biz.token)).body.id as string;
    await stage(t, db, bad, PNG(80), "image/png");
    scored.next.push(0.95);
    expect((await confirm(bad, biz.token)).body.status).toBe("rejected");
  });

  it("AA1: an erased account takes no new upload ticket (401 account_erased)", async () => {
    const gone = await makeAccount(db, t);
    await db.account.update({ where: { id: gone.id }, data: { erasedAt: new Date() } });
    const r = await ticket({ purpose: "photo", contentType: "image/png", bytes: 9 }, gone.token);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("account_erased");
    expect(await db.storedFile.count({ where: { ownerAccountId: gone.id } })).toBe(0);
  });

  it("Y4: 20 parallel confirms of 20 Vault files near the limit still count the exact sum (claim, then short transaction)", async () => {
    await db.business.update({ where: { id: bizId }, data: { vault: 0n, plan: "starter" } });
    const ids20: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await ticket({ purpose: "vault", contentType: "image/png", bytes: 2000 + i }, biz.token);
      await stage(t, db, r.body.id as string, PNG(2000 + i), "image/png");
      ids20.push(r.body.id as string);
    }
    const res = await Promise.all(ids20.map((id) => confirm(id, biz.token)));
    expect(res.map((r) => r.status)).toEqual(Array(20).fill(200));
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(20 * 2000 + 190);
  });
});
