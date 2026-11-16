import { ENV } from "../../../common/env/env.module";
import type { Env } from "../../../common/env/env";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { NoticesService } from "../../notices/notices.service";
import { EmailSuppression } from "../../notices/suppression";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { isOwnAddress, replyToken } from "../rules";
import { signSvix } from "../../../common/auth/svix";

const NOW = new Date("2031-03-12T09:00:00.000Z");
const SECRET = `whsec_${Buffer.from("pb20-test-signing-secret-0123456789").toString("base64")}`;
const PEPPER = "test-code-pepper-0123456789abcdef0123456";
const ids = new UuidV7Maker();
let n = 0;
const address = () => `pb20-${process.pid}-${Date.now()}-${++n}@example.test`;
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("P-B20 patch (DA1 DA2 DA3)", () => {
  let t: TestApp;
  let db: PrismaService;
  let staffTok: string;

  function event(type: string, data: Record<string, unknown>, secret = SECRET) {
    const raw = JSON.stringify({ type, data });
    const id = `msg_pb20_${process.pid}_${++n}_${Date.now()}`;
    const ts = Math.floor(t.clock.now().getTime() / 1000);
    return t.http().post("/v1/webhooks/email").set("content-type", "application/json").set("svix-id", id).set("svix-timestamp", String(ts))
      .set("svix-signature", signSvix(secret, raw, id, ts)).send(raw);
  }
  const inbound = (data: Record<string, unknown>) => event("email.received", data);
  async function waiting() {
    const id = ids.next();
    const email = address();
    await db.account.create({ data: { id, sides: ["person"], lastSide: "person", name: "Ada", contact: email } });
    t.tokens.set(`acct-${id}`, { kind: "user", accountId: id, sides: ["person"] });
    const th = (await t.http().post("/v1/support-threads").set(bearer(`acct-${id}`)).set("X-Forwarded-For", uniqueAddress()).send({ subject: "Help", body: "Hello." })).body.id as string;
    await t.http().post(`/v1/admin/support/threads/${th}/reply`).set(bearer(staffTok)).send({ text: "Tell us more.", reason: "asking" });
    const token = replyToken(PEPPER, th, email);
    return { email, th, token, to: `reply+${token}@example.test` };
  }
  const threadsFrom = (a: string) => db.supportThread.count({ where: { contact: a } });

  beforeAll(async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    await seedRoleTable(db);
    const s = await makeStaff(db, ["support"]);
    staffTok = `staff-${s.id}`;
    t.tokens.set(staffTok, { kind: "staff", staffId: s.id, roles: ["support"] });
  });
  afterAll(async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    await t.close();
  });
  beforeEach(() => t.clock.set(NOW));

  describe("DA1: our own addresses and bounces", () => {
    const own = ["wishes@example.test", "Firstwish <WISHES@example.test>", "reply+abc@example.test", "reply@example.test", "mailer-daemon@other.test", "postmaster@other.test"];
    // The thread table is shared with every other spec in the run's database: each mail here carries its own words and the
    // count is of the threads that hold them, never of the whole table.
    const threadsWith = (words: string) => db.supportThread.count({ where: { body: { contains: words } } });
    it.each(own)("mail from %s starts no thread, with or without Auto-Submitted", async (from) => {
      const words = `own-${process.pid}-${++n}-${Date.now()}`;
      expect((await inbound({ from, to: ["support@example.test"], subject: "x", text: words })).status).toBe(200);
      expect((await inbound({ from, to: ["support@example.test"], subject: "x", text: words, headers: { "Auto-Submitted": "no" } })).status).toBe(200);
      expect(await threadsWith(words)).toBe(0);
    });
    it("an empty sender starts no thread", async () => {
      const words = `empty-${process.pid}-${++n}-${Date.now()}`;
      await inbound({ from: "", to: ["support@example.test"], subject: "x", text: words });
      await inbound({ from: "<>", to: ["support@example.test"], subject: "x", text: words });
      expect(await threadsWith(words)).toBe(0);
    });
    it("a delivery report by content type starts no thread and never lands in one, from an ordinary sender", async () => {
      const a = address();
      const w = await waiting();
      const ct = { "Content-Type": "multipart/report; report-type=delivery-status" };
      await inbound({ from: a, to: ["support@example.test"], subject: "Undelivered", text: "bounce", headers: ct });
      await inbound({ from: w.email, to: [w.to], subject: "Undelivered", text: "bounce body", headers: ct });
      expect(await threadsFrom(a)).toBe(0);
      expect(await db.supportMessage.count({ where: { threadId: w.th } })).toBe(2);
    });
    it("an ordinary person still starts a thread", async () => {
      const a = address();
      await inbound({ from: a, to: ["support@example.test"], subject: "Real", text: "hello" });
      expect(await threadsFrom(a)).toBe(1);
    });
    it("a staff reply to a thread whose contact is one of ours is 422 and sends nothing", async () => {
      const id = ids.next();
      await db.supportThread.create({ data: { id, accountId: null, contact: "wishes@example.test", subject: "s", status: "open", priority: "normal", body: "b", text: "b", createdAt: NOW, updatedAt: NOW } });
      const sent = t.email.sent.length;
      const r = await t.http().post(`/v1/admin/support/threads/${id}/reply`).set(bearer(staffTok)).send({ text: "Hi", reason: "answering" });
      expect(r.status).toBe(422);
      expect(t.email.sent.length).toBe(sent);
      expect(await db.supportMessage.count({ where: { threadId: id } })).toBe(0);
    });
  });

  describe("DA2: suppression uses the canonical address", () => {
    it("a +tag or another case of a complained address gets no email; another address is untouched", async () => {
      const sup = t.app.get(EmailSuppression);
      const notices = t.app.get(NoticesService);
      const local = `pb20c${process.pid}${Date.now()}`;
      await sup.add(`${local}@example.test`, "complained");
      expect(await sup.has(`${local}+news@example.test`)).toBe(true);
      expect(await sup.has(`${local.toUpperCase()}@Example.Test`)).toBe(true);
      expect(await sup.has(`${local}x@example.test`)).toBe(false);
      for (const [to, dropped] of [[`${local}+promo@example.test`, true], [`${local.toUpperCase()}@example.test`, true], [address(), false]] as [string, boolean][]) {
        const r = await notices.send(undefined, { template: "invite", toEmail: to, data: { code: "123456" }, key: `pb20-${ids.next()}` });
        if (r.status !== "queued") throw new Error("not queued");
        const before = t.email.sent.length;
        await notices.deliverNow(r.deliveryId);
        expect(t.email.sent.length - before).toBe(dropped ? 0 : 1);
        expect((await db.messageDelivery.findUniqueOrThrow({ where: { id: r.deliveryId } })).status).toBe(dropped ? "dropped" : "delivered");
      }
    });
  });

  describe("DA3: secret and token limit", () => {
    it('"whsec_" with nothing after it is 503, like no secret', async () => {
      const env = t.app.get<Env>(ENV);
      env.RESEND_WEBHOOK_SECRET = "whsec_";
      const r = await event("email.received", { from: address(), to: ["x@example.test"], text: "t" }, "whsec_");
      env.RESEND_WEBHOOK_SECRET = SECRET;
      expect(r.status).toBe(503);
    });
    it("the 31st message in a day by one token is refused and stored nowhere; the next day starts again", async () => {
      const w = await waiting();
      const base = await db.supportMessage.count({ where: { threadId: w.th } });
      for (let i = 0; i < 31; i++) expect((await inbound({ from: w.email, to: [w.to], subject: "s", text: `more ${i}` })).status).toBe(200);
      expect(await db.supportMessage.count({ where: { threadId: w.th } })).toBe(base + 30);
      expect(await db.supportMessage.count({ where: { threadId: w.th, body: "more 30" } })).toBe(0);
      expect(await threadsFrom(w.email)).toBe(1);
      t.clock.set(new Date(NOW.getTime() + 86_400_000));
      await inbound({ from: w.email, to: [w.to], subject: "s", text: "next day" });
      expect(await db.supportMessage.count({ where: { threadId: w.th, body: "next day" } })).toBe(1);
    });
    it("31 at once: exactly 30 land", async () => {
      const w = await waiting();
      const base = await db.supportMessage.count({ where: { threadId: w.th } });
      await Promise.all(Array.from({ length: 31 }, (_, i) => inbound({ from: w.email, to: [w.to], subject: "s", text: `par ${i}` })));
      expect(await db.supportMessage.count({ where: { threadId: w.th } })).toBe(base + 30);
    });
  });
});

describe("B20 isOwnAddress: the reply box is ours only on the mail domain", () => {
  const FROM = "Firstwish <hello@mail.firstwish.test>";
  it("reply@ and reply+x@ on the mail domain are ours; reply@ on any other domain is a person", () => {
    expect(isOwnAddress(FROM, "reply@mail.firstwish.test")).toBe(true);
    expect(isOwnAddress(FROM, "reply+abc@mail.firstwish.test")).toBe(true);
    expect(isOwnAddress(FROM, "Reply@Mail.Firstwish.Test")).toBe(true);
    expect(isOwnAddress(FROM, "reply@gmail.com")).toBe(false);
    expect(isOwnAddress(FROM, "reply+abc@gmail.com")).toBe(false);
    expect(isOwnAddress(FROM, "noreply@gmail.com")).toBe(true);
    expect(isOwnAddress(FROM, "mailer-daemon@anywhere.org")).toBe(true);
    expect(isOwnAddress(FROM, "ada@gmail.com")).toBe(false);
  });
});
