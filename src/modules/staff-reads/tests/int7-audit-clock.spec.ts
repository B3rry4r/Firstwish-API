import { hex, Kit, makeAccount, makeKit, makeWish } from "./kit";

const NOW = new Date("2032-03-10T22:30:00.000Z");

describe("INT-7 B21: audit rows and the resend day run on the clock port", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await makeKit(NOW);
  });
  afterAll(() => k.close());
  const post = (path: string, body: unknown, role: string) => k.http().post(path).set(k.auth(role)).send(body as object);

  it("an audit row is stamped from the clock, and the resend limit's day turns with the clock, not the database", async () => {
    const a = await makeAccount(k.db, { name: `Ada ${hex()}`, contact: `ada-${hex()}@example.test` });
    const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2032-07-01T00:00:00Z") });
    const url = `/v1/admin/wishes/${w.no}/actions`;
    for (let i = 0; i < 3; i++) expect((await post(url, { action: "resend", reason: "lost the mail" }, "support")).status).toBe(200);
    const rows = await k.db.auditEntry.findMany({ where: { action: "wish.resend", subjectId: w.id } });
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.createdAt.toISOString()).toBe(NOW.toISOString());
    expect((await post(url, { action: "resend", reason: "lost the mail" }, "support")).status).toBe(429);
    // The clock passes midnight UTC: a new day, so the wish may be sent again.
    k.clock.advance(2 * 3_600_000);
    expect((await post(url, { action: "resend", reason: "lost the mail" }, "support")).status).toBe(200);
    const last = await k.db.auditEntry.findMany({ where: { action: "wish.resend", subjectId: w.id }, orderBy: { id: "desc" }, take: 1 });
    expect(last[0].createdAt.toISOString()).toBe("2032-03-11T00:30:00.000Z");
  });
});
