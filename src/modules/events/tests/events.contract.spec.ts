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
