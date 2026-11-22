import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2032-08-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const run = RUN;

describe("B22 staff ledger rows (E-64)", () => {
  let t: TestApp;
  let db: PrismaService;
  const staff: Record<string, string> = {};
  const day = (d: number) => new Date(Date.UTC(2032, 7, d, 10, 0, 0));
  let journal = 0;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    await seedRoleTable(db);
    for (const [name, roles] of [["finance", ["finance"]], ["owner", ["owner"]], ["ops", ["ops"]], ["support", ["support"]]] as const) {
      const s = await makeStaff(db, [...roles]);
      staff[name] = `b22l-${s.id}`;
      t.tokens.set(staff[name], { kind: "staff", staffId: s.id, roles: [...roles] });
    }
  });
  afterAll(() => t.close());

  const entry = (account: string, direction: "debit" | "credit", amountKobo: bigint, at: Date, memo = "Sale ticket.keepsake fw-x") =>
    db.ledgerEntry.create({ data: { id: ids.next(), journalId: `b22l-${run}-${++journal}`, account: account as never, direction, amountKobo, currency: "NGN", memo, createdAt: at } });
  const get = (token: string | null, qs: string) => {
    const r = t.http().get(`/v1/admin/ledger-entries?${qs}`);
    return token ? r.set(auth(token)) : r;
  };

  it("1. rows of the window newest first by cursor, filtered by account; sums by hand; no personal data", async () => {
    // a window no other spec writes to: 11 to 13 August 2032
    await entry("provider_clearing", "debit", 600000n, day(11), "Paid fw-aaa");
    await entry("revenue_tickets", "credit", 558140n, day(11), "Sale ticket.keepsake fw-aaa");
    await entry("vat_payable", "credit", 41860n, day(11), "VAT in ticket.keepsake fw-aaa");
    await entry("provider_clearing", "debit", 250000n, day(12), "Paid fw-bbb ada@example.com");
    await entry("revenue_keeps", "credit", 250000n, day(12), "Sale keep.month fw-bbb");
    await entry("revenue_keeps", "credit", 100000n, day(14), "outside the window");
    await entry("revenue_keeps", "credit", 100000n, day(10), "before the window");
    const all = await get(staff.finance, "from=2032-08-11&to=2032-08-13&limit=50");
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(5);
    expect(all.body.nextCursor).toBeNull();
    const rows = (b: { items: { id: string; account: string; amountKobo: number }[] }) => b.items;
    const ids5 = rows(all.body as never).map((i) => i.id);
    expect([...ids5].sort().reverse()).toEqual(ids5);
    const sum = (rows: { direction: string; amountKobo: number }[], d: string) => rows.filter((r) => r.direction === d).reduce((s, r) => s + r.amountKobo, 0);
    expect(sum(all.body.items, "debit")).toBe(850000);
    expect(sum(all.body.items, "credit")).toBe(558140 + 41860 + 250000);
    expect(all.body.items[0]).toMatchObject({ currency: "NGN" });
    expect(Object.keys(all.body.items[0]).sort()).toEqual(["account", "amountKobo", "createdAt", "currency", "direction", "from", "id", "journalId", "memo", "paymentId", "payoutId", "refundId", "to"]);
    expect(JSON.stringify(all.body)).not.toContain("@");
    const keeps = await get(staff.owner, "from=2032-08-11&to=2032-08-13&account=revenue-keeps");
    expect(rows(keeps.body as never).map((i) => [i.account, i.amountKobo])).toEqual([["revenue-keeps", 250000]]);
    // pages: 2 + 2 + 1
    const p1 = await get(staff.finance, "from=2032-08-11&to=2032-08-13&limit=2");
    expect(p1.body.items).toHaveLength(2);
    const p2 = await get(staff.finance, `from=2032-08-11&to=2032-08-13&limit=2&cursor=${p1.body.nextCursor}`);
    const p3 = await get(staff.finance, `from=2032-08-11&to=2032-08-13&limit=2&cursor=${p2.body.nextCursor}`);
    expect([...p1.body.items, ...p2.body.items, ...p3.body.items].map((i: { id: string }) => i.id)).toEqual(ids5);
    expect(p3.body.nextCursor).toBeNull();
  });

  it("2. only finance and owner; 401 without a token; read only", async () => {
    const q = "from=2032-08-11&to=2032-08-13";
    expect((await get(null, q)).status).toBe(401);
    expect((await get(staff.ops, q)).status).toBe(403);
    expect((await get(staff.support, q)).status).toBe(403);
    const user = ids.next();
    await db.account.create({ data: { id: user, contact: `b22l-${run}@example.com`, sides: ["person"], lastSide: "person" } });
    t.tokens.set("b22l-user", { kind: "user", accountId: user, sides: ["person"] });
    expect((await get("b22l-user", q)).status).toBe(403);
    const before = await db.ledgerEntry.count();
    for (const m of ["post", "put", "patch", "delete"] as const) expect((await t.http()[m](`/v1/admin/ledger-entries`).set(auth(staff.owner)).send({})).status).toBe(404);
    expect(await db.ledgerEntry.count()).toBe(before);
  });

  it("3. 422 with fields for a bad window, account, cursor or limit", async () => {
    for (const [qs, field] of [
      ["to=2032-08-13", "from"],
      ["from=2032-08-11", "to"],
      ["from=11-08-2032&to=2032-08-13", "from"],
      ["from=2032-08-13&to=2032-08-11", "to"],
      ["from=2030-01-01&to=2032-08-11", "to"],
      ["from=2032-08-11&to=2032-08-13&account=cash", "account"],
      ["from=2032-08-11&to=2032-08-13&cursor=abc", "cursor"],
      ["from=2032-08-11&to=2032-08-13&limit=0", "limit"],
      ["from=2032-08-11&to=2032-08-13&limit=51", "limit"],
    ] as const) {
      const r = await get(staff.finance, qs);
      expect([qs, r.status]).toEqual([qs, 422]);
      expect(Object.keys(r.body.error.fields)).toContain(field);
    }
  });
});
