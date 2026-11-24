import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RevealsService } from "../reveals.service";
import { RUN, testWishNo } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-09-02T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("EB1 (wave 6 join): sending a reveal is limited to 5 emails a day to one address and 100 a day for a business", () => {
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
    await db.account.create({ data: { id: accountId, contact: `j6eb1-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
    const token = `j6eb1-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Lens House", since: NOW, plan: "starter", renews: new Date("2027-12-01T09:00:00.000Z"), allowance: 10, used: 0, rolled: 0, month: "2027-09" } });
    const shoot = await t.http().post("/v1/business/shoots").set(auth(token)).send({ client: "Ada Obi", date: "2027-08-20", title: "Wedding" });
    const file = ids.next();
    await db.storedFile.create({ data: { cleanAt: new Date(), id: file, ownerAccountId: accountId, businessId, purpose: "vault_file", objectKey: `vault-file/${file}/k`, contentType: "image/jpeg", bytes: 1000n, status: "ready", variants: [], driver: "r2" } });
    expect((await t.http().post(`/v1/business/shoots/${shoot.body.id}/files`).set(auth(token)).send({ files: [file], set: "proofs", shoot: shoot.body.id })).status).toBe(201);
    return { accountId, token, businessId, shoot: shoot.body.id as string };
  }
  const wishFor = async (businessId: string) => {
    const id = ids.next();
    await db.clientWish.create({ data: { id, businessId, client: "Ada Obi", kind: "photographers", occasion: "wedding", day: new Date("2027-09-02T00:00:00Z"), no: testWishNo(), key: `k-${id}`, wish: "", shoot: "", hearts: [], sentAt: NOW } });
    return id;
  };
  const send = (b: { token: string; shoot: string }, wish: string, email: string | null) =>
    t.http().post(`/v1/business/client-wishes/${wish}/send-reveal`).set(auth(b.token)).send({
      shoot: b.shoot, set: "proofs", again: true, reveal: { client: "Ada Obi", occasion: "Wedding", city: "Lagos", date: "2027-08-20", note: "Thank you.", credits: [], style: "golden", ...(email ? { email } : {}) },
    });
  const todays = (businessId: string) =>
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM message_delivery d JOIN client_wish c ON c.id = substr(d."idempotencyKey", 8, 36)::uuid WHERE d."idempotencyKey" LIKE 'reveal:%' AND c."businessId" = ${businessId}::uuid`;

  it("the 6th email to one address in a day is refused with 429 and nothing is written for it; another address, and a send with no email, still go", async () => {
    const b = await business();
    const address = `client-${run}@example.com`;
    for (let i = 0; i < 5; i++) expect((await send(b, await wishFor(b.businessId), address)).status).toBe(200);
    const w6 = await wishFor(b.businessId);
    const refused = await send(b, w6, address.toUpperCase());
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe("too_many_requests");
    expect(await db.revealAccess.count({ where: { wishId: w6 } })).toBe(0);
    expect((await db.clientWish.findUniqueOrThrow({ where: { id: w6 } })).reveal).toBeNull();
    expect((await todays(b.businessId))[0].n).toBe(5);
    expect((await send(b, w6, `other-${run}@example.com`)).status).toBe(200);
    expect((await send(b, await wishFor(b.businessId), null)).status).toBe(200);
    // another business may write to the same address; the next day the count starts again
    const other = await business();
    expect((await send(other, await wishFor(other.businessId), address)).status).toBe(200);
    // the next day: the day's emails are counted from the start of the clock port's UTC day, so yesterday's no longer count
    await db.$executeRaw`UPDATE message_delivery SET "createdAt" = ${new Date(t.clock.now().getTime() - 2 * 86_400_000)} WHERE "idempotencyKey" LIKE 'reveal:%' AND "to" = ${address}`;
    expect((await send(b, await wishFor(b.businessId), address)).status).toBe(200);
  });

  it("20 sends at once to one address with 2 left send 2", async () => {
    const b = await business();
    const address = `rush-${run}@example.com`;
    for (let i = 0; i < 3; i++) expect((await send(b, await wishFor(b.businessId), address)).status).toBe(200);
    const wishes = await Promise.all(Array.from({ length: 20 }, () => wishFor(b.businessId)));
    const res = await Promise.all(wishes.map((w) => send(b, w, address)));
    expect(res.filter((r) => r.status === 200)).toHaveLength(2);
    expect(res.filter((r) => r.status === 429)).toHaveLength(18);
    expect((await todays(b.businessId))[0].n).toBe(5);
  });

  it("a business is held to 100 a day: with 98 sent, 20 sends at once to different addresses send 2", async () => {
    const b = await business();
    const w = await wishFor(b.businessId);
    for (let i = 0; i < 98; i++) {
      await db.messageDelivery.create({ data: { id: ids.next(), templateKey: "reveal", channel: "email", to: `old-${i}-${run}@example.com`, purpose: "opened", status: "sent", attempts: 1, idempotencyKey: `reveal:${w}:seed-${i}`, createdAt: t.clock.now() } as never });
    }
    expect((await todays(b.businessId))[0].n).toBe(98);
    const wishes = await Promise.all(Array.from({ length: 20 }, () => wishFor(b.businessId)));
    const res = await Promise.all(wishes.map((x, i) => send(b, x, `new-${i}-${run}@example.com`)));
    expect(res.filter((r) => r.status === 200)).toHaveLength(2);
    expect(res.filter((r) => r.status === 429)).toHaveLength(18);
    expect((await todays(b.businessId))[0].n).toBe(100);
  });

  it("fails closed: when the count cannot be made nothing is sent", async () => {
    const b = await business();
    const w = await wishFor(b.businessId);
    const spy = jest.spyOn(RevealsService.prototype as unknown as { takeEmailRoom: () => Promise<void> }, "takeEmailRoom").mockRejectedValueOnce(new Error("database down"));
    const r = await send(b, w, `down-${run}@example.com`);
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(await db.revealAccess.count({ where: { wishId: w } })).toBe(0);
    expect((await todays(b.businessId))[0].n).toBe(0);
  });
});
