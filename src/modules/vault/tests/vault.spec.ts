import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { LinkLimits } from "../../public-wishes/link-limits";
import { hashPasscode } from "../../wishes/wishes.service";
import { NoticesService } from "../../notices/notices.service";
import { JobsService } from "../../jobs/jobs.service";
import { GB, MB } from "../../stored-files/file-rules";
import { JPEG, stage } from "../../stored-files/tests/files-kit";
import { RUN, testWishNo } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("B18 Vault: shoots, space, reveal links, plays, E-33", () => {
  let t: TestApp;
  let db: PrismaService;
  let address: string;
  /** Clears only this spec's address's hits (reads, and the passcode tries of one link): other specs share link_hit. */
  const clearHits = async (linkId: string) => {
    const lim = t.app.get(LinkLimits);
    await db.$executeRaw`DELETE FROM link_hit WHERE key = ANY(${[lim.keyOf(address), lim.keyOf(linkId, address)]})`;
  };

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    // J7: public reads are counted per address; this spec's requests all come from an address of its own, so no other spec's reads count against them.
    address = uniqueAddress();
    const plain = t.http;
    t.http = () => {
      const agent = plain();
      const verbs = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
      return new Proxy(agent, {
        get: (target, prop) => {
          const v = (target as unknown as Record<string | symbol, unknown>)[prop];
          return typeof prop === "string" && verbs.has(prop) ? (url: string) => (v as (u: string) => { set: (k: string, x: string) => unknown }).call(target, url).set("x-forwarded-for", address) : v;
        },
      });
    };
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const who = async (email = `b18-${run}-${++seq}@example.com`) => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: email, sides: ["person", "business"], lastSide: "person" } });
    const token = `b18-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    return { accountId, email, token };
  };
  const owner = async (over: Record<string, unknown> = {}) => {
    const w = await who();
    const businessId = ids.next();
    await db.business.create({
      data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Lens House", since: NOW, plan: "starter", renews: new Date("2027-01-01T09:00:00.000Z"), allowance: 10, used: 0, rolled: 0, month: "2026-12", ...over },
    });
    return { ...w, businessId };
  };
  const post = (path: string, token: string, body: object = {}, headers: Record<string, string> = {}) => t.http().post(path).set(auth(token)).set(headers).send(body);
  const get = (path: string, token: string) => t.http().get(path).set(auth(token));
  const shootOf = async (o: { token: string }, client = "Ada Obi") => {
    const r = await post("/v1/business/shoots", o.token, { client, date: "2026-11-20", title: "Wedding" });
    expect(r.status).toBe(201);
    return r.body as { id: string };
  };
  /** A confirmed Vault file row (the files bundle's own tests cover the upload and confirm steps). */
  const vaultFile = async (businessId: string, accountId: string, bytes = 1000, status: "ready" | "screening" = "ready") => {
    const id = ids.next();
    await db.storedFile.create({
      data: { cleanAt: new Date(), id, ownerAccountId: accountId, businessId, purpose: "vault_file", objectKey: `vault-file/${id}/k`, contentType: "image/jpeg", bytes: BigInt(bytes), status, variants: [], driver: "r2" },
    });
    return id;
  };
  const withFiles = async (o: { businessId: string; accountId: string; token: string }, set: "proofs" | "finals" = "proofs", n = 2) => {
    const s = await shootOf(o);
    const files: string[] = [];
    for (let i = 0; i < n; i++) files.push(await vaultFile(o.businessId, o.accountId, 1000 + i));
    const r = await post(`/v1/business/shoots/${s.id}/${set === "proofs" ? "files" : "finals"}`, o.token, { files, set, shoot: s.id });
    expect(r.status).toBe(201);
    return { shoot: s.id, files };
  };
  const clientWish = async (o: { businessId: string }, client = "Ada Obi") => {
    const id = ids.next();
    await db.clientWish.create({ data: { id, businessId: o.businessId, client, kind: "photographers", occasion: "wedding", day: new Date("2026-12-01T00:00:00Z"), no: testWishNo(), key: `k-${id}`, wish: "", shoot: "", hearts: [], sentAt: NOW } });
    return id;
  };
  const reveal = { client: "Ada Obi", occasion: "Wedding", city: "Lagos", date: "2026-11-20", note: "Thank you.", credits: [{ role: "Made by", name: "Lens House", handle: "" }, { role: "x", name: " ", handle: "" }], booking: "https://example.com/book", style: "golden", email: "ada@example.com" };

  it("1. a shoot is one business's: owner and live login work on it; another business sees 404; no token 401", async () => {
    const o = await owner();
    const s = await shootOf(o, "  Ada   Obi ");
    expect(s).toMatchObject({ client: "Ada Obi", title: "Wedding", date: "2026-11-20", wishState: "uploaded", proofs: [], finals: [], files: [] });
    expect((await t.http().get("/v1/business/shoots")).status).toBe(401);
    const login = await who();
    await db.login.create({ data: { id: ids.next(), businessId: o.businessId, contact: login.email.toUpperCase(), status: "invited" } });
    expect((await get(`/v1/business/shoots/${s.id}`, login.token)).status).toBe(200);
    const list = await get("/v1/business/shoots", login.token);
    expect((list.body.items as { id: string }[]).map((x) => x.id)).toEqual([s.id]);
    const other = await owner();
    expect((await get(`/v1/business/shoots/${s.id}`, other.token)).status).toBe(404);
    expect((await get("/v1/business/shoots", other.token)).body.items).toEqual([]);
    expect((await t.http().delete(`/v1/business/shoots/${s.id}`).set(auth(other.token))).status).toBe(404);
    expect((await post(`/v1/business/shoots/${s.id}/files`, other.token, { files: [ids.next()], set: "proofs", shoot: s.id })).status).toBe(404);
    expect((await get("/v1/business/shoots/not-a-uuid", o.token)).status).toBe(404);
    // a removed login loses it at once
    await db.login.updateMany({ where: { businessId: o.businessId }, data: { status: "removed" } });
    expect((await get(`/v1/business/shoots/${s.id}`, login.token)).status).toBe(403);
    // 422 with fields
    const bad = await post("/v1/business/shoots", o.token, { client: "Bo", date: "2026-02-30", title: "x".repeat(41) });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["date", "title"]);
    const blank = await post("/v1/business/shoots", o.token, { client: "   ", date: "2026-11-20", title: "T" });
    expect(blank.status).toBe(422);
    expect(Object.keys(blank.body.error.fields)).toEqual(["client"]);
    expect((await post("/v1/business/shoots", o.token, { client: "Bo", date: "2026-11-20" })).status).toBe(422);
    // cursor pagination
    await shootOf(o, "B");
    await shootOf(o, "C");
    const p1 = await get("/v1/business/shoots?limit=2", o.token);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await get(`/v1/business/shoots?limit=2&cursor=${p1.body.nextCursor}`, o.token);
    expect(p2.body.items).toHaveLength(1);
  });

  it("add proofs and finals: only the business's own Vault files, again adds nothing, 422 for other files", async () => {
    const o = await owner();
    const other = await owner();
    const s = await shootOf(o);
    const mine = await vaultFile(o.businessId, o.accountId);
    const theirs = await vaultFile(other.businessId, other.accountId);
    const bad = await post(`/v1/business/shoots/${s.id}/files`, o.token, { files: [mine, theirs], set: "proofs", shoot: s.id });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toHaveProperty("files");
    expect((await post(`/v1/business/shoots/${s.id}/files`, o.token, { files: [mine], set: "proofs", shoot: ids.next() })).status).toBe(422);
    expect((await post(`/v1/business/shoots/${s.id}/files`, o.token, { files: [], set: "proofs", shoot: s.id })).status).toBe(422);
    const ok = await post(`/v1/business/shoots/${s.id}/files`, o.token, { files: [mine, mine.toUpperCase()], set: "proofs", shoot: s.id });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ added: 1, previews: 1 });
    expect(ok.body.shoot.proofs).toHaveLength(1);
    expect(ok.body.shoot.proofs[0]).toMatchObject({ id: mine, size: 1000, url: expect.stringContaining("https://") });
    const again = await post(`/v1/business/shoots/${s.id}/files`, o.token, { files: [mine], set: "proofs", shoot: s.id });
    expect(again.body.added).toBe(0);
    const fin = await post(`/v1/business/shoots/${s.id}/finals`, o.token, { files: [mine], set: "finals", shoot: s.id });
    expect(fin.status).toBe(201);
    expect(fin.body.shoot.finals).toHaveLength(1);
    expect(fin.body.shoot.files).toHaveLength(1);
    expect((await post(`/v1/business/shoots/${s.id}/finals`, o.token, { files: [mine], set: "proofs", shoot: s.id })).status).toBe(422);
  });

  it("2. space: used is the sum of the stored files; plan and grants give the room; nothing retyped or discounted", async () => {
    const o = await owner();
    await vaultFile(o.businessId, o.accountId, 3 * MB);
    await vaultFile(o.businessId, o.accountId, 2 * MB, "screening");
    const gone = await vaultFile(o.businessId, o.accountId, 500 * MB);
    await db.storedFile.update({ where: { id: gone }, data: { status: "deleted" } });
    await db.business.update({ where: { id: o.businessId }, data: { vault: 999n } }); // the counter is not read
    const at = NOW;
    const payId = ids.next();
    await db.payment.create({ data: { id: payId, purpose: "wish_pack", lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `vp-${payId}`, idempotencyKey: `vp-${payId}`, updatedAt: at } });
    await db.purchaseGrant.create({ data: { id: ids.next(), paymentId: payId, sku: "pro.pack", kind: "wish-pack", businessId: o.businessId, detail: { vaultGb: 20 }, startsAt: at, endsAt: new Date("2027-02-01T00:00:00Z"), createdAt: at } });
    const r = await get("/v1/business/vault/space", o.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ month: "2026-12", used: 5 * MB, peak: 5 * MB, planGB: 100, packGB: 20, packUntil: "2027-02-01", included: 120 * GB, over: 0, blocks: 0, cost: 0, free: 120 * GB - 5 * MB });
    expect((await t.http().get("/v1/business/vault/space")).status).toBe(401);
    // the peak stays when files go; past the included space the blocks are billed at the price book's list price
    await db.storedFile.updateMany({ where: { businessId: o.businessId }, data: { bytes: BigInt(121 * GB), status: "ready" } });
    const over = await get("/v1/business/vault/space", o.token);
    expect(over.body.over).toBeGreaterThan(0);
    const block = await db.price.findFirstOrThrow({ where: { sku: "vault.block" }, orderBy: { version: "desc" } });
    expect(over.body.blocks).toBe(Math.ceil(over.body.over / (100 * GB)));
    expect(over.body.cost).toBe(over.body.blocks * Number(block.listKobo));
    await db.storedFile.updateMany({ where: { businessId: o.businessId, id: { not: gone } }, data: { bytes: 1000n } });
    await db.storedFile.update({ where: { id: gone }, data: { status: "deleted" } });
    const back = await get("/v1/business/vault/space", o.token);
    expect(back.body.used).toBe(2000);
    expect(back.body.peak).toBe(over.body.peak);
    // another business's space is its own
    const other = await owner({ plan: null, renews: null });
    expect((await get("/v1/business/vault/space", other.token)).body).toMatchObject({ used: 0, planGB: 0, packGB: 0, included: 0, free: 0 });
  });

  it("2. an upload that would pass the space is refused before the link is given; 20 at once near the edge never pass it", async () => {
    const o = await owner({ plan: "starter" });
    await vaultFile(o.businessId, o.accountId, 100 * GB - Math.floor(15.5 * MB));
    await db.business.update({ where: { id: o.businessId }, data: { vault: BigInt(100 * GB - Math.floor(15.5 * MB)) } });
    const ticket = (bytes = MB) => post("/v1/uploads", o.token, { purpose: "vault", contentType: "image/jpeg", bytes });
    // a file that would pass the space is refused before any upload link is given
    const big = await ticket(60 * MB);
    expect(big.status).toBe(409);
    expect(big.body.error.code).toBe("vault_full");
    expect(big.body.upload).toBeUndefined();
    const made = await Promise.all(Array.from({ length: 20 }, () => ticket()));
    expect(made.every((r) => r.status === 201)).toBe(true);
    for (const r of made) await stage(t, db, r.body.id as string, JPEG(MB), "image/jpeg");
    // 20 confirms at once with room for 15: exactly 15 land, 5 are refused, and the space is never passed
    const confirmed = await Promise.all(made.map((r) => post(`/v1/uploads/${r.body.id}/confirm`, o.token, { fileId: r.body.id })));
    // The 20 confirms line up on the one account lock, and each waits up to 15 s for its turn: on a loaded machine one can be
    // answered with a wait that ran out (neither 200 nor vault_full), once in a while 4 refusals where 5 were expected. A confirm
    // that was not answered is sent again, as a client would; the counts below are exactly as before.
    // INT-7: only the wait that ran out is sent again; any other answer (a 500 included) stays as it is and fails the counts below.
    const waitedOut = (r: { status: number }) => r.status === 503; // the wait that ran out answers 503 (U2)
    for (let i = 0; i < confirmed.length; i++) {
      for (let again = 0; again < 3 && !(confirmed[i].status === 200 || (confirmed[i].status === 409 && confirmed[i].body.error.code === "vault_full")) && waitedOut(confirmed[i]); again++) {
        confirmed[i] = await post(`/v1/uploads/${made[i].body.id}/confirm`, o.token, { fileId: made[i].body.id });
      }
    }
    expect(confirmed.filter((r) => r.status === 200)).toHaveLength(15);
    expect(confirmed.filter((r) => r.status === 409 && r.body.error.code === "vault_full")).toHaveLength(5);
    const space = await get("/v1/business/vault/space", o.token);
    expect(space.body.used).toBe(100 * GB - Math.floor(15.5 * MB) + 15 * MB);
    expect(space.body.used).toBeLessThanOrEqual(space.body.included);
    expect(space.body.free).toBe(Math.floor(0.5 * MB));
    expect((await ticket()).status).toBe(409);
  });

  it("6. a lapsed plan: new files are refused (402) and nothing is deleted; links already sent keep playing", async () => {
    const o = await owner();
    const { shoot, files } = await withFiles(o);
    const wish = await clientWish(o);
    const sent = await post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set: "proofs", reveal });
    expect(sent.status).toBe(200);
    const link = await db.$queryRaw<{ code: string }[]>`SELECT code FROM reveal_access WHERE "wishId" = ${wish}::uuid`;
    await db.business.update({ where: { id: o.businessId }, data: { renews: new Date("2026-11-01T00:00:00Z") } });
    const extra = await vaultFile(o.businessId, o.accountId);
    const refused = await post(`/v1/business/shoots/${shoot}/files`, o.token, { files: [extra], set: "proofs", shoot });
    expect(refused.status).toBe(402);
    expect(refused.body.error.code).toBe("vault_lapsed");
    expect((await get(`/v1/business/shoots/${shoot}`, o.token)).body.proofs).toHaveLength(files.length);
    expect(await db.storedFile.count({ where: { businessId: o.businessId, status: "ready" } })).toBe(3);
    const play = await t.http().get(`/v1/r/${link[0].code}`);
    expect(play.status).toBe(200);
    expect(play.body.photos).toHaveLength(files.length);
    // a pack's live space takes the business back in
    const payId = ids.next();
    await db.payment.create({ data: { id: payId, purpose: "wish_pack", lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `vp-${payId}`, idempotencyKey: `vp-${payId}`, updatedAt: NOW } });
    await db.purchaseGrant.create({ data: { id: ids.next(), paymentId: payId, sku: "pro.pack", kind: "wish-pack", businessId: o.businessId, detail: { vaultGb: 20 }, startsAt: NOW, endsAt: new Date("2027-02-01T00:00:00Z"), createdAt: NOW } });
    expect((await post(`/v1/business/shoots/${shoot}/files`, o.token, { files: [extra], set: "proofs", shoot })).status).toBe(201);
  });

  it("3. a reveal link: random code, only the shoot's files, passcode with the receiver's lock, end date, switched off at once", async () => {
    const o = await owner();
    const { shoot, files } = await withFiles(o, "proofs", 3);
    const copy = await post(`/v1/business/reveal-links/${shoot}/copy-link`, o.token, { set: "proofs" });
    expect(copy.status).toBe(200);
    const link = JSON.parse(copy.text) as string;
    const code = link.split("/r/")[1];
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(JSON.parse((await post(`/v1/business/reveal-links/${shoot}/copy-link`, o.token, { set: "proofs" })).text)).toBe(link);
    expect((await post(`/v1/business/reveal-links/${shoot}/copy-link`, o.token, { set: "finals" })).status).toBe(422);
    expect((await post(`/v1/business/reveal-links/${shoot}/copy-link`, o.token, { set: "x" })).status).toBe(422);
    const other = await owner();
    expect((await post(`/v1/business/reveal-links/${shoot}/copy-link`, other.token, { set: "proofs" })).status).toBe(404);
    const open = await t.http().get(`/v1/r/${code}`);
    expect(open.status).toBe(200);
    expect(open.body.state).toBe("open");
    expect(open.body.photos).toHaveLength(3);
    expect(open.body.index).toEqual([0, 1, 2]);
    expect(open.body.photos[0]).toMatch(/expires=\d+/);
    expect(JSON.stringify(open.body)).not.toMatch(/passcode|businessId|accountId/i);
    expect((await t.http().get("/v1/r/short")).status).toBe(404);
    expect((await t.http().get(`/v1/r/${"A".repeat(22)}`)).status).toBe(404);
    // an upload by another business is never in it: only the shoot's own files
    await vaultFile(o.businessId, o.accountId);
    expect((await t.http().get(`/v1/r/${code}`)).body.photos).toHaveLength(3);
    const meta = await db.$queryRaw<{ linkId: string }[]>`SELECT "linkId"::text AS "linkId" FROM reveal_access WHERE code = ${code}`;
    const id = meta[0].linkId;
    expect((await get(`/v1/business/reveal-links/${id}`, o.token)).body).toMatchObject({ link, set: "proofs", off: false, passcode: false });
    expect((await get(`/v1/business/reveal-links/${id}`, other.token)).status).toBe(404);
    expect((await post(`/v1/business/reveal-links/${id}/off`, other.token)).status).toBe(404);
    // off at once
    const off = await post(`/v1/business/reveal-links/${id}/off`, o.token);
    expect(off.status).toBe(200);
    expect(off.body.off).toBe(true);
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(410);
    // the wish's files are read only through that link: files not in the link's list never appear
    expect(files).toHaveLength(3);
  });

  it("3. passcode: wrong tries lock the link like the receiver's link; a good one opens; an end date ends it", async () => {
    const o = await owner();
    const { shoot } = await withFiles(o);
    const wish = await clientWish(o);
    const r = await post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set: "proofs", reveal: { ...reveal, passcode: "blue-door", endsOn: "2026-12-20" } });
    expect(r.status).toBe(200);
    const row = await db.$queryRaw<{ code: string; linkId: string; passcodeHash: string }[]>`SELECT code, "linkId"::text AS "linkId", "passcodeHash" FROM reveal_access WHERE "wishId" = ${wish}::uuid`;
    const code = row[0].code;
    expect(row[0].passcodeHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(await db.clientWish.findUniqueOrThrow({ where: { id: wish } }))).not.toMatch(/blue-door|ada@example\.com|2026-12-20/);
    expect((await t.http().get(`/v1/r/${code}`)).body).toEqual({ state: "passcode" });
    const bad = await t.http().post(`/v1/r/${code}/unlock`).send({ passcode: "wrong" });
    expect(bad.body).toMatchObject({ ok: false });
    const good = await t.http().post(`/v1/r/${code}/unlock`).send({ passcode: "blue-door" });
    expect(good.body.ok).toBe(true);
    const shown = await t.http().get(`/v1/r/${code}`).set("x-unlock-token", good.body.token);
    expect(shown.body.state).toBe("open");
    expect((await t.http().get(`/v1/r/${code}`).set("x-unlock-token", `${good.body.token}x`)).body.state).toBe("passcode");
    // the lock: at 30 wrong tries the link refuses and says when to come back
    await db.$executeRaw`UPDATE reveal_access SET tries = 29 WHERE "linkId" = ${row[0].linkId}::uuid`;
    await clearHits(row[0].linkId);
    expect((await t.http().post(`/v1/r/${code}/unlock`).send({ passcode: "bad" })).body.ok).toBe(false);
    const locked = await t.http().post(`/v1/r/${code}/unlock`).send({ passcode: "blue-door" });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBe(3600);
    t.clock.advance(3601 * 1000);
    await clearHits(row[0].linkId);
    expect((await t.http().post(`/v1/r/${code}/unlock`).send({ passcode: "blue-door" })).body.ok).toBe(true);
    // the end date: the link answers gone after it
    t.clock.set(new Date("2026-12-21T00:00:00Z"));
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(410);
    expect(await hashPasscode("x")).toMatch(/^scrypt\$/);
  });

  it("4. send a reveal (E-33): one email through notices; sent twice on purpose sends twice; a double click (same key) does not", async () => {
    const o = await owner();
    const { shoot } = await withFiles(o, "finals");
    const wish = await clientWish(o);
    const addr = `ada-${run}@example.com`;
    const url = `/v1/business/client-wishes/${wish}/send-reveal`;
    const body = { shoot, set: "finals", reveal: { ...reveal, email: addr } };
    expect((await t.http().post(url).send(body)).status).toBe(401);
    expect((await post(url, o.token, { shoot, set: "x", reveal })).status).toBe(422);
    const bad = await post(url, o.token, { shoot, set: "finals", reveal: { ...reveal, email: "nope", booking: "http://x.test", date: "soon", endsOn: "2020-01-01" } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["reveal.booking", "reveal.date", "reveal.email", "reveal.endsOn"]);
    expect((await post(`/v1/business/client-wishes/${ids.next()}/send-reveal`, o.token, body)).status).toBe(404);
    expect((await post(url, o.token, { ...body, shoot: ids.next() })).status).toBe(404);
    expect((await post(url, o.token, { ...body, set: "proofs" })).status).toBe(422); // no proofs in this shoot
    const outsider = await owner();
    expect((await post(url, outsider.token, body)).status).toBe(404);
    const notices = t.app.get(NoticesService);
    const jobs = t.app.get(JobsService);
    notices.registerAll();
    const sentTo = () => t.email.sent.filter((e) => e.to === addr);
    // Specs share one job table: run only the send jobs of this test's own deliveries.
    const mine = async () => (await db.messageDelivery.findMany({ where: { to: addr }, select: { id: true } })).map((d) => d.id);
    const first = await post(url, o.token, { ...body, reveal: { ...reveal, email: `  ADA-${run}@Example.com ` } }, { "idempotency-key": `k-${run}-1` });
    expect(first.status).toBe(200);
    expect(first.body.wish).toMatchObject({ id: wish, shoot, set: "finals", client: "Ada Obi" });
    expect(first.body.wish.reveal).toMatchObject({ client: "Ada Obi", occasion: "Wedding", city: "Lagos", style: "golden", booking: "https://example.com/book", credits: [{ role: "Made by", name: "Lens House", handle: "" }] });
    expect(first.body.shoot).toMatchObject({ id: shoot, wishState: "finals", finalsReveal: { wish, no: expect.any(String) } });
    expect(JSON.stringify(first.body)).not.toMatch(/ada-\d+@|passcodeHash/);
    await jobs.runDue(50, await mine());
    expect(sentTo()).toHaveLength(1);
    const link = (await db.$queryRaw<{ link: string }[]>`SELECT l.link FROM reveal_link l JOIN reveal_access a ON a."linkId" = l.id WHERE a."wishId" = ${wish}::uuid`)[0].link;
    expect(sentTo()[0].text).toContain(link);
    expect(sentTo()[0].text).toContain("Lens House");
    // a double click: the same key again answers the first result and sends nothing more
    const dbl = await Promise.all([1, 2, 3].map(() => post(url, o.token, { ...body, reveal: { ...reveal, email: addr } }, { "idempotency-key": `k-${run}-1` })));
    expect(dbl.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(dbl[0].body.wish.id).toBe(wish);
    await jobs.runDue(50, await mine());
    expect(sentTo()).toHaveLength(1);
    // the same key for another wish is refused
    const w2 = await clientWish(o);
    expect((await post(`/v1/business/client-wishes/${w2}/send-reveal`, o.token, body, { "idempotency-key": `k-${run}-1` })).status).toBe(409);
    // on purpose: a new key, or none, sends again; the link stays the same
    // IC3: the shoot already went to this client, so sending it once more is asked for with `again`
    expect((await post(url, o.token, body)).status).toBe(409);
    expect((await post(url, o.token, { ...body, again: true }, { "idempotency-key": `k-${run}-2` })).status).toBe(200);
    expect((await post(url, o.token, { ...body, again: true })).status).toBe(200);
    await jobs.runDue(50, await mine());
    expect(sentTo()).toHaveLength(3);
    expect(await db.$queryRaw`SELECT 1 FROM reveal_access WHERE "wishId" = ${wish}::uuid`).toHaveLength(1);
    // no email in the reveal: no email sent
    const w3 = await clientWish(o);
    expect((await post(`/v1/business/client-wishes/${w3}/send-reveal`, o.token, { ...body, again: true, reveal: { ...reveal, email: undefined } })).status).toBe(200);
    expect(await db.messageDelivery.count({ where: { templateKey: "reveal", idempotencyKey: { startsWith: `reveal:${w3}:` } } })).toBe(0);
  });

  it("5. plays: once per visit, count and first and last time for the business; nothing of the viewer", async () => {
    const o = await owner();
    const { shoot } = await withFiles(o);
    const wish = await clientWish(o);
    await post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set: "proofs", reveal });
    const a = (await db.$queryRaw<{ code: string; linkId: string }[]>`SELECT code, "linkId"::text AS "linkId" FROM reveal_access WHERE "wishId" = ${wish}::uuid`)[0];
    const read = (session?: string) => (session ? t.http().get(`/v1/r/${a.code}`).set("x-reveal-session", session) : t.http().get(`/v1/r/${a.code}`));
    await Promise.all([read("visit-one-aaaa"), read("visit-one-aaaa"), read("visit-one-aaaa")]);
    expect((await get(`/v1/business/reveal-links/${a.linkId}`, o.token)).body.plays).toEqual({ count: 1, first: NOW.toISOString(), last: NOW.toISOString() });
    t.clock.advance(3600 * 1000);
    await read("visit-two-bbbb");
    await read();
    await read();
    const plays = (await get(`/v1/business/reveal-links/${a.linkId}`, o.token)).body.plays;
    // IC5: a play is one for each link and address in an hour, whatever id the page sends: the first hour is one, the next hour one more
    expect(plays).toEqual({ count: 2, first: NOW.toISOString(), last: new Date(NOW.getTime() + 3600 * 1000).toISOString() });
    const rows = await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM reveal_play WHERE "linkId" = ${a.linkId}::uuid`;
    expect(Object.keys(rows[0]).sort()).toEqual(["at", "id", "linkId", "visit"]);
    expect(JSON.stringify(rows)).not.toMatch(/visit-one|127\.0\.0\.1|::1|ffff/);
  });

  it("7. erase: closing the business keeps a sent reveal playing to the wish's term end, then it answers gone; shoot names go", async () => {
    const o = await owner();
    const { shoot } = await withFiles(o);
    const wish = await clientWish(o);
    await db.clientWish.update({ where: { id: wish }, data: { endsAt: new Date("2026-12-10T00:00:00Z") } });
    await post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set: "proofs", reveal });
    const code = (await db.$queryRaw<{ code: string }[]>`SELECT code FROM reveal_access WHERE "wishId" = ${wish}::uuid`)[0].code;
    await db.account.update({ where: { id: o.accountId }, data: { erasedAt: NOW } });
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(200);
    t.clock.set(new Date("2026-12-11T00:00:00Z"));
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(410);
    // an erased owner's account takes no writes
    t.clock.set(NOW);
    expect((await post("/v1/business/shoots", o.token, { client: "X", date: "2026-11-20", title: "T" })).status).toBe(401);
  });

  it("delete a shoot: its files and space go, its links are off; a file another shoot holds stays", async () => {
    const o = await owner();
    const a = await withFiles(o, "proofs", 2);
    const code = (JSON.parse((await post(`/v1/business/reveal-links/${a.shoot}/copy-link`, o.token, { set: "proofs" })).text) as string).split("/r/")[1];
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(200);
    const b = await shootOf(o, "Other");
    await post(`/v1/business/shoots/${b.id}/files`, o.token, { files: [a.files[0]], set: "proofs", shoot: b.id });
    const del = await t.http().delete(`/v1/business/shoots/${a.shoot}`).set(auth(o.token));
    expect(del.status).toBe(204);
    expect((await get(`/v1/business/shoots/${a.shoot}`, o.token)).status).toBe(404);
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(410);
    expect(await db.storedFile.count({ where: { id: { in: a.files } } })).toBe(1);
    expect((await get("/v1/business/vault/space", o.token)).body.used).toBe(1000);
  });
});
