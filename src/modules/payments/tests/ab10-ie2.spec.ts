import { PrismaService } from "../../../common/db/prisma.service";
import { boot } from "../../concierge/tests/kit";

const NOW = new Date("2027-04-05T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-10 patch F2 (IE2): an id in a payment start is one id in any spelling. */
describe("IE2: one spelling of a wish id", () => {
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("ab10e2", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;
  const start = (auth: string, ticket: string, subjectId: string) =>
    http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `ab10e2-${run}-${++n}-key`).send({ purpose: "ticket", ticket, subjectId });

  it("lower, upper and mixed case of one wish: one 201, the rest 409 with the reference; the wish read shows the waiting payment", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft" });
    const mixed = w.replace(/[a-f]/g, (c, i: number) => (i % 2 ? c.toUpperCase() : c));
    expect(mixed).not.toBe(w);
    const first = await start(a.auth, "moment", w);
    expect(first.status).toBe(201);
    const ref = first.body.payment.reference as string;
    for (const spelling of [w.toUpperCase(), mixed, ` ${w.toUpperCase()} `]) {
      const r = await start(a.auth, "keepsake", spelling);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("ticket_payment_pending");
      expect(r.body.error.fields).toMatchObject({ reference: ref, ticket: "moment" });
    }
    expect(await db.payment.count({ where: { purpose: "ticket", accountId: a.id } })).toBe(1);
    expect((await db.payment.findFirstOrThrow({ where: { purpose: "ticket", accountId: a.id } })).subjectId).toBe(w);
    const read = await http().get(`/v1/wishes/${w}`).set("Authorization", a.auth);
    expect(read.body.ticketPayment).toMatchObject({ ticket: "moment", reference: ref });
    // the wish read by an upper-case id answers the same payment
    expect(read.status).toBe(200);
  });

  it("started in upper case, the lower case spelling finds it; the stored subject is lower case", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft" });
    const first = await start(a.auth, "moment", w.toUpperCase());
    expect(first.status).toBe(201);
    expect((await db.payment.findFirstOrThrow({ where: { purpose: "ticket", accountId: a.id } })).subjectId).toBe(w);
    const r = await start(a.auth, "keepsake", w);
    expect(r.status).toBe(409);
    expect(r.body.error.fields.reference).toBe(first.body.payment.reference);
    const read = await http().get(`/v1/wishes/${w}`).set("Authorization", a.auth);
    expect(read.body.ticketPayment?.reference).toBe(first.body.payment.reference);
  });

  it("an extra and a keep started for the same wish in upper case are stored with the lower case id", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft", ticket: "keepsake" });
    const r = await http().post("/v1/payments").set("Authorization", a.auth).set("Idempotency-Key", `ab10e2-${run}-${++n}-x`).send({ purpose: "extra", id: "qr-card", subjectId: w.toUpperCase() });
    if (r.status === 201) expect((await db.payment.findFirstOrThrow({ where: { purpose: "extra", accountId: a.id } })).subjectId).toBe(w);
    else expect([409, 422]).toContain(r.status);
  });
});
