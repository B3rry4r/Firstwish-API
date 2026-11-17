import { PrismaService } from "../../../common/db/prisma.service";
import { uniqueAddress } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids } from "./kit";

const NOW = new Date("2027-02-08T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;
type Role = "maker" | "ops" | "owner" | "support" | "finance" | "moderator";

/** API-BASE-8 cases 2 to 5 (HY2 to HY5): what the staff Support and Concierge screens still ask of the server. */
describe("HY2 to HY5: staff search, the hand-over list, the order's payment, the maker's wishes", () => {
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("ab8s", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;
  const word = (s: string) => `ab8${s}${run}x${++n}`;

  async function staff(roles: Role[], status: "active" | "removed" | "suspended" = "active", name?: string) {
    const id = ids.next();
    await db.staffAccount.create({ data: { id, email: `ab8s-st-${run}-${++n}@example.com`, name: name ?? `Staff ${n}`, roles: roles as never, status } });
    k.t.tokens.set(`staff-${id}`, { kind: "staff", staffId: id, roles });
    return { id, auth: `Bearer staff-${id}` };
  }
  async function person(name: string, email?: string) {
    const a = await k.account();
    await db.account.update({ where: { id: a.id }, data: { name, ...(email ? { contact: email } : {}) } });
    return a;
  }
  const thread = (auth: string, subject: string) => http().post("/v1/support-threads").set("Authorization", auth).set("X-Forwarded-For", uniqueAddress()).send({ subject, body: "Please help." });
  const threads = (auth: string, qs: string) => http().get(`/v1/admin/support/threads?${qs}`).set("Authorization", auth);
  const orders = (auth: string, qs: string) => http().get(`/v1/admin/concierge/orders?${qs}`).set("Authorization", auth);
  const ids_ = (r: { body: { items: { id: string }[] } }) => r.body.items.map((x) => x.id);

  it("HY2 Support: q finds a thread by subject, name, whole email and wish number, with paging and the existing filters; the email stays masked", async () => {
    const support = await staff(["support"]);
    const ops = await staff(["ops"]);
    const email = `${word("mail")}@example.com`.toLowerCase();
    const ada = await person(`Ada ${word("nm")}`, email);
    const wishNo = word("no").toUpperCase();
    await k.wish(ada.id, { no: wishNo });
    const bola = await person(`Bola ${word("nm")}`);
    const subj = word("subject");
    const t1 = (await thread(ada.auth, `Refund ${subj} one`)).body.id as string;
    const t2 = (await thread(ada.auth, `Refund ${subj} two`)).body.id as string;
    const t3 = (await thread(bola.auth, `Refund ${subj} three`)).body.id as string;
    const t4 = (await thread(bola.auth, "Something else entirely")).body.id as string;

    // subject: part of a word, any case, newest first
    const bySubject = await threads(support.auth, `q=${subj.toUpperCase()}`);
    expect(bySubject.status).toBe(200);
    expect(ids_(bySubject)).toEqual([t3, t2, t1]);
    // name of the person
    const byName = await threads(support.auth, `q=${encodeURIComponent(String((await db.account.findUniqueOrThrow({ where: { id: bola.id } })).name))}`);
    expect(ids_(byName)).toEqual([t4, t3]);
    // whole email: finds the threads, and what comes back is masked, never the address
    const byEmail = await threads(support.auth, `q=${encodeURIComponent(email.toUpperCase())}`);
    expect(ids_(byEmail)).toEqual([t2, t1]);
    for (const item of byEmail.body.items) {
      expect(item.email).not.toBe(email);
      expect(item.contact).not.toBe(email);
    }
    expect(JSON.stringify(byEmail.body)).not.toContain(email);
    // a part of an address finds nothing: the list cannot be used to read the masked address piece by piece
    const local = email.split("@")[0];
    for (const part of [local, local.slice(0, 8), email.split("@")[1], `${local.slice(0, 5)}@`]) {
      const r = await threads(support.auth, `q=${encodeURIComponent(part)}`);
      expect(r.status).toBe(200);
      expect(ids_(r)).not.toContain(t1);
    }
    // a wish number of the person's account, with or without "#"
    expect(ids_(await threads(support.auth, `q=${encodeURIComponent(wishNo)}`))).toEqual([t2, t1]);
    expect(ids_(await threads(support.auth, `q=${encodeURIComponent(`#${wishNo.toLowerCase()}`)}`))).toEqual([t2, t1]);
    // a word that matches nothing is an empty page; an empty q narrows nothing
    expect((await threads(support.auth, `q=${word("none")}`)).body).toEqual({ items: [], nextCursor: null });
    expect((await threads(support.auth, "q=")).body.items.length).toBeGreaterThan(3);
    expect((await threads(support.auth, `q=${"a".repeat(101)}`)).status).toBe(422);
    // paging with q: two to a page, and the cursor holds
    const p1 = await threads(support.auth, `q=${subj}&limit=2`);
    expect(ids_(p1)).toEqual([t3, t2]);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await threads(support.auth, `q=${subj}&limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`);
    expect(ids_(p2)).toEqual([t1]);
    expect(p2.body.nextCursor).toBeNull();
    // the existing filters keep working beside q
    await http().post(`/v1/admin/support/threads/${t2}/state`).set("Authorization", support.auth).send({ state: "closed", reason: "done here" }).expect(200);
    expect(ids_(await threads(support.auth, `q=${subj}&status=closed`))).toEqual([t2]);
    await http().post(`/v1/admin/support-threads/${t1}/assignee`).set("Authorization", support.auth).send({ assigneeId: support.id, reason: "mine now" }).expect(200);
    expect(ids_(await threads(support.auth, `q=${subj}&assigneeId=${support.id}`))).toEqual([t1]);
    // ops sees the same masked results
    const asOps = await threads(ops.auth, `q=${encodeURIComponent(email)}`);
    expect(ids_(asOps)).toEqual([t2, t1]);
    expect(JSON.stringify(asOps.body)).not.toContain(email);
    // a role that does not open Support still gets 403
    expect((await threads((await staff(["moderator"])).auth, `q=${subj}`)).status).toBe(403);
  });

  /** One paid order of this buyer, given to this maker. */
  async function paidOrder(buyerId: string, buyerAuth: string, makerId: string | null, over: Record<string, unknown> = {}) {
    const ops = await staff(["ops"]);
    const id = (await http().post("/v1/concierge-orders").set("Authorization", buyerAuth).send({ brief: word("brief"), count: 1, kind: "single", rush: false, ...over })).body.id as string;
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyerId, purpose: "concierge", subjectId: id, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyerId}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: id }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    if (makerId) await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId, reason: "to maker", expectedMaker: "" }).expect(200);
    return { id, payId, reference: `fw-${payId}` };
  }

  it("HY2 Concierge: q finds an order by number, who ordered, the business and a name on the order, with paging; a maker only their own", async () => {
    const ops = await staff(["ops"]);
    const maker = await staff(["maker"]);
    const otherMaker = await staff(["maker"]);
    const email = `${word("buyer")}@example.com`.toLowerCase();
    const buyer = await person(`Chidi ${word("nm")}`, email);
    const other = await person(`Dayo ${word("nm")}`);
    const bizName = word("Biz");
    await db.business.create({ data: { id: ids.next(), accountId: other.id, name: bizName, business: bizName, since: NOW } });
    const a = await paidOrder(buyer.id, buyer.auth, maker.id);
    const b = await paidOrder(buyer.id, buyer.auth, maker.id);
    const c = await paidOrder(other.id, other.auth, otherMaker.id);
    const receiver = word("Receiver");
    const wishId = await k.wish(buyer.id, { name: `${receiver} Obi` });
    await http().post(`/v1/admin/concierge-orders/${a.id}/delivery`).set("Authorization", maker.auth).send({ reason: "all made", wishIds: [wishId] }).expect(200);

    const num = `C-${a.id.replace(/-/g, "").slice(-6).toUpperCase()}`;
    expect(ids_(await orders(ops.auth, `q=${num}`))).toContain(a.id);
    expect(ids_(await orders(ops.auth, `q=${num.toLowerCase()}`))).toContain(a.id);
    // who ordered: the person's name, the business name, the whole email
    const name = String((await db.account.findUniqueOrThrow({ where: { id: buyer.id } })).name);
    expect(ids_(await orders(ops.auth, `q=${encodeURIComponent(name)}`))).toEqual([b.id, a.id]);
    expect(ids_(await orders(ops.auth, `q=${bizName}`))).toEqual([c.id]);
    const byEmail = await orders(ops.auth, `q=${encodeURIComponent(email)}`);
    expect(ids_(byEmail)).toEqual([b.id, a.id]);
    expect(JSON.stringify(byEmail.body)).not.toContain(email);
    // a part of an address finds nothing
    expect(ids_(await orders(ops.auth, `q=${encodeURIComponent(email.split("@")[0])}`))).toEqual([]);
    // a name on the order: the receiver of a delivered wish
    expect(ids_(await orders(ops.auth, `q=${receiver}`))).toEqual([a.id]);
    // paging with q
    const p1 = await orders(ops.auth, `q=${encodeURIComponent(name)}&limit=1`);
    expect(ids_(p1)).toEqual([b.id]);
    const p2 = await orders(ops.auth, `q=${encodeURIComponent(name)}&limit=1&cursor=${encodeURIComponent(p1.body.nextCursor)}`);
    expect(ids_(p2)).toEqual([a.id]);
    expect(p2.body.nextCursor).toBeNull();
    // a maker searches only the orders given to them
    expect(ids_(await orders(maker.auth, `q=${encodeURIComponent(name)}`))).toEqual([b.id, a.id]);
    expect(ids_(await orders(otherMaker.auth, `q=${encodeURIComponent(name)}`))).toEqual([]);
    expect(ids_(await orders(maker.auth, `q=${bizName}`))).toEqual([]);
    expect((await orders(ops.auth, `q=${word("none")}`)).body).toEqual({ items: [], nextCursor: null });
    expect((await orders(ops.auth, `q=${"a".repeat(101)}`)).status).toBe(422);
  });

  it("HY3: the short staff list for a hand-over: owner and support only, active staff, id name and role, no email", async () => {
    const support = await staff(["support"], "active", `Sam ${word("s")}`);
    const owner = await staff(["owner"], "active", `Olu ${word("o")}`);
    const gone = await staff(["ops"], "removed", `Gone ${word("g")}`);
    const away = await staff(["ops"], "suspended", `Away ${word("a")}`);
    const two = await staff(["finance", "support"], "active", `Two ${word("t")}`);
    const r = await http().get("/v1/admin/support/staff").set("Authorization", support.auth);
    expect(r.status).toBe(200);
    const items = r.body.items as { id: string; name: string; role: string }[];
    expect(r.body.nextCursor).toBeNull();
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(support.id)).toEqual({ id: support.id, name: expect.stringContaining("Sam"), role: "support" });
    expect(byId.get(owner.id)).toMatchObject({ role: "owner" });
    expect(byId.get(two.id)?.role).toBe("finance");
    expect(byId.has(gone.id)).toBe(false);
    expect(byId.has(away.id)).toBe(false);
    for (const i of items) expect(Object.keys(i).sort()).toEqual(["id", "name", "role"]);
    expect(JSON.stringify(r.body)).not.toContain("@example.com");
    // the owner reads it too; the roles that cannot hand over cannot read it; /admin/team stays owner only
    expect((await http().get("/v1/admin/support/staff").set("Authorization", owner.auth)).status).toBe(200);
    for (const role of ["ops", "maker", "moderator", "finance"] as Role[]) expect((await http().get("/v1/admin/support/staff").set("Authorization", (await staff([role])).auth)).status).toBe(403);
    expect((await http().get("/v1/admin/team").set("Authorization", support.auth)).status).toBe(403);
    expect((await http().get("/v1/admin/support/staff")).status).toBe(401);
    // a person on the list can be handed a thread
    const th = (await thread((await person(`Eve ${word("e")}`)).auth, word("handover"))).body.id as string;
    await http().post(`/v1/admin/support-threads/${th}/assignee`).set("Authorization", support.auth).send({ assigneeId: owner.id, reason: "owner takes it" }).expect(200);
  });

  it("HY4: the order carries paymentId and the provider reference for ops, owner and finance; a maker and the buyer get neither field", async () => {
    const ops = await staff(["ops"]);
    const owner = await staff(["owner"]);
    const finance = await staff(["maker", "finance"]);
    const maker = await staff(["maker"]);
    const buyer = await person(word("buyer"));
    const paid = await paidOrder(buyer.id, buyer.auth, maker.id);
    const unpaid = (await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: word("brief"), count: 1, kind: "single", rush: false })).body.id as string;
    for (const who of [ops, owner]) {
      const one = await http().get(`/v1/admin/concierge/orders/${paid.id}`).set("Authorization", who.auth);
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ paymentId: paid.payId, paymentReference: paid.reference });
      const row = ((await orders(who.auth, "limit=50")).body.items as { id: string }[]).find((o) => o.id === paid.id);
      expect(row).toMatchObject({ paymentId: paid.payId, paymentReference: paid.reference });
      // the unpaid order has the fields, empty
      expect((await http().get(`/v1/admin/concierge/orders/${unpaid}`).set("Authorization", who.auth)).body).toMatchObject({ paymentId: null, paymentReference: null });
    }
    // a staff member who is a maker and may read payments sees the fields on an order given to them
    const mine = await paidOrder(buyer.id, buyer.auth, finance.id);
    const asFinance = await http().get(`/v1/admin/concierge/orders/${mine.id}`).set("Authorization", finance.auth);
    expect(asFinance.status).toBe(200);
    expect(asFinance.body).toMatchObject({ paymentId: mine.payId, paymentReference: mine.reference });
    // the payment the reference names is the order's: the staff payments read opens it
    expect(((await http().get(`/v1/admin/payments?q=${paid.reference}`).set("Authorization", ops.auth)).body.items as { id: string }[]).map((p) => p.id)).toContain(paid.payId);
    // a maker gets neither field, in the read or the list
    const asMaker = await http().get(`/v1/admin/concierge/orders/${paid.id}`).set("Authorization", maker.auth);
    expect(asMaker.status).toBe(200);
    expect(asMaker.body).not.toHaveProperty("paymentId");
    expect(asMaker.body).not.toHaveProperty("paymentReference");
    expect(JSON.stringify(asMaker.body)).not.toContain(paid.reference);
    const listed = ((await orders(maker.auth, "limit=50")).body.items as { id: string }[]).find((o) => o.id === paid.id);
    expect(listed).not.toHaveProperty("paymentReference");
    expect(listed).not.toHaveProperty("paymentId");
    // the buyer's own read carries neither
    const own = await http().get(`/v1/concierge-orders/${paid.id}`).set("Authorization", buyer.auth);
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty("paymentReference");
    expect(own.body).not.toHaveProperty("paymentId");
    // a maker's own delivery answer carries neither
    const w = await k.wish(buyer.id, { name: "Ife Ade" });
    const delivered = await http().post(`/v1/admin/concierge-orders/${paid.id}/delivery`).set("Authorization", maker.auth).send({ reason: "all made", wishIds: [w] });
    expect(delivered.status).toBe(200);
    expect(delivered.body).not.toHaveProperty("paymentReference");
  });

  it("HY5: the maker reads the wishes of THAT order: id, number and the receiver's first name; another maker, another order and an unknown order are 404", async () => {
    const maker = await staff(["maker"]);
    const otherMaker = await staff(["maker"]);
    const ops = await staff(["ops"]);
    const buyer = await person(word("buyer"));
    const stranger = await person(word("stranger"));
    const a = await paidOrder(buyer.id, buyer.auth, maker.id);
    const b = await paidOrder(buyer.id, buyer.auth, maker.id);
    const c = await paidOrder(stranger.id, stranger.auth, otherMaker.id);
    const no = () => word("no").toUpperCase();
    const w1 = await k.wish(buyer.id, { name: "Ada Obi", no: no() });
    const w2 = await k.wish(buyer.id, { name: "  Tunde  ", no: no(), status: "live" });
    const draft = await k.wish(buyer.id, { name: "Draft Wish", status: "draft", no: no() });
    const removed = await k.wish(buyer.id, { name: "Removed Wish", removedAt: NOW, no: no() });
    const theirs = await k.wish(stranger.id, { name: "Not Yours", no: no() });
    const read = (auth: string, id: string) => http().get(`/v1/admin/concierge/orders/${id}/wishes`).set("Authorization", auth);
    const first = await read(maker.auth, a.id);
    expect(first.status).toBe(200);
    expect(first.body.nextCursor).toBeNull();
    const items = first.body.items as { id: string; no: string; firstName: string }[];
    expect(items.map((i) => i.id).sort()).toEqual([w1, w2].sort());
    const row1 = items.find((i) => i.id === w1);
    expect(row1).toEqual({ id: w1, no: (await db.wish.findUniqueOrThrow({ where: { id: w1 } })).no, firstName: "Ada" });
    expect(items.find((i) => i.id === w2)?.firstName).toBe("Tunde");
    for (const gone of [draft, removed, theirs]) expect(items.map((i) => i.id)).not.toContain(gone);
    // delivered under A: A still lists it, B no longer does (another order's wish is never listed)
    await http().post(`/v1/admin/concierge-orders/${a.id}/delivery`).set("Authorization", maker.auth).send({ reason: "made one", wishIds: [w1] }).expect(200);
    const afterB = (await read(maker.auth, b.id)).body.items as { id: string }[];
    expect(afterB.map((i) => i.id)).toEqual([w2]);
    // A is delivered now: it lists exactly what it delivered
    expect(((await read(maker.auth, a.id)).body.items as { id: string }[]).map((i) => i.id)).toEqual([w1]);
    // another maker and a maker with no such order: 404; another order of another buyer lists nothing of this buyer
    expect((await read(otherMaker.auth, a.id)).status).toBe(404);
    expect((await read(maker.auth, c.id)).status).toBe(404);
    expect((await read(maker.auth, ids.next())).status).toBe(404);
    expect((await read(maker.auth, "not-an-id")).status).toBe(404);
    expect(((await read(otherMaker.auth, c.id)).body.items as { id: string }[]).map((i) => i.id)).toEqual([theirs]);
    // ops reads any order's wishes; no sign-in is 401; a role outside Concierge is 403
    expect(((await read(ops.auth, b.id)).body.items as { id: string }[]).map((i) => i.id)).toEqual([w2]);
    expect((await http().get(`/v1/admin/concierge/orders/${a.id}/wishes`)).status).toBe(401);
    expect((await read((await staff(["support"])).auth, a.id)).status).toBe(403);
    // an order with no maker yet lists nothing to deliver
    const unassigned = await paidOrder(buyer.id, buyer.auth, null);
    expect(((await read(ops.auth, unassigned.id)).body.items as unknown[])).toEqual([]);
  });
});
