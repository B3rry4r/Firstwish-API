import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { tag } from "../../staff-accounts/tests/staff-kit";

const ids = new UuidV7Maker();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
const creator = `creator-${tag()}`;
const person = `person-${tag()}`;
let bases: string[] = [];

beforeAll(async () => {
  t = await createTestApp();
  const db = t.app.get(PrismaService);
  const run = tag();
  bases = [`tpl-${run}-a`, `tpl-${run}-b`, `tpl-${run}-c`];
  await db.template.createMany({
    data: bases.map((base) => ({ id: ids.next(), base, name: `T ${base}`, handle: "firstwish", house: true, pace: "scroll", orientation: "portrait", dimension: "flat", kinds: ["love"], mood: ["warm"], line: "a line" })),
  });
  t.tokens.set(creator, { kind: "user", accountId: ids.next(), sides: ["person", "creator"] });
  t.tokens.set(person, { kind: "user", accountId: ids.next(), sides: ["person"] });
});
afterAll(() => t.close());

describe("E-212 GET /v1/studio/templates", () => {
  it("pages the house templates in base order for a creator", async () => {
    const seen: Body[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get("/v1/studio/templates").set("Authorization", `Bearer ${creator}`).query({ limit: 2, ...(cursor ? { cursor } : {}) });
      expect(r.status).toBe(200);
      seen.push(...(r.body.items as Body[]));
      cursor = r.body.nextCursor as string | null;
    } while (cursor);
    const mine = seen.filter((x) => bases.includes(x.base as string));
    expect(mine.map((x) => String(x.base))).toEqual(bases);
    expect(mine[0]).toMatchObject({ name: `T ${bases[0]}`, house: true, kinds: ["love"], theme: null });
  });

  it("401 without a token, 403 without the creator side, 422 for a bad cursor or limit", async () => {
    expect((await t.http().get("/v1/studio/templates")).status).toBe(401);
    expect((await t.http().get("/v1/studio/templates").set("Authorization", `Bearer ${person}`)).status).toBe(403);
    expect((await t.http().get("/v1/studio/templates").set("Authorization", `Bearer ${creator}`).query({ cursor: "x" })).status).toBe(422);
    expect((await t.http().get("/v1/studio/templates").set("Authorization", `Bearer ${creator}`).query({ limit: 0 })).status).toBe(422);
  });
});
