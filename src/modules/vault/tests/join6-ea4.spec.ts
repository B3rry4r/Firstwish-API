import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-08-02T09:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("EA4 (wave 6 join): after an owner's erase a client wish's reveal is blanked at the end of its term", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  /** Every text, varchar and json column of every table, searched for each string: the tables and columns that still hold one. */
  async function holders(strings: string[]): Promise<string[]> {
    const cols = await db.$queryRaw<{ t: string; c: string }[]>`
      SELECT table_name AS t, column_name AS c FROM information_schema.columns
       WHERE table_schema = 'public' AND (data_type IN ('text', 'character varying', 'json', 'jsonb') OR data_type = 'ARRAY')`;
    const found: string[] = [];
    for (const { t: table, c } of cols) {
      for (const s of strings) {
        const n = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE "${c}"::text ILIKE $1`, `%${s}%`);
        if (Number(n[0].n) > 0) found.push(`${table}.${c}:${s}`);
      }
    }
    return found;
  }

  it("the reveal's name, note and credits are gone from every table once the term ends, and not before", async () => {
    const accountId = ids.next();
    const email = `j6ea4-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
    const token = `j6ea4-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Lens House", since: NOW, plan: "starter", renews: new Date("2027-12-01T09:00:00.000Z"), allowance: 10, used: 0, rolled: 0, month: "2027-08" } });
    const shoot = await t.http().post("/v1/business/shoots").set(auth(token)).send({ client: "Zorbaquux Ibeji", date: "2027-07-20", title: "Wedding" });
    expect(shoot.status).toBe(201);
    const file = ids.next();
    await db.storedFile.create({ data: { id: file, ownerAccountId: accountId, businessId, purpose: "vault_file", objectKey: `vault-file/${file}/k`, contentType: "image/jpeg", bytes: 1000n, status: "ready", variants: [], driver: "r2" } });
    expect((await t.http().post(`/v1/business/shoots/${shoot.body.id}/files`).set(auth(token)).send({ files: [file], set: "proofs", shoot: shoot.body.id })).status).toBe(201);
    const cw = ids.next();
    await db.clientWish.create({ data: { id: cw, businessId, client: "Zorbaquux Ibeji", kind: "photographers", occasion: "wedding", day: new Date("2027-08-02T00:00:00Z"), no: `08${++seq}`, key: `k-${cw}`, wish: "", shoot: "", hearts: [], sentAt: NOW } });
    const reveal = {
      client: "Zorbaquux Ibeji", occasion: "Wedding", city: "Ouagadougou", date: "2027-07-20", note: "Marmalade zebra remembers you.",
      credits: [{ role: "Made by", name: "Quillfeather Studios", handle: "" }], booking: "https://example.com/book", style: "golden", email: "zorba@example.com", endsOn: "2027-08-12",
    };
    const sent = await t.http().post(`/v1/business/client-wishes/${cw}/send-reveal`).set(auth(token)).send({ shoot: shoot.body.id, set: "proofs", reveal });
    expect(sent.status).toBe(200);
    const strings = ["Zorbaquux", "Ouagadougou", "Marmalade zebra", "Quillfeather"];
    expect((await holders(strings)).filter((h) => h.startsWith("client_wish."))).not.toEqual([]); // the words are there before the erase

    await t.app.get(AccountErasureService).erase(accountId, { actor: { type: "system", id: null, requestId: "j6ea4" }, reason: "test" });

    // inside the term the reveal still plays: its words stay in the client wish
    const during = await db.clientWish.findUniqueOrThrow({ where: { id: cw } });
    expect(during.client).toBeNull();
    expect(JSON.stringify(during.reveal)).toContain("Marmalade zebra");
    t.clock.set(new Date(NOW.getTime() + 5 * DAY));
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
    expect(JSON.stringify((await db.clientWish.findUniqueOrThrow({ where: { id: cw } })).reveal)).toContain("Marmalade zebra");

    // after the end day: blanked with the rest, in every table
    t.clock.set(new Date(NOW.getTime() + 11 * DAY));
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
    const after = await db.clientWish.findUniqueOrThrow({ where: { id: cw } });
    expect(after).toMatchObject({ client: null, from: null, wish: null });
    expect(JSON.stringify(after.reveal)).not.toMatch(/Zorbaquux|Ouagadougou|Marmalade|Quillfeather/);
    expect(await holders(strings)).toEqual([]);
    // running it again changes nothing
    await t.app.get(JobsService).runDue(50, [`client-wish:${cw}`]);
    expect(await holders(strings)).toEqual([]);
  });

  it("a reveal not yet sent, or whose link is off, is blanked at once with the erase", async () => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `j6ea4-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Lens House", since: NOW } });
    const cw = ids.next();
    await db.clientWish.create({ data: { id: cw, businessId, client: "Nyambura Wekesa", kind: "photographers", occasion: "wedding", no: `07${++seq}`, key: `k-${cw}`, wish: "", hearts: [], sentAt: NOW, reveal: { client: "Nyambura Wekesa", note: "Pineapple note", credits: [{ role: "x", name: "Fjordhaven" }], link: ids.next() } } });
    await t.app.get(AccountErasureService).erase(accountId, { actor: { type: "system", id: null, requestId: "j6ea4" }, reason: "test" });
    expect(await holders(["Nyambura", "Pineapple note", "Fjordhaven"])).toEqual([]);
  });
});
