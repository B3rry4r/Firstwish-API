import { PrismaService } from "../../../common/db/prisma.service";
import { TableProbe } from "../table-probe";
import { AdminJobsService } from "../admin-jobs.service";
import { AuditService } from "../../audit/audit.service";
import { SettingsService } from "../settings.service";
import { IdGenerator } from "../../../common/ports/ids.port";
import { requireActionRole, WISH_ACTION_ROLES } from "../action-roles";
import { hex, ids, Kit, makeAccount, makeKit, makePayment, makeWish } from "./kit";

const NOW = new Date("2031-06-15T12:00:00.000Z");
const DAY = new Date("2031-06-10T00:00:00.000Z");
const at = (h: number) => new Date(DAY.getTime() + h * 3_600_000);
const auditRows = (db: PrismaService, action: string, subjectId: string) => db.auditEntry.findMany({ where: { action, subjectId } });

describe("staff reads (B21)", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await makeKit(NOW);
  });
  afterAll(() => k.close());
  const get = (path: string, role?: string) => (role ? k.http().get(path).set(k.auth(role)) : k.http().get(path));
  const post = (path: string, body: unknown, role?: string) => (role ? k.http().post(path).set(k.auth(role)).send(body as object) : k.http().post(path).send(body as object));
  const put = (path: string, body: unknown, role?: string) => (role ? k.http().put(path).set(k.auth(role)).send(body as object) : k.http().put(path).send(body as object));

  describe("Overview (E-82)", () => {
    const ledger = (account: string, direction: "credit" | "debit", amountKobo: bigint, createdAt: Date) =>
      k.db.ledgerEntry.create({ data: { id: ids.next(), journalId: `j-${hex()}`, account, direction, amountKobo, currency: "NGN", memo: "test", createdAt } as never });

    it("counts and sums are the table's own, worked by hand, for a day of its own", async () => {
      const a = await makeAccount(k.db);
      await makeWish(k.db, a.id, { sealedAt: at(2) });
      await makeWish(k.db, a.id, { sealedAt: at(3), openedAt: at(4), status: "live" });
      await makeWish(k.db, a.id, { sealedAt: new Date(DAY.getTime() + 25 * 3_600_000) });
      await makePayment(k.db, { verifiedAt: at(5), accountId: a.id });
      await makePayment(k.db, { verifiedAt: at(6), accountId: a.id });
      await makePayment(k.db, { verifiedAt: at(7), status: "failed", accountId: a.id });
      await ledger("revenue_tickets", "credit", 1000000n, at(5));
      await ledger("revenue_tickets", "credit", 500000n, at(6));
      await ledger("revenue_tickets", "debit", 300000n, at(8));
      await ledger("revenue_keeps", "credit", 250000n, at(9));
      const r = await get("/v1/admin/overview?day=2031-06-10", "owner");
      expect(r.status).toBe(200);
      expect(r.body.day).toBe("2031-06-10");
      expect(r.body.today).toEqual({ sealed: 2, opened: 1, paid: 2 });
      const take = Object.fromEntries((r.body.takings as { line: string; amount: number }[]).map((x) => [x.line, x.amount]));
      expect(take.tickets).toBe(1200000);
      expect(take.keeps).toBe(250000);
      expect(take.pass).toBe(0);
      expect(Array.isArray(r.body.queues)).toBe(true);
    });

    it("shows a role only the parts its sections open; a part left out is absent, not zero", async () => {
      const maker = await get("/v1/admin/overview?day=2031-06-10", "maker");
      expect(maker.status).toBe(200);
      expect(maker.body.takings).toBeUndefined();
      expect(maker.body.today).toBeUndefined();
      expect(maker.body.failedPayments).toBeUndefined();
      expect((maker.body.queues as { key: string }[]).map((q) => q.key)).toEqual(["concierge"]);
      const finance = await get("/v1/admin/overview?day=2031-06-10", "finance");
      expect(finance.body.today).toEqual({ paid: 2 });
      expect(finance.body.takings).toBeDefined();
      const keys = (finance.body.queues as { key: string }[]).map((q) => q.key);
      expect(keys).toEqual(["refunds"]);
    });

    it("401 without a token, 403 for a person, 422 for a bad day", async () => {
      expect((await get("/v1/admin/overview")).status).toBe(401);
      expect((await get("/v1/admin/overview", "person")).status).toBe(403);
      const bad = await get("/v1/admin/overview?day=yesterday", "owner");
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields.day).toBeDefined();
    });

    it("queues read what waits with ages and change nothing; failed jobs are counted for ops and owner only", async () => {
      const queue = async (role: string) => (((await get("/v1/admin/overview", role)).body.queues as { key: string; count: number; oldest: string | null }[]).find((q) => q.key === "jobs"));
      expect(await queue("ops")).toBeDefined();
      const old = new Date("2031-06-01T00:00:00.000Z");
      const mine = `q-${hex()}`;
      const made = await Promise.all([1, 2, 3].map((i) => k.db.job.create({ data: { id: ids.next(), type: "send_message", subjectId: `${mine}-${i}`, runAt: old, status: "dead", attempts: 5 } })));
      // The queue counts every failed job in the shared database; this spec vouches only for the rows it made.
      const q1 = await queue("ops");
      expect(q1!.count).toBeGreaterThanOrEqual(made.length);
      expect(new Date(q1!.oldest as string).getTime()).toBeLessThanOrEqual(old.getTime());
      expect(await k.db.job.count({ where: { subjectId: { startsWith: mine }, status: "dead" } })).toBe(3);
      const support = await get("/v1/admin/overview", "support");
      expect((support.body.queues as { key: string }[]).some((q) => q.key === "jobs")).toBe(false);
    });

    it("leaves out a part whose bundle is absent", async () => {
      const k2 = await makeKit(NOW, (b) => b.overrideProvider(TableProbe).useValue({ has: (t: string) => Promise.resolve(t !== "concierge_order_ext") }));
      try {
        const r = await k2.http().get("/v1/admin/overview").set(k2.auth("owner"));
        const keys = (r.body.queues as { key: string }[]).map((q) => q.key);
        expect(keys).not.toContain("concierge");
        expect(keys).toContain("jobs");
      } finally {
        await k2.close();
      }
    });
  });

  describe("Numbers (E-79, E-80)", () => {
    it("the eight lines come from the ledger by month in integer kobo, with their definitions and targets", async () => {
      for (const [acc, dir, amt, when] of [
        ["revenue_tickets", "credit", 900000n, new Date("2031-06-02T10:00:00Z")],
        ["revenue_tickets", "debit", 100000n, new Date("2031-06-03T10:00:00Z")],
        ["revenue_concierge", "credit", 777000n, new Date("2031-06-04T10:00:00Z")],
        ["revenue_tickets", "credit", 999999n, new Date("2031-05-31T23:59:00Z")],
      ] as const) {
        await k.db.ledgerEntry.create({ data: { id: ids.next(), journalId: `j-${hex()}`, account: acc, direction: dir, amountKobo: amt, currency: "NGN", memo: "t", createdAt: when } as never });
      }
      const r = await get("/v1/admin/numbers", "finance");
      expect(r.status).toBe(200);
      expect(r.body.period).toBe("month");
      const lines = r.body.lines as { line: string; amount: number; definition: string }[];
      expect(lines.map((l) => l.line)).toEqual(["tickets", "extras", "keeps", "pass", "pro_plans", "vault_space", "concierge", "creator_plans"]);
      const by = Object.fromEntries(lines.map((l) => [l.line, l]));
      // 800000 from the rows above, and 1200000 the Overview test put on 10 June in the same month
      expect(by.tickets.amount).toBe(800000 + 1200000);
      expect(by.concierge.amount).toBe(777000);
      expect(lines.every((l) => Number.isInteger(l.amount) && l.definition.length > 5)).toBe(true);
    });

    it("targets: the owner and finance set them, ops cannot, a line with none reads null, a set one is audited", async () => {
      expect((await put("/v1/admin/numbers/targets", { line: "tickets", period: "month", targetKobo: 2000000, reason: "plan" }, "ops")).status).toBe(403);
      expect((await put("/v1/admin/numbers/targets", { line: "tickets", period: "month", targetKobo: 2000000 }, "finance")).status).toBe(422);
      expect((await put("/v1/admin/numbers/targets", { line: "tickets", period: "month", targetKobo: 20.5, reason: "plan" }, "finance")).status).toBe(422);
      const ok = await put("/v1/admin/numbers/targets", { line: "tickets", period: "month", targetKobo: 2000000, reason: "year plan" }, "finance");
      expect(ok.status).toBe(200);
      expect(ok.body.targetKobo).toBe(2000000);
      const again = await put("/v1/admin/numbers/targets", { line: "tickets", period: "month", targetKobo: 2500000, reason: "raised it" }, "owner");
      expect(again.body.targetKobo).toBe(2500000);
      expect(await k.db.numbersTarget.count({ where: { line: "tickets", period: "month" } })).toBe(1);
      const r = await get("/v1/admin/numbers", "owner");
      expect(r.body.targets.tickets).toBe(2500000);
      expect(r.body.targets.creator_plans).toBeNull();
      expect((await k.db.auditEntry.count({ where: { action: "numbers.target", subjectId: "tickets:month" } }))).toBe(2);
    });

    it("401, 403 and a bad period", async () => {
      expect((await get("/v1/admin/numbers")).status).toBe(401);
      expect((await get("/v1/admin/numbers", "support")).status).toBe(403);
      expect((await get("/v1/admin/numbers?period=year", "owner")).status).toBe(422);
    });
  });

  describe("Settings and providers (E-163 to E-165)", () => {
    it("owner only; read, change, and an unchanged write leaves no audit row", async () => {
      expect((await get("/v1/admin/settings")).status).toBe(401);
      expect((await get("/v1/admin/settings", "ops")).status).toBe(403);
      const before = await get("/v1/admin/settings", "owner");
      expect(before.status).toBe(200);
      expect(Object.keys(before.body.switches).sort()).toEqual(["off40", "samplesOff"]);
      const rows0 = await k.db.auditEntry.count({ where: { action: "settings.switch", subjectId: "off40" } });
      expect((await put("/v1/admin/settings/switches/off40", { on: true, reason: "sale" }, "ops")).status).toBe(403);
      const on = await put("/v1/admin/settings/switches/off40", { on: true, reason: "sale on" }, "owner");
      expect(on.status).toBe(204);
      expect((await get("/v1/admin/settings", "owner")).body.switches.off40).toBe(true);
      expect((await put("/v1/admin/settings/switches/off40", { on: true, reason: "sale on" }, "owner")).status).toBe(204);
      expect(await k.db.auditEntry.count({ where: { action: "settings.switch", subjectId: "off40" } })).toBe(rows0 + 1);
      expect((await put("/v1/admin/settings/switches/off40", { on: false, reason: "x" }, "owner")).status).toBe(422);
      expect((await put("/v1/admin/settings/switches/nope", { on: true, reason: "sale on" }, "owner")).status).toBe(422);
      expect(Number((await k.db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM settings WHERE key = to_jsonb(${"off40"}::text)`)[0].n)).toBe(1);
      await put("/v1/admin/settings/switches/off40", { on: false, reason: "sale over" }, "owner");
    });

    it("storage is set at deploy: the setting shows the adapter that runs, a change is 422 and nothing is written", async () => {
      const cur = (await get("/v1/admin/settings", "owner")).body.storage as string;
      expect(["r2", "spaces"]).toContain(cur);
      const other = cur === "r2" ? "spaces" : "r2";
      const n0 = await k.db.auditEntry.count({ where: { action: "settings.storage" } });
      const r = await put("/v1/admin/settings/storage", { choice: other, reason: "owner chose" }, "owner");
      expect(r.status).toBe(422);
      expect(JSON.stringify(r.body)).toContain("set at deploy");
      expect((await put("/v1/admin/settings/storage", { choice: "ftp", reason: "owner chose" }, "owner")).status).toBe(422);
      expect((await put("/v1/admin/settings/storage", { choice: other, reason: "owner chose" }, "ops")).status).toBe(403);
      expect((await get("/v1/admin/settings", "owner")).body.storage).toBe(cur);
      expect(await k.db.auditEntry.count({ where: { action: "settings.storage" } })).toBe(n0);
      expect(Number((await k.db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM settings WHERE key = to_jsonb(${"storage"}::text)`)[0].n)).toBe(0);
    });

    it("a provider is connected only after a real call worked; stand-ins and no news read not_connected; no secret appears", async () => {
      const standin = await get("/v1/admin/settings", "owner");
      expect(standin.body.providers.length).toBeGreaterThan(0);
      for (const p of standin.body.providers as { state: string }[]) expect(p.state).toBe("not_connected");
      expect(JSON.stringify(standin.body)).not.toMatch(/sk_|secret|re_[a-z0-9]{8}/i);

      const db = k.db;
      const env = { PROVIDERS: "live", PAYSTACK_SECRET_KEY: "sk_live_SHOULD_NEVER_SHOW" } as never;
      const none = { provider: { findMany: () => Promise.resolve([]) }, $queryRaw: () => Promise.resolve([]) } as never;
      const quiet = await new SettingsService(none, k.app.get(IdGenerator), k.app.get(AuditService), env).providers();
      expect(quiet.map((p) => p.state)).toEqual(["not_connected", "not_connected", "not_connected", "not_connected"]);
      let calls = 0;
      const paymentsWorked = { provider: { findMany: () => Promise.resolve([]) }, $queryRaw: () => Promise.resolve(calls++ === 0 ? [{ x: 1 }] : []) } as never;
      const some = await new SettingsService(paymentsWorked, k.app.get(IdGenerator), k.app.get(AuditService), env).providers();
      expect(some.find((p) => p.key === "payments")!.state).toBe("connected");
      expect(some.find((p) => p.key === "email")!.state).toBe("not_connected");
      expect(JSON.stringify(some)).not.toContain("SHOULD_NEVER_SHOW");
      void db;
    });
  });

  describe("Staff wishes (E-218 to E-220)", () => {
    it("finds a wish by number, by link (whole address or tail) and by sender email", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id);
      for (const q of [w.no as string, `https://firstwish.example/w/${w.slug}`, w.slug, a.contact as string]) {
        const r = await get(`/v1/admin/wishes?q=${encodeURIComponent(q)}`, "support");
        expect(r.status).toBe(200);
        expect((r.body.items as { no: string }[]).map((i) => i.no)).toContain(w.no);
      }
      const none = await get("/v1/admin/wishes?q=zz-nothing-like-this", "support");
      expect(none.body.items).toEqual([]);
      expect((await get("/v1/admin/wishes?state=bogus", "support")).status).toBe(422);
    });

    it("the detail shows state, term, payments and delivery, and never the wish's words or photos", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const p = await makePayment(k.db, { subjectId: w.id, accountId: a.id });
      const d = await k.db.messageDelivery.create({ data: { id: ids.next(), templateKey: "sealed", channel: "email", to: a.contact!, purpose: "sealed", status: "delivered", attempts: 1 } });
      await k.db.notice.create({ data: { id: ids.next(), kind: "opened", wishId: w.id, accountId: a.id, dueAt: NOW, status: "sent", deliveryId: d.id } });
      const r = await get(`/v1/admin/wishes/${w.no}`, "moderator");
      expect(r.status).toBe(200);
      expect(r.body.wish).toMatchObject({ no: w.no, state: "live", link: w.slug, endsAt: "2031-07-01T00:00:00.000Z" });
      expect(r.body.payments[0]).toMatchObject({ ref: p.providerReference, amount: 500000, state: "paid", line: "tickets" });
      expect(r.body.messages[0].state).toBe("delivered");
      expect(r.body.messages[0].to).not.toContain(a.contact);
      expect(r.body.person).toEqual({ id: a.id, name: a.name });
      expect(JSON.stringify(r.body)).not.toMatch(/SECRET/);
      expect((await get("/v1/admin/wishes/does-not-exist", "moderator")).status).toBe(404);
      expect((await get(`/v1/admin/wishes/${w.no}`, "finance")).status).toBe(403);
      expect((await get(`/v1/admin/wishes/${w.no}`)).status).toBe(401);
    });

    it("take down then restore: each with a reason, one audit row each, a repeat refused, the link follows the state", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const url = `/v1/admin/wishes/${w.no}/actions`;
      expect((await post(url, { action: "take_down", reason: "no" }, "moderator")).status).toBe(422);
      expect((await post(url, { action: "take_down", reason: "reported twice" }, "finance")).status).toBe(403);
      const down = await post(url, { action: "take_down", reason: "reported twice" }, "moderator");
      expect(down.status).toBe(200);
      expect(down.body.wish.state).toBe("down");
      expect((await post(url, { action: "take_down", reason: "reported twice" }, "moderator")).status).toBe(409);
      expect(await auditRows(k.db, "wish.take_down", w.id)).toHaveLength(1);
      const up = await post(url, { action: "restore", reason: "was a mistake" }, "ops");
      expect(up.body.wish.state).toBe("live");
      expect(await auditRows(k.db, "wish.restore", w.id)).toHaveLength(1);
      expect((await post(url, { action: "restore", reason: "again please" }, "ops")).status).toBe(409);
      expect((await post(url, { action: "fly", reason: "again please" }, "ops")).status).toBe(422);
    });

    it("two take-downs at once change the wish once", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const rs = await Promise.all([1, 2, 3, 4, 5].map(() => post(`/v1/admin/wishes/${w.no}/actions`, { action: "take_down", reason: "double click" }, "ops")));
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await auditRows(k.db, "wish.take_down", w.id)).toHaveLength(1);
      expect(await k.db.wishTransition.count({ where: { wishId: w.id, to: "taken_down" } })).toBe(1);
    });

    it("extend adds goodwill days to the term; resend queues the link by email; both are audited", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const ext = await post(`/v1/admin/wishes/${w.no}/actions`, { action: "extend", reason: "goodwill call" }, "ops");
      expect(ext.body.wish.endsAt).toBe("2031-07-08T00:00:00.000Z");
      expect(await auditRows(k.db, "wish.extend", w.id)).toHaveLength(1);
      const re = await post(`/v1/admin/wishes/${w.no}/actions`, { action: "resend", reason: "lost the mail" }, "support");
      expect(re.status).toBe(200);
      expect(await auditRows(k.db, "wish.resend", w.id)).toHaveLength(1);
      expect(re.body.messages.length).toBe(1);
      const draft = await makeWish(k.db, a.id, { status: "draft" });
      expect((await post(`/v1/admin/wishes/${draft.no}/actions`, { action: "extend", reason: "goodwill call" }, "ops")).status).toBe(409);
    });

    it("refund starts the refund of the wish's paid ticket and answers 409 when there is none", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id);
      expect((await post(`/v1/admin/wishes/${w.no}/actions`, { action: "refund", reason: "customer asked" }, "ops")).status).toBe(409);
      const p = await makePayment(k.db, { subjectId: w.id, accountId: a.id });
      const r = await post(`/v1/admin/wishes/${w.no}/actions`, { action: "refund", reason: "customer asked" }, "ops");
      expect(r.status).toBe(200);
      const refunds = await k.db.refund.findMany({ where: { paymentId: p.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0].status).toBe("requested");
    });
  });

  describe("Who may do which action (FC1)", () => {
    const STAFF = ["owner", "ops", "moderator", "reviewer", "support", "finance", "maker"];
    const WISH: Record<string, string[]> = {
      take_down: ["moderator", "ops", "owner"], restore: ["moderator", "ops", "owner"], refund: ["finance", "ops", "owner"],
      extend: ["support", "ops", "owner"], resend: ["support", "ops", "owner"],
    };
    // Finance is in the table for a refund (FC1) but the role table does not open /admin/wishes to finance, so the route refuses it first.
    const REACHABLE = (action: string, role: string) => WISH[action].includes(role) && !(action === "refund" && role === "finance");
    const PERSON: Record<string, string[]> = { ban: ["moderator", "owner"], lift: ["ops", "owner"], erase: ["owner"] };
    const audits = (subjectId: string) => k.db.auditEntry.count({ where: { subjectId } });

    it("every wish action x every staff role: the allowed work; the rest are 403 with no change and no audit row", async () => {
      for (const action of Object.keys(WISH)) {
        for (const role of STAFF) {
          const a = await makeAccount(k.db);
          const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
          const pay = await makePayment(k.db, { subjectId: w.id, accountId: a.id });
          const url = `/v1/admin/wishes/${w.no}/actions`;
          if (action === "restore") expect((await post(url, { action: "take_down", reason: "set up the case" }, "owner")).status).toBe(200);
          const rows0 = await audits(w.id);
          const state0 = await k.db.wish.findUniqueOrThrow({ where: { id: w.id } });
          const r = await post(url, { action, reason: "matrix check" }, role);
          const label = `${action} by ${role}`;
          if (REACHABLE(action, role)) {
            expect([label, r.status]).toEqual([label, 200]);
          } else {
            expect([label, r.status]).toEqual([label, 403]);
            expect(await audits(w.id)).toBe(rows0);
            const now = await k.db.wish.findUniqueOrThrow({ where: { id: w.id } });
            expect([now.status, now.endsAt, now.version]).toEqual([state0.status, state0.endsAt, state0.version]);
            expect(await k.db.refund.count({ where: { paymentId: pay.id } })).toBe(0);
            expect(await k.db.messageDelivery.count({ where: { vars: { path: ["wishId"], equals: w.id } } })).toBe(0);
          }
        }
      }
    });

    it("the table itself lets finance start a refund and keeps support out of it", () => {
      expect(() => requireActionRole(WISH_ACTION_ROLES, "refund", ["finance"])).not.toThrow();
      expect(() => requireActionRole(WISH_ACTION_ROLES, "refund", ["support"])).toThrow();
    });

    it("every person action x every staff role: the allowed work; the rest are 403 with no change and no audit row", async () => {
      for (const [action, ok] of Object.entries(PERSON)) {
        for (const role of STAFF) {
          const a = await makeAccount(k.db);
          const url = `/v1/admin/people/${a.id}/actions`;
          if (action === "lift") expect((await post(url, { action: "ban", reason: "set up the case" }, "owner")).status).toBe(200);
          const rows0 = await audits(a.id);
          const bans0 = await k.db.ban.count({ where: { accountId: a.id } });
          const r = await post(url, { action, reason: "matrix check" }, role);
          const label = `${action} by ${role}`;
          if (ok.includes(role)) {
            expect([label, r.status]).toEqual([label, 200]);
          } else {
            expect([label, r.status]).toEqual([label, 403]);
            expect(await audits(a.id)).toBe(rows0);
            expect(await k.db.ban.count({ where: { accountId: a.id } })).toBe(bans0);
            expect((await k.db.account.findUniqueOrThrow({ where: { id: a.id } })).erasedAt).toBeNull();
          }
        }
      }
    });
  });

  describe("Limits on extend and resend (FC2)", () => {
    it("extend: 30 days in all to one wish, summed from the audit rows; the 31st day is 409; 10 at once let 4 through", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const url = `/v1/admin/wishes/${w.no}/actions`;
      for (let i = 0; i < 4; i++) expect((await post(url, { action: "extend", reason: "goodwill call" }, "support")).status).toBe(200);
      const r = await post(url, { action: "extend", reason: "goodwill call" }, "support");
      expect(r.status).toBe(409);
      expect((await k.db.wish.findUniqueOrThrow({ where: { id: w.id } })).endsAt!.toISOString()).toBe("2031-07-29T00:00:00.000Z");
      expect(await k.db.auditEntry.count({ where: { action: "wish.extend", subjectId: w.id } })).toBe(4);

      const b = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const rs = await Promise.all(Array.from({ length: 10 }, () => post(`/v1/admin/wishes/${b.no}/actions`, { action: "extend", reason: "goodwill call" }, "ops")));
      expect(rs.filter((x) => x.status === 200)).toHaveLength(4);
      expect(rs.filter((x) => x.status === 409)).toHaveLength(6);
      expect(await k.db.auditEntry.count({ where: { action: "wish.extend", subjectId: b.id } })).toBe(4);
    });

    it("resend: the 4th in a UTC day for one wish is 429 and sends nothing; 10 at once let 3 through", async () => {
      const a = await makeAccount(k.db);
      const w = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const url = `/v1/admin/wishes/${w.no}/actions`;
      const sent = (id: string) => k.db.messageDelivery.count({ where: { vars: { path: ["wishId"], equals: id } } });
      for (let i = 0; i < 3; i++) expect((await post(url, { action: "resend", reason: "lost the mail" }, "support")).status).toBe(200);
      const r = await post(url, { action: "resend", reason: "lost the mail" }, "support");
      expect(r.status).toBe(429);
      expect(await sent(w.id)).toBe(3);
      expect(await k.db.auditEntry.count({ where: { action: "wish.resend", subjectId: w.id } })).toBe(3);

      const b = await makeWish(k.db, a.id, { status: "live", endsAt: new Date("2031-07-01T00:00:00Z") });
      const rs = await Promise.all(Array.from({ length: 10 }, () => post(`/v1/admin/wishes/${b.no}/actions`, { action: "resend", reason: "lost the mail" }, "ops")));
      expect(rs.filter((x) => x.status === 200)).toHaveLength(3);
      expect(rs.filter((x) => x.status === 429)).toHaveLength(7);
      expect(await sent(b.id)).toBe(3);
      expect(await k.db.auditEntry.count({ where: { action: "wish.resend", subjectId: b.id } })).toBe(3);
    });
  });

  describe("Staff people (E-1 to E-4)", () => {
    it("masks contact everywhere and finds people by name, email or id", async () => {
      const a = await makeAccount(k.db, { name: `Chidi ${hex()}`, contact: `chidi-${hex()}@example.test`, phone: "+2348031472093" });
      const list = await get(`/v1/admin/people?q=${encodeURIComponent(a.name!)}`, "support");
      expect(list.status).toBe(200);
      const row = (list.body.items as { id: string; phone: string; email: string }[]).find((i) => i.id === a.id)!;
      expect(row.phone).toBe("••••2093");
      expect(row.email.startsWith("c•••@")).toBe(true);
      const detail = await get(`/v1/admin/people/${a.id}`, "moderator");
      expect(JSON.stringify(detail.body)).not.toContain(a.contact);
      expect(JSON.stringify(detail.body)).not.toContain("8031472093");
      expect((await get(`/v1/admin/people?q=${a.id}`, "ops")).body.items).toHaveLength(1);
      expect((await get(`/v1/admin/people?q=${encodeURIComponent(a.contact!)}`, "ops")).body.items).toHaveLength(1);
      expect((await get("/v1/admin/people/not-a-uuid", "ops")).status).toBe(404);
      expect((await get(`/v1/admin/people/${a.id}`, "finance")).status).toBe(403);
    });

    it("ban, lift and erase each need a reason and leave one audit row", async () => {
      const a = await makeAccount(k.db);
      const url = `/v1/admin/people/${a.id}/actions`;
      expect((await post(url, { action: "ban", reason: "x" }, "moderator")).status).toBe(422);
      const b = await post(url, { action: "ban", reason: "harassing others" }, "moderator");
      expect(b.status).toBe(200);
      expect(b.body.person.ban.reason).toBe("harassing others");
      expect((await post(url, { action: "ban", reason: "harassing others" }, "moderator")).status).toBe(409);
      expect(await auditRows(k.db, "ban.create", a.id)).toHaveLength(1);
      const l = await post(url, { action: "lift", reason: "appeal accepted" }, "ops");
      expect(l.body.person.ban).toBeNull();
      expect(await auditRows(k.db, "ban.lift", a.id)).toHaveLength(1);
      expect((await post(url, { action: "lift", reason: "appeal accepted" }, "ops")).status).toBe(409);
      const e = await post(url, { action: "erase", reason: "asked by email" }, "owner");
      expect(e.body.person.erased).toBe(true);
      expect(await auditRows(k.db, "account.erase", a.id)).toHaveLength(1);
    });

    it("a reveal needs a reason, writes an audit row without the values, and is refused to roles the registry does not name", async () => {
      const a = await makeAccount(k.db);
      const url = `/v1/admin/people/${a.id}/contact-reveal`;
      expect((await post(url, { reason: "ok" }, "support")).status).toBe(422);
      expect((await post(url, { reason: "customer on the phone" }, "finance")).status).toBe(403);
      expect((await post(url, { reason: "customer on the phone" }, "reviewer")).status).toBe(403);
      expect((await post(url, { reason: "customer on the phone" })).status).toBe(401);
      const ok = await post(url, { reason: "customer on the phone" }, "support");
      expect(ok.status).toBe(204);
      const rows = await auditRows(k.db, "person.contact_reveal", a.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].actorId).toBe(k.staffIds.support);
      expect(JSON.stringify(rows[0])).not.toContain(a.contact);
      expect(JSON.stringify(rows[0])).not.toContain("8031472093");
    });

    it("the limit is 20 an hour per staff member, counted in the database, even when 30 ask at once", async () => {
      const a = await makeAccount(k.db);
      const url = `/v1/admin/people/${a.id}/contact-reveal`;
      const rs = await Promise.all(Array.from({ length: 30 }, () => post(url, { reason: "checking an order" }, "moderator")));
      expect(rs.filter((r) => r.status === 204)).toHaveLength(20);
      expect(rs.filter((r) => r.status === 429)).toHaveLength(10);
      expect(await k.db.auditEntry.count({ where: { action: "person.contact_reveal", actorId: k.staffIds.moderator } })).toBe(20);
      expect((await post(url, { reason: "another one please" }, "ops")).status).toBe(204);
    });
  });

  describe("Staff jobs (E-61, E-62)", () => {
    it("lists newest first with filters, ops and owner only", async () => {
      const subject = `jl-${hex()}`;
      const j = await k.db.job.create({ data: { id: ids.next(), type: "reconcile_ledger", subjectId: subject, runAt: NOW, status: "dead", attempts: 5 } });
      const r = await get("/v1/admin/jobs?status=dead&type=reconcile-ledger", "ops");
      expect(r.status).toBe(200);
      const hit = (r.body.items as { id: string; type: string; status: string }[]).find((i) => i.id === j.id)!;
      expect(hit).toMatchObject({ type: "reconcile-ledger", status: "dead", subjectId: subject, attempts: 5 });
      expect((await get("/v1/admin/jobs?status=weird", "ops")).status).toBe(422);
      expect((await get("/v1/admin/jobs?type=weird", "ops")).status).toBe(422);
      expect((await get("/v1/admin/jobs", "support")).status).toBe(403);
      expect((await get("/v1/admin/jobs")).status).toBe(401);
    });

    it("retry puts a dead job back once; a job that already ran, or a second retry, changes nothing", async () => {
      const dead = await k.db.job.create({ data: { id: ids.next(), type: "reconcile_ledger", subjectId: `jr-${hex()}`, runAt: new Date("2031-01-01T00:00:00Z"), status: "dead", attempts: 5 } });
      const done = await k.db.job.create({ data: { id: ids.next(), type: "reconcile_ledger", subjectId: `jd-${hex()}`, runAt: new Date("2031-01-01T00:00:00Z"), status: "succeeded", attempts: 1 } });
      expect((await post(`/v1/admin/jobs/${dead.id}/retry`, { reason: "no" }, "ops")).status).toBe(422);
      expect((await post(`/v1/admin/jobs/${dead.id}/retry`, { reason: "provider is back" }, "support")).status).toBe(403);
      const rs = await Promise.all([1, 2, 3, 4].map(() => post(`/v1/admin/jobs/${dead.id}/retry`, { reason: "provider is back" }, "ops")));
      expect(rs.every((r) => r.status === 200)).toBe(true);
      expect(rs[0].body).toMatchObject({ id: dead.id, status: "scheduled", attempts: 0 });
      expect(await auditRows(k.db, "job.retry", dead.id)).toHaveLength(1);
      const same = await post(`/v1/admin/jobs/${done.id}/retry`, { reason: "provider is back" }, "owner");
      expect(same.status).toBe(200);
      expect(same.body).toMatchObject({ status: "succeeded", attempts: 1 });
      expect(await auditRows(k.db, "job.retry", done.id)).toHaveLength(0);
      expect((await post(`/v1/admin/jobs/${ids.next()}/retry`, { reason: "provider is back" }, "ops")).status).toBe(404);
      expect((await post(`/v1/admin/jobs/zzz/retry`, { reason: "provider is back" }, "ops")).status).toBe(404);
      void AdminJobsService;
    });
  });
});
