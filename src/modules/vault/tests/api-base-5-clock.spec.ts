import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-09-02T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("API-BASE-5 case 7: the reveal email count follows the Clock port, not the database's now()", () => {
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

  async function business() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `ab5clk-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
    const token = `ab5clk-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Lens House", since: NOW, plan: "starter", renews: new Date("2027-12-01T09:00:00.000Z"), allowance: 10, used: 0, rolled: 0, month: "2027-09" } });
    const shoot = await t.http().post("/v1/business/shoots").set(auth(token)).send({ client: "Ada Obi", date: "2027-08-20", title: "Wedding" });
    const file = ids.next();
    await db.storedFile.create({ data: { id: file, ownerAccountId: accountId, businessId, purpose: "vault_file", objectKey: `vault-file/${file}/k`, contentType: "image/jpeg", bytes: 1000n, status: "ready", variants: [], driver: "r2" } });
    expect((await t.http().post(`/v1/business/shoots/${shoot.body.id}/files`).set(auth(token)).send({ files: [file], set: "proofs", shoot: shoot.body.id })).status).toBe(201);
    return { accountId, token, businessId, shoot: shoot.body.id as string };
  }
  const wishFor = async (businessId: string) => {
    const id = ids.next();
    await db.clientWish.create({ data: { id, businessId, client: "Ada Obi", kind: "photographers", occasion: "wedding", day: new Date("2027-09-02T00:00:00Z"), no: `09${++seq}`, key: `k-${id}`, wish: "", shoot: "", hearts: [], sentAt: NOW } });
    return id;
  };
  const send = (b: { token: string; shoot: string }, wish: string, email: string | null) =>
    t.http().post(`/v1/business/client-wishes/${wish}/send-reveal`).set(auth(b.token)).send({
      shoot: b.shoot, set: "proofs", again: true, reveal: { client: "Ada Obi", occasion: "Wedding", city: "Lagos", date: "2027-08-20", note: "Thank you.", credits: [], style: "golden", ...(email ? { email } : {}) },
    });
  const todays = (businessId: string) =>
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM message_delivery d JOIN client_wish c ON c.id = substr(d."idempotencyKey", 8, 36)::uuid WHERE d."idempotencyKey" LIKE 'reveal:%' AND c."businessId" = ${businessId}::uuid`;

  it("the day's count starts at the clock port's day: five sent, the sixth refused; a day later on the clock (the database's now() unchanged) it goes", async () => {
    const b = await business();
    const address = `clock-${run}@example.com`;
    for (let i = 0; i < 5; i++) expect((await send(b, await wishFor(b.businessId), address)).status).toBe(200);
    expect((await send(b, await wishFor(b.businessId), address)).status).toBe(429);
    t.clock.set(new Date(NOW.getTime() + 24 * 3_600_000));
    expect((await send(b, await wishFor(b.businessId), address)).status).toBe(200);
    expect((await todays(b.businessId))[0].n).toBe(6);
  });
});
