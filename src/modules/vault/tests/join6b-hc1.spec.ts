import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { FileJobs } from "../../stored-files/file-jobs";
import { JobsService } from "../../jobs/jobs.service";
import { RUN, testWishNo } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2209-08-02T09:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("HC1 (join 6 patch): after an owner's erase, the Vault files a playing reveal shows stay until its term ends", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function business() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `j6bhc1-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
    const token = `j6bhc1-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Lens House", since: NOW, plan: "starter", renews: new Date("2209-12-01T09:00:00.000Z"), allowance: 10, used: 0, rolled: 0, month: "2209-08" } });
    return { accountId, token, businessId };
  }
  async function file(b: { accountId: string; businessId: string }, bytes: Buffer): Promise<{ id: string; key: string }> {
    const id = ids.next();
    const key = `vault-file/${id}/k`;
    await db.storedFile.create({ data: { cleanAt: new Date(), id, ownerAccountId: b.accountId, businessId: b.businessId, purpose: "vault_file", objectKey: key, contentType: "image/jpeg", bytes: BigInt(bytes.length), status: "ready", variants: [], driver: "r2" } });
    await t.storage.putObject(key, bytes, "image/jpeg");
    return { id, key };
  }
  async function shoot(b: { token: string }, files: string[], set: "proofs" | "finals" = "proofs") {
    const s = await t.http().post("/v1/business/shoots").set(auth(b.token)).send({ client: "Ada Obi", date: "2209-07-20", title: "Wedding" });
    expect(s.status).toBe(201);
    if (files.length) expect((await t.http().post(`/v1/business/shoots/${s.body.id}/files`).set(auth(b.token)).send({ files, set, shoot: s.body.id })).status).toBe(201);
    return s.body.id as string;
  }
  async function reveal(b: { token: string; businessId: string }, shootId: string, endsOn: string): Promise<{ cw: string; code: string }> {
    const cw = ids.next();
    await db.clientWish.create({ data: { id: cw, businessId: b.businessId, client: "Ada Obi", kind: "photographers", occasion: "wedding", day: new Date("2209-08-02T00:00:00Z"), no: testWishNo(), key: `k-${cw}`, wish: "", shoot: "", hearts: [], sentAt: NOW } });
    const sent = await t.http().post(`/v1/business/client-wishes/${cw}/send-reveal`).set(auth(b.token)).send({ shoot: shootId, set: "proofs", reveal: { client: "Ada Obi", occasion: "Wedding", city: "Lagos", date: "2209-07-20", note: "Thank you.", credits: [], style: "golden", endsOn } });
    expect(sent.status).toBe(200);
    const code = (await db.$queryRaw<{ code: string }[]>`SELECT code FROM reveal_access WHERE "wishId" = ${cw}::uuid`)[0].code;
    return { cw, code };
  }
  const erase = (accountId: string) => t.app.get(AccountErasureService).erase(accountId, { actor: { type: "system", id: null, requestId: "j6bhc1" }, reason: "test" });
  /** The owner's file job: it is there after the erase, and its handler body runs (a shared job table can hold more than one batch of older jobs). */
  async function runFileJob(accountId: string): Promise<void> {
    expect(await db.job.count({ where: { type: "upload_cleanup", subjectId: `erase-files:${accountId}`, status: "scheduled" } })).toBe(1);
    await t.app.get(FileJobs).eraseFilesOf(accountId);
  }
  const keyOfUrl = (url: string) => decodeURIComponent(new URL(url).pathname.replace(/^\/[^/]+\//, ""));

  it("the reveal plays with its photos after the erase; a file no playing reveal shows goes at once; at the term end the file and its row go", async () => {
    const b = await business();
    const shown = await file(b, Buffer.from(`shown-${run}`));
    const other = await file(b, Buffer.from(`other-${run}`));
    const s = await shoot(b, [shown.id, other.id]);
    // the reveal shows only the chosen file (the shoot's proofs), the other file is only in the shoot's files
    await db.shoot.update({ where: { id: s }, data: { proofs: [shown.id] } });
    const { cw, code } = await reveal(b, s, "2209-08-12");
    await db.clientWish.update({ where: { id: cw }, data: { endsAt: new Date("2209-08-12T23:59:59.999Z") } });
    await erase(b.accountId);
    await runFileJob(b.accountId);

    // the reveal plays and its photo can be fetched from storage
    const view = await t.http().get(`/v1/r/${code}`);
    expect(view.status).toBe(200);
    expect(view.body.photos).toHaveLength(1);
    const got = await t.storage.readStart(keyOfUrl(view.body.photos[0]), 1000);
    expect(got?.toString()).toBe(`shown-${run}`);
    expect(await db.storedFile.count({ where: { id: shown.id } })).toBe(1);
    // a file no playing reveal shows is removed at once
    expect(await db.storedFile.count({ where: { id: other.id } })).toBe(0);
    expect(await t.storage.head(other.key)).toBeNull();

    // still inside the term: it stays
    t.clock.set(new Date(NOW.getTime() + 9 * DAY));
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(200);
    expect(await db.storedFile.count({ where: { id: shown.id } })).toBe(1);

    // the term ends: the stored file, its row and the reveal's words go together
    t.clock.set(new Date(NOW.getTime() + 11 * DAY));
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
    expect(await db.storedFile.count({ where: { id: shown.id } })).toBe(0);
    expect(await t.storage.head(shown.key)).toBeNull();
    expect((await t.http().get(`/v1/r/${code}`)).status).toBe(410);
    const row = await db.clientWish.findUniqueOrThrow({ where: { id: cw } });
    expect(JSON.stringify(row.reveal)).not.toContain("Thank you.");
    // again changes nothing
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
  });

  it("a reveal sent with no end on its client wish plays to its link's end, with its photos", async () => {
    const b = await business();
    const shown = await file(b, Buffer.from(`plain-${run}`));
    const s = await shoot(b, [shown.id]);
    const { cw, code } = await reveal(b, s, "2209-08-12");
    await erase(b.accountId);
    await runFileJob(b.accountId);
    const view = await t.http().get(`/v1/r/${code}`);
    expect(view.status).toBe(200);
    expect(view.body.photos).toHaveLength(1);
    t.clock.set(new Date(NOW.getTime() + 11 * DAY));
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
    expect(await db.storedFile.count({ where: { id: shown.id } })).toBe(0);
  });

  it("a file shared by a playing reveal and a deleted shoot stays", async () => {
    const b = await business();
    const shared = await file(b, Buffer.from(`shared-${run}`));
    const s1 = await shoot(b, [shared.id]);
    const { code } = await reveal(b, s1, "2209-08-12");
    // the reveal's shoot no longer holds the file; the other shoot does, and is deleted
    await db.shoot.update({ where: { id: s1 }, data: { proofs: [], files: [] } });
    const s2 = await shoot(b, [shared.id]);
    expect((await t.http().delete(`/v1/business/shoots/${s2}`).set(auth(b.token))).status).toBe(204);
    expect(await db.storedFile.count({ where: { id: shared.id } })).toBe(1);
    expect((await t.http().get(`/v1/r/${code}`)).body.photos).toHaveLength(1);
  });
});
