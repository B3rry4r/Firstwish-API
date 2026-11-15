import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { tag } from "../../staff-accounts/tests/staff-kit";
import { EventsService } from "../events.service";

const ids = new UuidV7Maker();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
let db: PrismaService;
let accountId: string;
const token = `user-${tag()}`;
const staffToken = `staff-${tag()}`;

async function addStyle(): Promise<string> {
  const slug = `ev-${tag()}`;
  await db.style.create({ data: { id: ids.next(), slug, name: slug, level: "standard", house: true, on: true, record: [] } });
  return slug;
}
const previews = (slug: string, name: "style_previewed" | "paid" = "style_previewed") => db.event.count({ where: { styleSlug: slug, name } });
const post = (body: unknown) => t.http().post("/v1/events").set("Authorization", `Bearer ${token}`).send(body as object);

beforeAll(async () => {
  t = await createTestApp();
  db = t.app.get(PrismaService);
  accountId = ids.next();
  await db.account.create({ data: { id: accountId, lastSide: "me" } });
  t.tokens.set(token, { kind: "user", accountId, sides: ["person"] });
  t.tokens.set(staffToken, { kind: "staff", staffId: ids.next(), roles: ["owner"] });
});
afterAll(() => t.close());

describe("E-52 POST /v1/events (case 4)", () => {
  it("a style preview is written once per key; the style's count is the sum of events", async () => {
    const slug = await addStyle();
    const key = `key-${tag()}`;
    const a = await post({ name: "style-previewed", props: { style: slug, key } });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({});
    expect((await post({ name: "style-previewed", props: { style: slug, key } })).status).toBe(200);
    expect(await previews(slug)).toBe(1);
    expect((await post({ name: "style-previewed", props: { style: slug, key: `key-${tag()}` } })).status).toBe(200);
    expect(await previews(slug)).toBe(2);
    const row = await db.event.findFirstOrThrow({ where: { styleSlug: slug } });
    expect(row).toMatchObject({ accountId, name: "style_previewed" });
    expect(row.at.toISOString()).toBe(t.clock.now().toISOString());
  });

  it("the same key sent five times at once counts once", async () => {
    const slug = await addStyle();
    const key = `race-${tag()}`;
    const rs = await Promise.all(Array.from({ length: 5 }, () => post({ name: "style-previewed", props: { style: slug, key } })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(await previews(slug)).toBe(1);
  });

  it("a non-canonical name and slug are normalised", async () => {
    const slug = await addStyle();
    expect((await post({ name: " Style-Previewed ", props: { style: ` ${slug.toUpperCase()} `, key: `norm-${tag()}` } })).status).toBe(200);
    expect(await previews(slug)).toBe(1);
  });

  it("the app cannot send a money event: 'paid' is 422 and nothing is counted", async () => {
    const slug = await addStyle();
    const r = await post({ name: "paid", props: { style: slug, key: `paid-${tag()}` } });
    expect(r.status).toBe(422);
    expect((r.body as Body).error.fields).toHaveProperty("name");
    expect(await previews(slug, "paid")).toBe(0);
  });

  it("422 with fields: no key, no style on a preview, an unknown style, a missing props", async () => {
    const slug = await addStyle();
    expect(((await post({ name: "style-previewed", props: { style: slug } })).body as Body).error.fields).toHaveProperty(["props.key"]);
    expect(((await post({ name: "style-previewed", props: { key: `k-${tag()}` } })).body as Body).error.fields).toHaveProperty(["props.style"]);
    expect((await post({ name: "style-previewed", props: { style: `none-${tag()}`, key: `k-${tag()}` } })).status).toBe(422);
    const bad = await post({ name: "style-previewed" });
    expect(bad.status).toBe(422);
    expect((bad.body as Body).error.fields).toHaveProperty("props");
  });

  it("401 without a token; 403 for a staff token", async () => {
    expect((await t.http().post("/v1/events").send({ name: "style-previewed", props: {} })).status).toBe(401);
    expect((await t.http().post("/v1/events").set("Authorization", `Bearer ${staffToken}`).send({ name: "style-previewed", props: {} })).status).toBe(403);
  });
});

describe("EventsService.record: a wish paid in a style (server only)", () => {
  it("writes 'paid' once per key, even twice at once", async () => {
    const slug = await addStyle();
    const svc = t.app.get(EventsService);
    const key = `pay_ref_${tag()}`;
    await Promise.all([
      svc.record({ name: "paid", key, styleSlug: slug, amountKobo: 500000n, line: "tickets" }),
      svc.record({ name: "paid", key, styleSlug: slug, amountKobo: 500000n, line: "tickets" }),
    ]);
    await svc.record({ name: "paid", key, styleSlug: slug, amountKobo: 500000n, line: "tickets" });
    expect(await previews(slug, "paid")).toBe(1);
    const staff = await t.http().get("/v1/admin/styles").query({ limit: 1 });
    expect(staff.status).toBe(401);
  });
});

describe("X4 the event key is its own column", () => {
  it("X4: the key is a column with a unique index, props carry no key, and a replay at once counts once", async () => {
    const slug = await addStyle();
    const key = `x4-${tag()}`;
    await Promise.all(Array.from({ length: 6 }, () => post({ name: "style-previewed", props: { style: slug, key } })));
    const rows = await db.event.findMany({ where: { styleSlug: slug } });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(key);
    expect(rows[0].props).toEqual({ style: slug });
    // the index itself refuses a second row for the same name, account and key
    await expect(
      db.event.create({ data: { id: ids.next(), name: "style_previewed", accountId, key, styleSlug: slug, at: t.clock.now() } }),
    ).rejects.toMatchObject({ code: "P2002" });
    // another account may use the same key
    const other = ids.next();
    await db.account.create({ data: { id: other, lastSide: "me" } });
    const tok2 = `user-${tag()}`;
    t.tokens.set(tok2, { kind: "user", accountId: other, sides: ["person"] });
    await t.http().post("/v1/events").set("Authorization", `Bearer ${tok2}`).send({ name: "style-previewed", props: { style: slug, key } });
    expect(await previews(slug)).toBe(2);
  });

  it("X4: a server event with no account is written once per key, even at once", async () => {
    const slug = await addStyle();
    const svc = t.app.get(EventsService);
    const key = `x4_noacct_${tag()}`;
    await Promise.all(Array.from({ length: 4 }, () => svc.record({ name: "paid", key, styleSlug: slug })));
    expect(await previews(slug, "paid")).toBe(1);
  });
});

describe("X29 an event for a switched-off style", () => {
  it("X29: is 422 and not counted; the style on again takes events", async () => {
    const slug = await addStyle();
    await db.style.update({ where: { slug }, data: { on: false } });
    const r = await post({ name: "style-previewed", props: { style: slug, key: `x29-${tag()}` } });
    expect(r.status).toBe(422);
    expect((r.body as Body).error.fields).toHaveProperty(["props.style"]);
    expect(await previews(slug)).toBe(0);
    await db.style.update({ where: { slug }, data: { on: true } });
    expect((await post({ name: "style-previewed", props: { style: slug, key: `x29-${tag()}` } })).status).toBe(200);
    expect(await previews(slug)).toBe(1);
  });
});
