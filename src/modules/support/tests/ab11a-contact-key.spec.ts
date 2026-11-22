import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { PrismaService } from "../../../common/db/prisma.service";

const NOW = new Date("2027-09-01T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
let n = 0;
const mail = () => `ab11a4-${run}-${++n}@example.test`;

/** API-BASE-11A case 4: the contact route takes an Idempotency-Key. */
describe("contact route Idempotency-Key", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));
  const post = (body: Record<string, unknown>, key?: string, ip = uniqueAddress()) => {
    const r = t.http().post("/v1/support-threads/contact").set("X-Forwarded-For", ip);
    if (key !== undefined) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  const threads = (email: string) => db.supportThread.count({ where: { contact: email } });
  const messages = (email: string) => db.supportMessage.count({ where: { thread: { contact: email } } });

  it("the same key and body is one thread; the same key with another body is 409; no key behaves as before", async () => {
    const email = mail();
    const body = { email, subject: "A question", body: "Where is my wish?" };
    const key = `ab11a4-${run}-one`;
    const ip = uniqueAddress();
    const first = await post(body, key, ip);
    expect(first.status).toBe(201);
    const again = await post(body, key, ip);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body.messages).toHaveLength(first.body.messages.length);
    // from another address, the same key and words are still that thread
    const elsewhere = await post(body, key);
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.body.id).toBe(first.body.id);
    expect(await threads(email)).toBe(1);
    expect(await messages(email)).toBe(1);
    // the same key with another subject, another message or another email is 409 and makes nothing
    for (const other of [{ ...body, subject: "Another" }, { ...body, body: "Something else" }, { ...body, email: mail() }]) {
      const r = await post(other, key);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("idempotency_key_reused");
    }
    expect(await threads(email)).toBe(1);
    // the address written in another way (case, spaces) is the same body
    const spelled = await post({ ...body, email: `  ${email.toUpperCase()} ` }, key);
    expect(spelled.status).toBe(200);
    expect(spelled.body.id).toBe(first.body.id);
    // no key: each start is a thread, as today
    const free = mail();
    const a = await post({ email: free, subject: "s", body: "b" });
    const b = await post({ email: free, subject: "s", body: "b" });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await threads(free)).toBe(2);
    // a different key is a different thread
    const c = await post(body, `ab11a4-${run}-two`);
    expect(c.status).toBe(201);
    expect(c.body.id).not.toBe(first.body.id);
    // a key that is not a key is 422 in words and makes nothing
    const email2 = mail();
    for (const bad of ["short", "has spaces in it", "x".repeat(101)]) {
      const r = await post({ email: email2, subject: "s", body: "b" }, bad);
      expect(r.status).toBe(422);
      expect(r.body.error.fields["Idempotency-Key"]).toMatch(/8 to 100/);
    }
    expect(await threads(email2)).toBe(0);
  });

  it("a repeat is not counted against the five a day; 30 starts at once with one key make one thread", async () => {
    const email = mail();
    const body = { email, subject: "Counted once", body: "Hello" };
    const ip = uniqueAddress();
    const key = `ab11a4-${run}-count`;
    for (let i = 0; i < 8; i++) {
      const r = await post(body, key, ip);
      expect(r.status).toBe(i === 0 ? 201 : 200);
    }
    // five more different starts from the address are what the limit counts: the repeats took none of them
    const other = mail();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await post({ email: other, subject: "s", body: `b${i}` }, undefined, ip)).status);
    expect(codes.slice(0, 4)).toEqual([201, 201, 201, 201]);
    // 30 at once, one key
    const burst = mail();
    const rs = await Promise.all(Array.from({ length: 30 }, () => post({ email: burst, subject: "Burst", body: "At once" }, `ab11a4-${run}-burst`)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(29);
    expect(new Set(rs.map((r) => r.body.id as string)).size).toBe(1);
    expect(await threads(burst)).toBe(1);
    // the same key at once with two different bodies: one thread, the other is 409
    const mixed = mail();
    const both = await Promise.all([post({ email: mixed, subject: "A", body: "one" }, `ab11a4-${run}-mixed`), post({ email: mixed, subject: "B", body: "two" }, `ab11a4-${run}-mixed`)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await threads(mixed)).toBe(1);
  });
});
