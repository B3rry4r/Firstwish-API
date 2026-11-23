import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-06-07T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** API-BASE-15 case 3 (W14B check): the owner's wish read says per extra the ticket takes whether it can still be bought, by the rule the payment uses. */
describe("API-BASE-15: a wish read says which extras can still be bought", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  const person = async () => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab15e-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab15e-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "love", occasion: "birthday", styleSlug: "noir", timeZone: "Africa/Lagos", name: "Ada", content: {}, ...over } as never });
    return id;
  };
  const read = async (token: string, id: string) => (await t.http().get(`/v1/wishes/${id}`).set(bearer(token))).body as { extrasOpen: Record<string, boolean> };
  const live = { status: "live", sealedAt: NOW, opensAt: new Date(NOW.getTime() - 3600000), no: `${Date.now()}${++seq}`.padEnd(8, "7") };

  it("no ticket: nothing to say; a Moment takes no extra; a Keepsake draft can buy what it takes, and a held extra is shut", async () => {
    const u = await person();
    expect((await read(u.token, await wish(u.id))).extrasOpen).toEqual({});
    expect((await read(u.token, await wish(u.id, { ticket: "moment" }))).extrasOpen).toEqual({});
    const keep = (await read(u.token, await wish(u.id, { ticket: "keepsake" }))).extrasOpen;
    expect(Object.keys(keep).length).toBeGreaterThan(0);
    expect(keep["extra.five-photos"]).toBe(true);
    expect(keep["extra.premium-style"]).toBe(true);
    const held = (await read(u.token, await wish(u.id, { ticket: "keepsake", adds: ["extra.premium-style"] }))).extrasOpen;
    expect(held["extra.premium-style"]).toBe(false);
    expect(held["extra.five-photos"]).toBe(true);
    // a photo pack can be bought again (a repeatable extra)
    expect((await read(u.token, await wish(u.id, { ticket: "keepsake", adds: ["extra.five-photos"] }))).extrasOpen["extra.five-photos"]).toBe(true);
  });

  it("a sealed wish may still take extras; one that has opened (live) may not; the read agrees with the payment's start", async () => {
    const u = await person();
    const sealed = await wish(u.id, { ticket: "signature", status: "sealed", sealedAt: NOW, opensAt: new Date(NOW.getTime() + 3600000), no: `${Date.now()}${++seq}`.padEnd(8, "5") });
    const opened = await wish(u.id, { ticket: "signature", ...live });
    const a = (await read(u.token, sealed)).extrasOpen;
    const b = (await read(u.token, opened)).extrasOpen;
    expect(Object.keys(a).length).toBeGreaterThan(0);
    expect(Object.values(b).every((v) => v === false)).toBe(true);
    expect(Object.keys(b)).toEqual(Object.keys(a));
    for (const [wid, open] of [[sealed, a], [opened, b]] as const) {
      for (const [sku, can] of Object.entries(open)) {
        const r = await t.http().post("/v1/payments").set(bearer(u.token)).send({ purpose: "extra", id: sku.slice("extra.".length), subjectId: wid });
        expect([sku, r.status === 201]).toEqual([sku, can]);
      }
    }
  });
});
