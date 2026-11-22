import { ENV } from "../../../common/env/env.module";
import type { Env } from "../../../common/env/env";
import { createHash } from "node:crypto";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { NoticesService } from "../../notices/notices.service";
import { EmailSuppression } from "../../notices/suppression";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { replyToken } from "../rules";
import { signSvix } from "../../../common/auth/svix";
import { SupportService } from "../support.service";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2030-05-10T09:00:00.000Z");
const SECRET = `whsec_${Buffer.from("b20-test-signing-secret-0123456789").toString("base64")}`;
const PEPPER = "test-code-pepper-0123456789abcdef0123456";
const ids = new UuidV7Maker();
let n = 0;
const address = () => `b20-${RUN}-${Date.now()}-${++n}@example.test`;
type Row = { id: string; status: string; name: string; from: string; contact: string; email: string; last: string };
const items = (r: { body: unknown }) => (r.body as { items: Row[] }).items;
const msgs = (r: { body: unknown }) => (r.body as { messages: Row[] }).messages;
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("support (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let support: SupportService;
  let notices: NoticesService;
  let supportStaff: { id: string; token: string };
  let mailSeq = 0;

  async function person(): Promise<{ id: string; token: string; email: string }> {
    const id = ids.next();
    const email = address();
    await db.account.create({ data: { id, sides: ["person"], lastSide: "person", name: "Ada", contact: email } });
    const token = `acct-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token, email };
  }
  async function staff(role: "support" | "finance" | "ops"): Promise<{ id: string; token: string }> {
    const s = await makeStaff(db, [role]);
    const token = `staff-${s.id}`;
    t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [role] });
    return { id: s.id, token };
  }
  const open = (token: string, subject = "Where is my link", body = "I did not get the link.") =>
    t.http().post("/v1/support-threads").set(bearer(token)).set("X-Forwarded-For", uniqueAddress()).send({ subject, body });
  const contact = (email: string, ip = uniqueAddress(), subject = "Help please", body = "Please help.") =>
    t.http().post("/v1/support-threads/contact").set("X-Forwarded-For", ip).send({ email, subject, body });
  const thread = (id: string) => db.supportThread.findUniqueOrThrow({ where: { id } });
  const messages = (id: string) => db.supportMessage.findMany({ where: { threadId: id }, orderBy: { id: "asc" } });

  /** A signed event as Resend would send it (the stand-in for the provider). */
  function event(type: string, data: Record<string, unknown>, o: { id?: string; at?: number; secret?: string; raw?: string } = {}) {
    const raw = o.raw ?? JSON.stringify({ type, data });
    const id = o.id ?? `msg_b20_${RUN}_${++mailSeq}_${Date.now()}`;
    const ts = o.at ?? Math.floor(t.clock.now().getTime() / 1000);
    return t.http().post("/v1/webhooks/email").set("content-type", "application/json").set("svix-id", id).set("svix-timestamp", String(ts))
      .set("svix-signature", signSvix(o.secret ?? SECRET, raw, id, ts)).send(raw);
  }
  const inbound = (data: Record<string, unknown>, o: { id?: string } = {}) => event("email.received", data, o);

  beforeAll(async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    support = t.app.get(SupportService);
    notices = t.app.get(NoticesService);
    await seedRoleTable(db);
    supportStaff = await staff("support");
  });
  afterAll(async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    await t.close();
  });
  beforeEach(() => t.clock.set(NOW));

  describe("case 1: threads", () => {
    it("a signed-in person opens a thread: shape, own address, first message", async () => {
      const a = await person();
      const r = await open(a.token);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ accountId: a.id, subject: "Where is my link", status: "open", state: "open", contact: a.email, name: "Ada", priority: "normal" });
      expect(r.body.messages).toHaveLength(1);
      expect(r.body.messages[0]).toMatchObject({ from: "customer", body: "I did not get the link." });
      expect(r.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });
    it("401 without a token, 422 with fields for a bad body, non-canonical email normalised on the contact page", async () => {
      expect((await t.http().post("/v1/support-threads").send({ subject: "x", body: "y" })).status).toBe(401);
      const a = await person();
      const bad = await open(a.token, "  ", "<b>hi</b>");
      expect(bad.status).toBe(422);
      expect(Object.keys(bad.body.error.fields).sort()).toEqual(["body", "subject"]);
      expect((await open(a.token, "ok", "x".repeat(5001))).status).toBe(422);
      expect((await open(a.token, "ok", "a\u0000b")).status).toBe(422);
      const mixed = `  Mixed.${address().toUpperCase()}  `;
      const c = await contact(mixed);
      expect(c.status).toBe(201);
      expect(c.body.contact).toBe(mixed.trim().toLowerCase());
      expect((await contact("not-an-email")).status).toBe(422);
    });
    it("the person sees only their own thread: another's is 404, an id that is not a uuid is 404", async () => {
      const a = await person();
      const b = await person();
      const th = (await open(a.token)).body.id as string;
      expect((await t.http().post("/v1/support-messages").set(bearer(b.token)).send({ threadId: th, body: "mine now" })).status).toBe(404);
      expect((await t.http().post("/v1/support-messages").set(bearer(a.token)).send({ threadId: "nope", body: "x" })).status).toBe(404);
      expect((await t.http().post("/v1/support-messages").send({ threadId: th, body: "x" })).status).toBe(401);
      expect(await messages(th)).toHaveLength(1);
    });
    it("a staff reply goes out by email through the notices path with a reply address, and shows in the thread; open, waiting, closed, reopened by a reply", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      const r = await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "We sent it again.", reason: "answering" });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe("waiting");
      expect(r.body.state).toBe("open");
      expect(msgs(r).map((m) => m.from)).toEqual(["customer", "staff"]);
      const mail = t.email.lastTo(a.email) as unknown as { subject: string; text: string; replyTo: string };
      expect(mail.subject).toBe("Re: Where is my link");
      expect(mail.text).toContain("We sent it again.");
      expect(mail.replyTo).toBe(`reply+${replyToken(PEPPER, th, a.email)}@example.test`);
      const log = await db.messageDelivery.findFirstOrThrow({ where: { to: a.email, templateKey: "support" } });
      expect(log).toMatchObject({ purpose: "support", status: "delivered", channel: "email" });
      // the customer answers: the thread is open again
      expect((await t.http().post("/v1/support-messages").set(bearer(a.token)).send({ threadId: th, body: "Thanks, got it." })).status).toBe(201);
      expect((await thread(th)).status).toBe("open");
      // close, then a reply opens it again
      const closed = await t.http().post(`/v1/admin/support/threads/${th}/state`).set(bearer(supportStaff.token)).send({ state: "closed", reason: "all done" });
      expect(closed.body).toMatchObject({ status: "closed", state: "closed" });
      expect((await t.http().post("/v1/support-messages").set(bearer(a.token)).send({ threadId: th, body: "One more thing." })).status).toBe(201);
      expect((await thread(th)).status).toBe("open");
    });
  });

  describe("case 2 and 3: reply by email and the webhook", () => {
    async function waiting() {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "Tell us more.", reason: "asking" });
      return { a, th, to: `reply+${replyToken(PEPPER, th, a.email)}@example.test` };
    }

    it("an answer with the token in the address lands in the thread and opens it", async () => {
      const { a, th, to } = await waiting();
      const r = await inbound({ from: `Ada <${a.email.toUpperCase()}>`, to: [to], subject: "totally different subject", text: "Here is more." });
      expect(r.status).toBe(200);
      const ms = await messages(th);
      expect(ms.map((m) => m.from)).toEqual(["customer", "staff", "customer"]);
      expect(ms[2].body).toBe("Here is more.");
      expect((await thread(th)).status).toBe("open");
    });
    it("the token may come in a header instead of the address", async () => {
      const { a, th, to } = await waiting();
      const token = /reply\+([0-9a-f]+)@/.exec(to)![1];
      await inbound({ from: a.email, to: ["support@example.test"], subject: "x", text: "By header.", headers: { "X-Firstwish-Reply-Token": token } });
      expect((await messages(th)).at(-1)!.body).toBe("By header.");
    });
    it("never by the subject: the thread's own subject with no token starts a new thread", async () => {
      const { a, th } = await waiting();
      const before = (await messages(th)).length;
      await inbound({ from: a.email, to: ["support@example.test"], subject: "Re: Where is my link", text: "No token here." });
      expect(await messages(th)).toHaveLength(before);
      const mine = await db.supportThread.findMany({ where: { contact: a.email } });
      expect(mine).toHaveLength(2);
    });
    it("a token with another sender's address starts a new thread and never lands in someone else's", async () => {
      const { a, th, to } = await waiting();
      const before = (await messages(th)).length;
      const other = address();
      await inbound({ from: other, to: [to], subject: "hello", text: "I found this address." });
      expect(await messages(th)).toHaveLength(before);
      const theirs = await db.supportThread.findMany({ where: { contact: other } });
      expect(theirs).toHaveLength(1);
      expect(theirs[0].id).not.toBe(th);
      expect(theirs[0].accountId).toBeNull();
      // a made-up mark is no token either
      await inbound({ from: a.email, to: [`reply+${th.replace(/-/g, "")}${"0".repeat(20)}@example.test`], subject: "s", text: "forged mark" });
      expect((await messages(th)).some((m) => m.body === "forged mark")).toBe(false);
    });
    it("a machine's mail is never a thread; text with control characters is cleaned", async () => {
      const a = address();
      await inbound({ from: a, to: ["support@example.test"], subject: "Out of office", text: "away", headers: { "Auto-Submitted": "auto-replied" } });
      expect(await db.supportThread.count({ where: { contact: a } })).toBe(0);
      await inbound({ from: a, to: ["support@example.test"], subject: "Real\nsubject", text: "ok\u0000 then" });
      const th = await db.supportThread.findFirstOrThrow({ where: { contact: a } });
      expect(th.subject).toBe("Real subject");
      expect(th.body).toBe("ok then");
    });
    it("a bad signature, a wrong secret, an old timestamp and a missing header are refused and change nothing", async () => {
      const a = address();
      const data = { from: a, to: ["support@example.test"], subject: "s", text: "refused" };
      expect((await event("email.received", data, { secret: `whsec_${Buffer.from("another secret").toString("base64")}` })).status).toBe(401);
      expect((await event("email.received", data, { at: Math.floor(NOW.getTime() / 1000) - 600 })).status).toBe(401);
      expect((await event("email.received", data, { at: Math.floor(NOW.getTime() / 1000) + 600 })).status).toBe(401);
      expect((await t.http().post("/v1/webhooks/email/inbound").set("content-type", "application/json").send({ type: "email.received", data })).status).toBe(401);
      const tampered = await t.http().post("/v1/webhooks/email/inbound").set("content-type", "application/json").set("svix-id", "msg_x1").set("svix-timestamp", String(Math.floor(NOW.getTime() / 1000)))
        .set("svix-signature", signSvix(SECRET, "{}", "msg_x1", Math.floor(NOW.getTime() / 1000))).send(JSON.stringify({ type: "email.received", data }));
      expect(tampered.status).toBe(401);
      expect(await db.supportThread.count({ where: { contact: a } })).toBe(0);
      expect(await db.webhookEvent.count({ where: { provider: "resend", eventId: "msg_x1" } })).toBe(0);
    });
    it("a replay changes nothing: stored once by event id, also two at once", async () => {
      const a = address();
      const data = { from: a, to: ["support@example.test"], subject: "s", text: "once only" };
      const id = `msg_replay_${RUN}_${Date.now()}`;
      expect((await inbound(data, { id })).status).toBe(200);
      expect((await inbound(data, { id })).status).toBe(200);
      const b = address();
      const id2 = `msg_replay2_${RUN}_${Date.now()}`;
      const both = await Promise.all([1, 2, 3, 4].map(() => inbound({ ...data, from: b }, { id: id2 })));
      expect(both.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(await db.supportThread.count({ where: { contact: a } })).toBe(1);
      expect(await db.supportThread.count({ where: { contact: b } })).toBe(1);
      expect(await db.webhookEvent.count({ where: { provider: "resend", eventId: { in: [id, id2] } } })).toBe(2);
      const stored = await db.webhookEvent.findFirstOrThrow({ where: { provider: "resend", eventId: id } });
      expect(JSON.stringify(stored.payload)).not.toContain(a);
    });
    it("no signing secret: refused (503), never let through", async () => {
      const env = t.app.get<Env>(ENV);
      delete env.RESEND_WEBHOOK_SECRET;
      const r = await event("email.received", { from: address(), to: ["x@example.test"], text: "t" });
      env.RESEND_WEBHOOK_SECRET = SECRET;
      expect(r.status).toBe(503);
    });
    it("a person's own address on the contact page or in mail joins their account's threads", async () => {
      const a = await person();
      const c = await contact(a.email);
      expect(c.body.accountId).toBe(a.id);
      await inbound({ from: a.email, to: ["support@example.test"], subject: "mail", text: "by mail" });
      const rows = await db.supportThread.findMany({ where: { contact: a.email } });
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.accountId === a.id)).toBe(true);
    });
  });

  describe("case 4: delivery news", () => {
    async function delivery(over: { purpose?: "wish_delivery" | "support" | "opens"; wishId?: string | null; to?: string; status?: "sent" | "delivered" } = {}) {
      const id = ids.next();
      const to = over.to ?? address();
      const providerMessageId = `prov_${id}`;
      await db.messageDelivery.create({
        data: {
          id, templateKey: "opens", channel: "email", to, purpose: over.purpose ?? "wish_delivery", status: over.status ?? "sent", providerMessageId, attempts: 1,
          idempotencyKey: `b20-${id}`, vars: { data: {}, ...(over.wishId ? { wishId: over.wishId } : {}) },
        },
      });
      return { id, to, providerMessageId };
    }
    async function paidWish() {
      const owner = await person();
      const wishId = ids.next();
      await db.wish.create({ data: { id: wishId, accountId: owner.id, status: "sealed", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos" } as never });
      const paymentId = ids.next();
      await db.payment.create({
        data: {
          id: paymentId, accountId: owner.id, payerContact: owner.email, purpose: "ticket", lines: [], amountKobo: 100000n, currency: "NGN", priceBookVersion: 1, status: "succeeded",
          provider: "paystack", providerReference: `fw-${paymentId}`, idempotencyKey: `b20-${paymentId}`, flags: ["note"],
        },
      });
      await db.purchaseGrant.create({ data: { id: ids.next(), paymentId, sku: "x", kind: "wish", accountId: owner.id, wishId, startsAt: NOW, createdAt: NOW } });
      return { wishId, paymentId };
    }

    it("delivered updates the log", async () => {
      const d = await delivery();
      expect((await event("email.delivered", { email_id: d.providerMessageId })).status).toBe(200);
      expect((await db.messageDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("delivered");
    });
    it("a wish's delivery email that bounces for good fails and puts refund_due on its payment; nothing refunds by itself; a replay adds nothing", async () => {
      const { wishId, paymentId } = await paidWish();
      const d = await delivery({ wishId });
      const id = `msg_bounce_${RUN}_${Date.now()}`;
      const r = await event("email.bounced", { email_id: d.providerMessageId, bounce: { type: "Permanent", message: `The address ${d.to} does not exist` } }, { id });
      expect(r.status).toBe(200);
      await event("email.bounced", { email_id: d.providerMessageId, bounce: { type: "Permanent" } }, { id });
      const row = await db.messageDelivery.findUniqueOrThrow({ where: { id: d.id } });
      expect(row.status).toBe("failed");
      expect(row.error).toMatch(/^Bounced/);
      expect(row.error).not.toContain(d.to);
      const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(p.flags.filter((f) => f === "refund_due")).toHaveLength(1);
      expect(p.flags).toContain("note");
      expect(p.status).toBe("succeeded");
      expect(await db.refund.count({ where: { paymentId } })).toBe(0);
    });
    it("a bounce of another kind of email, or a soft bounce, flags no payment", async () => {
      const { wishId, paymentId } = await paidWish();
      const other = await delivery({ purpose: "opens", wishId });
      await event("email.bounced", { email_id: other.providerMessageId, bounce: { type: "Permanent" } });
      const soft = await delivery({ wishId });
      await event("email.bounced", { email_id: soft.providerMessageId, bounce: { type: "Transient" } });
      expect((await db.messageDelivery.findUniqueOrThrow({ where: { id: soft.id } })).status).toBe("sent");
      expect((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).flags).toEqual(["note"]);
    });
    it("a mail id no delivery has yet is refused so the provider tries again, and keeps nothing", async () => {
      const id = `msg_unknown_${RUN}_${Date.now()}`;
      expect((await event("email.delivered", { email_id: "prov_nobody" }, { id })).status).toBe(409);
      expect(await db.webhookEvent.count({ where: { provider: "resend", eventId: id } })).toBe(0);
    });
    it("a complaint stops further email to that address: a reply is refused, a queued notice is dropped", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "First answer.", reason: "answering" });
      const first = await db.messageDelivery.findFirstOrThrow({ where: { to: a.email, templateKey: "support" } });
      // the stand-in numbers its mail ids from 1 in every app, and specs share a database: give this one an id of its own
      const sentLog = await db.messageDelivery.update({ where: { id: first.id }, data: { providerMessageId: `prov_${first.id}` } });
      expect((await event("email.complained", { email_id: sentLog.providerMessageId })).status).toBe(200);
      expect(await t.app.get(EmailSuppression).has(a.email)).toBe(true);
      const again = await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "Second answer.", reason: "answering" });
      expect(again.status).toBe(409);
      expect((await messages(th)).filter((m) => m.from === "staff")).toHaveLength(1);
      const sentBefore = t.email.sent.length;
      const r = await notices.send(undefined, { template: "invite", toEmail: a.email, data: { code: "123456" }, key: `b20-after-${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      await notices.deliverNow(r.deliveryId);
      expect(t.email.sent.length).toBe(sentBefore);
      expect(await db.messageDelivery.findUniqueOrThrow({ where: { id: r.deliveryId } })).toMatchObject({ status: "dropped" });
      // the table holds a hash, not the address
      const rows = await db.$queryRaw<{ hash: string }[]>`SELECT hash FROM email_suppression`;
      expect(rows.some((x) => x.hash.includes("@"))).toBe(false);
    });
  });

  describe("case 5: limits", () => {
    it("the contact page lets 5 threads a day in per email, the sixth is 429 with Retry-After; a new day starts again", async () => {
      const email = address();
      for (let i = 0; i < 5; i++) expect((await contact(email)).status).toBe(201);
      const six = await contact(email);
      expect(six.status).toBe(429);
      expect(Number(six.headers["retry-after"])).toBeGreaterThan(0);
      expect(await db.supportThread.count({ where: { contact: email } })).toBe(5);
      // the +tag and the letter case are the same person
      expect((await contact(email.replace("@", "+x@").toUpperCase())).status).toBe(429);
      t.clock.advance(24 * 3600 * 1000);
      expect((await contact(email)).status).toBe(201);
    });
    it("5 a day per address too, whatever the email", async () => {
      const ip = uniqueAddress();
      for (let i = 0; i < 5; i++) expect((await contact(address(), ip)).status).toBe(201);
      expect((await contact(address(), ip)).status).toBe(429);
    });
    it("two requests at once cannot both take the last place: 12 at once let exactly 5 in", async () => {
      const email = address();
      const rs = await Promise.all(Array.from({ length: 12 }, () => contact(email)));
      expect(rs.filter((r) => r.status === 201)).toHaveLength(5);
      expect(rs.filter((r) => r.status === 429)).toHaveLength(7);
      expect(await db.supportThread.count({ where: { contact: email } })).toBe(5);
    });
    it("mail that came in is counted per email too, and a refused one leaves no half count", async () => {
      const from = address();
      for (let i = 0; i < 6; i++) await inbound({ from, to: ["support@example.test"], subject: `s${i}`, text: `t${i}` });
      expect(await db.supportThread.count({ where: { contact: from } })).toBe(5);
    });
    it("a database that cannot be reached refuses the request (fails closed)", async () => {
      const spy = jest.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("database down"));
      const email = address();
      const r = await contact(email);
      spy.mockRestore();
      expect(r.status).toBe(500);
      expect(await db.supportThread.count({ where: { contact: email } })).toBe(0);
    });
  });

  describe("case 6: staff", () => {
    it("401, 403 for a role the registry does not name, 403 for a section the role table does not open", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      const fin = await staff("finance");
      expect((await t.http().get("/v1/admin/support/counts")).status).toBe(401);
      expect((await t.http().get("/v1/admin/support/counts").set(bearer(fin.token))).status).toBe(403);
      expect((await t.http().get("/v1/admin/support/threads").set(bearer(a.token))).status).toBe(403);
      const ops = await staff("ops");
      expect((await t.http().post(`/v1/admin/support-threads/${th}/assignee`).set(bearer(ops.token)).send({ assigneeId: ops.id, reason: "mine" })).status).toBe(403);
    });
    it("counts for the menu, the list with filters, contacts masked, the thread with its messages", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      const c1 = await t.http().get("/v1/admin/support/counts").set(bearer(supportStaff.token));
      expect(c1.body).toEqual({ all: expect.any(Number), open: expect.any(Number), waiting: expect.any(Number), closed: expect.any(Number) });
      expect(c1.body.all).toBe(c1.body.open + c1.body.waiting + c1.body.closed);
      await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "Hello.", reason: "answering" });
      const c2 = await t.http().get("/v1/admin/support/counts").set(bearer(supportStaff.token));
      expect(c2.body.waiting).toBe(c1.body.waiting + 1);
      expect(c2.body.open).toBe(c1.body.open - 1);
      const list = await t.http().get("/v1/admin/support/threads?status=waiting&limit=2").set(bearer(supportStaff.token));
      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      expect(items(list).every((x) => x.status === "waiting")).toBe(true);
      const mine = items(await t.http().get("/v1/admin/support/threads?limit=50").set(bearer(supportStaff.token))).find((x) => x.id === th)!;
      expect(mine.contact).toBe(`${a.email[0]}***${a.email.slice(a.email.indexOf("@"))}`);
      expect(mine.email).toBe(mine.contact);
      expect(mine.last).toBe("Hello.");
      const one = await t.http().get(`/v1/admin/support/threads/${th}`).set(bearer(supportStaff.token));
      expect(one.body.messages).toHaveLength(2);
      expect(JSON.stringify(one.body)).not.toContain(a.email);
      expect((await t.http().get("/v1/admin/support/threads/not-a-uuid").set(bearer(supportStaff.token))).status).toBe(404);
      expect((await t.http().get(`/v1/admin/support/threads/${ids.next()}`).set(bearer(supportStaff.token))).status).toBe(404);
      expect((await t.http().get("/v1/admin/support/threads?status=bogus").set(bearer(supportStaff.token))).status).toBe(422);
      expect((await t.http().get("/v1/admin/support/threads?cursor=bogus").set(bearer(supportStaff.token))).status).toBe(422);
    });
    it("a change needs a reason (422) and writes one audit row; the same state again writes none", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      const auditCount = () => db.auditEntry.count({ where: { subjectId: th } });
      expect((await t.http().post(`/v1/admin/support/threads/${th}/state`).set(bearer(supportStaff.token)).send({ state: "closed", reason: "no" })).status).toBe(422);
      expect((await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "  ", reason: "answering" })).status).toBe(422);
      expect((await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "fine", reason: "x" })).status).toBe(422);
      expect(await auditCount()).toBe(0);
      expect((await thread(th)).status).toBe("open");
      await t.http().post(`/v1/admin/support/threads/${th}/state`).set(bearer(supportStaff.token)).send({ state: "closed", reason: "finished" });
      expect(await auditCount()).toBe(1);
      await t.http().post(`/v1/admin/support/threads/${th}/state`).set(bearer(supportStaff.token)).send({ state: "closed", reason: "finished" });
      expect(await auditCount()).toBe(1);
      await t.http().post(`/v1/admin/support/threads/${th}/state`).set(bearer(supportStaff.token)).send({ state: "open", reason: "reopen it" });
      expect(await auditCount()).toBe(2);
      const row = await db.auditEntry.findFirstOrThrow({ where: { subjectId: th }, orderBy: { id: "desc" } });
      expect(row).toMatchObject({ action: "support.reopen", section: "/admin/support", reason: "reopen it", actorId: supportStaff.id });
      expect(JSON.stringify(row)).not.toContain(a.email);
    });
    it("give to a staff member: only an active one; one audit row; the same again none", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      const mate = await staff("support");
      const gone = await makeStaff(db, ["support"], "suspended");
      const url = `/v1/admin/support-threads/${th}/assignee`;
      expect((await t.http().post(url).set(bearer(supportStaff.token)).send({ assigneeId: gone.id, reason: "give it" })).status).toBe(422);
      expect((await t.http().post(url).set(bearer(supportStaff.token)).send({ assigneeId: "nope", reason: "give it" })).status).toBe(422);
      const r = await t.http().post(url).set(bearer(supportStaff.token)).send({ assigneeId: mate.id, reason: "give it" });
      expect(r.status).toBe(200);
      expect(r.body.assigneeId).toBe(mate.id);
      await t.http().post(url).set(bearer(supportStaff.token)).send({ assigneeId: mate.id, reason: "give it" });
      expect(await db.auditEntry.count({ where: { subjectId: th, action: "support.assign" } })).toBe(1);
      const mineOnly = await t.http().get(`/v1/admin/support/threads?assigneeId=${mate.id}`).set(bearer(supportStaff.token));
      expect(items(mineOnly).map((x) => x.id)).toEqual([th]);
    });
    it("saved replies are listed for staff", async () => {
      await db.savedReply.createMany({ data: [{ id: ids.next(), name: "b20 a", text: "First text." }], skipDuplicates: true });
      const r = await t.http().get("/v1/admin/support/saved-replies").set(bearer(supportStaff.token));
      expect(r.status).toBe(200);
      expect(items(r).find((x) => x.name === "b20 a")).toMatchObject({ text: "First text." });
      expect((await t.http().get("/v1/admin/support/saved-replies")).status).toBe(401);
    });
    it("two staff replying at once both land, one after the other, each with its own email", async () => {
      const a = await person();
      const th = (await open(a.token)).body.id as string;
      const other = await staff("support");
      const rs = await Promise.all([
        t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "Reply from one.", reason: "answering" }),
        t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(other.token)).send({ text: "Reply from two.", reason: "answering" }),
      ]);
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      const ms = await messages(th);
      expect(ms.filter((m) => m.from === "staff").map((m) => m.body).sort()).toEqual(["Reply from one.", "Reply from two."]);
      expect(ms.map((m) => m.id)).toEqual([...ms.map((m) => m.id)].sort());
      expect(await db.messageDelivery.count({ where: { to: a.email, templateKey: "support" } })).toBe(2);
      expect(await db.auditEntry.count({ where: { subjectId: th, action: "support.reply" } })).toBe(2);
    });
  });

  describe("case 7: erase", () => {
    it("an erased account's threads lose their personal data, and nothing can be added or answered", async () => {
      const a = await person();
      const th = (await open(a.token, "My private subject", "My private words")).body.id as string;
      await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "Our private answer.", reason: "answering" });
      await t.app.get(AccountErasureService).erase(a.id, { actor: { type: "system", id: null, requestId: "b20" }, reason: null });
      const row = await thread(th);
      expect(row).toMatchObject({ contact: "", subject: "", body: null, text: null });
      expect((await messages(th)).every((m) => m.body === "")).toBe(true);
      // the email we sent was blanked with the account: no address, no values
      expect(await db.messageDelivery.count({ where: { to: a.email } })).toBe(0);
      const sent = await db.messageDelivery.findMany({ where: { templateKey: "support", idempotencyKey: { in: (await db.supportMessage.findMany({ where: { threadId: th, from: "staff" } })).map((m) => `support-reply:${m.id}`) } } });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: "", vars: null });
      expect((await t.http().post("/v1/support-messages").set(bearer(a.token)).send({ threadId: th, body: "back" })).status).toBe(401);
      const staffView = await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(supportStaff.token)).send({ text: "Anyone?", reason: "answering" });
      expect(staffView.status).toBe(422);
      // mail carrying the old token no longer matches anything
      await inbound({ from: a.email, to: [`reply+${replyToken(PEPPER, th, a.email)}@example.test`], subject: "s", text: "I am back" });
      expect((await messages(th)).some((m) => m.body === "I am back")).toBe(false);
    });
    it("the new tables hold hashes only: no address and no network is kept", async () => {
      const email = address();
      await contact(email);
      const rows = await db.$queryRaw<{ key: string }[]>`SELECT key FROM support_intake_count`;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.key))).toBe(true);
      expect(createHash("sha256").update(email).digest("hex")).not.toBe(rows[0].key);
      expect(support).toBeDefined();
    });
  });
});
