import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { ProviderError } from "../../../common/ports/adapters/http";
import { ResendEmail } from "../../../common/ports/adapters/resend.adapter";
import { PortTimeoutError } from "../../../common/ports/time-limit";
import type { StaffRole } from "../../../common/auth/principal";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { BANNED_WORDS, placeholdersOf, TEMPLATES, TEMPLATE_KEYS, wordingProblem } from "../catalog";
import { classify, NoticesService } from "../notices.service";
import { atLocalHour } from "../zoned";

const ROOT = join(__dirname, "../../../..");
const ids = new UuidV7Maker();
const NOW = new Date("2030-03-10T08:00:00.000Z");
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
let n = 0;
const address = () => `b11-${process.pid}-${Date.now()}-${++n}@example.test`;

describe("notice wording (seed)", () => {
  const seed = JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/MessageTemplate.json"), "utf8")) as { rows: { key: string; subject: string; body: string; channel: string }[] };

  it("the five messages are all there, by email only", () => {
    expect(seed.rows.map((r) => r.key).sort()).toEqual([...TEMPLATE_KEYS].sort());
    expect(new Set(seed.rows.map((r) => r.channel))).toEqual(new Set(["email"]));
  });
  it("uses only placeholders the code fills, and each message has every one it needs", () => {
    for (const r of seed.rows) {
      const spec = TEMPLATES[r.key as keyof typeof TEMPLATES];
      const used = [...placeholdersOf(r.subject), ...placeholdersOf(r.body)];
      for (const u of used) expect(spec.allowed).toContain(u);
      for (const need of spec.needs) expect(used).toContain(need);
    }
  });
  it("obeys the owner's rules: no emoji, none of the banned words (grep of the seed)", () => {
    for (const r of seed.rows) {
      expect(wordingProblem(r.subject)).toBeNull();
      expect(wordingProblem(r.body)).toBeNull();
      for (const w of BANNED_WORDS) expect(`${r.subject} ${r.body}`.toLowerCase()).not.toContain(w);
      expect(/\p{Extended_Pictographic}/u.test(`${r.subject}${r.body}`)).toBe(false);
    }
  });
  it("the checker itself catches an emoji and a banned word", () => {
    expect(wordingProblem("Happy day \u{1F389}")).not.toBeNull();
    expect(wordingProblem("It stays Forever")).not.toBeNull();
    expect(wordingProblem("Coming soon to you")).not.toBeNull();
    expect(wordingProblem("Plain and short")).toBeNull();
  });
});

describe("zone arithmetic", () => {
  it("finds 09:00 local, across a zone with and without daylight time", () => {
    expect(atLocalHour(new Date("2030-03-10T14:00:00Z"), "Africa/Lagos", 9).toISOString()).toBe("2030-03-10T08:00:00.000Z");
    expect(atLocalHour(new Date("2030-07-10T14:00:00Z"), "America/New_York", 9).toISOString()).toBe("2030-07-10T13:00:00.000Z");
    expect(atLocalHour(new Date("2030-01-10T14:00:00Z"), "America/New_York", 9).toISOString()).toBe("2030-01-10T14:00:00.000Z");
  });
});

describe("the Resend adapter and how failures are told apart", () => {
  afterEach(() => jest.restoreAllMocks());
  const email = { to: "someone@example.test", subject: "Hi", text: "Hello", idempotencyKey: "k1" };

  it("makes one HTTPS call with the key and the from address, and the idempotency key", async () => {
    const f = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    const r = await new ResendEmail("secret-key", "Firstwish <hello@example.test>", "http://127.0.0.1:9").send(email);
    expect(r.id).toBe("re_1");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:9/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("k1");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Firstwish <hello@example.test>", to: ["someone@example.test"], subject: "Hi" });
  });
  it("a 4xx is failed for good; a 5xx, a 429 and a timeout retry", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("{\"message\":\"bad address\"}", { status: 422 }));
    const bad = await new ResendEmail("k", "a@example.test", "http://127.0.0.1:9").send(email).catch((e: unknown) => e);
    expect(classify(bad).forGood).toBe(true);
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("down", { status: 503 }));
    expect(classify(await new ResendEmail("k", "a@example.test", "http://127.0.0.1:9").send(email).catch((e: unknown) => e)).forGood).toBe(false);
    expect(classify(new ProviderError("resend", 429, "slow down")).forGood).toBe(false);
    expect(classify(new PortTimeoutError("email", "send", 10_000)).forGood).toBe(false);
    expect(classify(new TypeError("fetch failed")).forGood).toBe(false);
  });
  it("a provider's reason never carries an address", () => {
    const r = classify(new ProviderError("resend", 422, "The address ada@example.test is not valid"));
    expect(r.reason).not.toContain("ada@example.test");
  });
});

describe("notices (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let notices: NoticesService;
  let jobs: JobsService;
  const staff: Record<string, string> = {};

  async function account(over: { name?: string | null; contact?: string | null } = {}): Promise<{ id: string; token: string; email: string }> {
    const id = ids.next();
    const email = over.contact === undefined ? address() : over.contact;
    await db.account.create({ data: { id, sides: ["person"], lastSide: "person", name: over.name === undefined ? "Ada" : over.name, contact: email } });
    const token = `acct-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token, email: email ?? "" };
  }
  const run = (...subjects: string[]) => jobs.runDue(100, subjects);
  const row = (id: string) => db.messageDelivery.findUniqueOrThrow({ where: { id } });
  const sealedData = { name: "Ada", for: "Tunde", date: "1 June 2030" };

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    notices = t.app.get(NoticesService);
    jobs = t.app.get(JobsService);
    notices.registerAll();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    for (const role of ["owner", "ops", "support", "finance", "moderator"] as StaffRole[]) {
      staff[role] = role;
      t.tokens.set(role, { kind: "staff", staffId: ids.next(), roles: [role] });
    }
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  describe("notices.send and the job", () => {
    it("writes a queued row and a job; the job sends through the port and marks it delivered", async () => {
      const a = await account();
      const r = await notices.send(undefined, { template: "sealed", toAccountId: a.id, data: sealedData, key: `k-${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      expect((await row(r.deliveryId)).status).toBe("queued");
      expect(await db.job.count({ where: { subjectId: r.deliveryId, type: "send_message" } })).toBe(1);
      expect(await run(r.deliveryId)).toBe(1);
      const done = await row(r.deliveryId);
      expect(done).toMatchObject({ status: "delivered", attempts: 1, error: null });
      expect(done.providerMessageId).toMatch(/^standin-email-/);
      const sent = t.email.lastTo(a.email)!;
      expect(sent.subject).toBe("Your wish for Tunde is sealed");
      expect(sent.text).toContain("It opens on 1 June 2030");
      expect(sent.text).not.toMatch(/\{[a-z]+\}/);
    });

    it("a placeholder with no value refuses to send: recorded failed with the reason, no email, no job", async () => {
      const a = await account();
      const before = t.email.sent.length;
      const r = await notices.send(undefined, { template: "sealed", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      expect(r.status).toBe("failed");
      if (r.status !== "failed") return;
      const d = await row(r.deliveryId);
      expect(d.status).toBe("failed");
      expect(d.error).toContain("{date}");
      expect(await db.job.count({ where: { subjectId: r.deliveryId } })).toBe(0);
      expect(t.email.sent.length).toBe(before);
      const blank = await notices.send(undefined, { template: "sealed", toAccountId: a.id, data: { ...sealedData, date: "  " }, key: `k-${ids.next()}` });
      expect(blank.status).toBe("failed");
    });

    it("the same key twice sends one email; 20 at once make one row and one send", async () => {
      const a = await account();
      const key = `k-${ids.next()}`;
      const out = await Promise.all(Array.from({ length: 20 }, () => notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key })));
      expect(out.filter((o) => o.status === "queued")).toHaveLength(1);
      const id = (out.find((o) => o.status === "queued") as { deliveryId: string }).deliveryId;
      expect(new Set(out.map((o) => o.deliveryId))).toEqual(new Set([id]));
      expect(await db.messageDelivery.count({ where: { idempotencyKey: key } })).toBe(1);
      await Promise.all([run(id), run(id), notices.deliverNow(id)]);
      expect(t.email.sent.filter((e) => e.to === a.email)).toHaveLength(1);
      expect((await row(id)).status).toBe("delivered");
    });

    it("a 5xx retries with a wait, 3 tries in all, then failed for staff with the provider's reason", async () => {
      const a = await account();
      const spy = jest.spyOn(t.email, "send").mockRejectedValue(new ProviderError("resend", 503, `down for ${a.email}`));
      const r = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      expect(await run(r.deliveryId)).toBe(1);
      expect(await row(r.deliveryId)).toMatchObject({ status: "queued", attempts: 1 });
      const job = await db.job.findFirstOrThrow({ where: { subjectId: r.deliveryId } });
      expect(job.status).toBe("scheduled");
      expect(job.runAt.getTime()).toBe(NOW.getTime() + 60_000);
      expect(await run(r.deliveryId)).toBe(0);
      t.clock.advance(60_000);
      await run(r.deliveryId);
      expect(await row(r.deliveryId)).toMatchObject({ status: "queued", attempts: 2 });
      t.clock.advance(5 * 60_000);
      await run(r.deliveryId);
      const done = await row(r.deliveryId);
      expect(done).toMatchObject({ status: "failed", attempts: 3 });
      expect(done.error).toContain("503");
      expect(done.error).not.toContain(a.email);
      expect(spy).toHaveBeenCalledTimes(3);
      expect((await db.notice.findFirstOrThrow({ where: { deliveryId: r.deliveryId } })).status).toBe("cancelled");
      spy.mockRestore();
    });

    it("a 4xx is failed at the first try; a retry that then works is delivered", async () => {
      const a = await account();
      const spy = jest.spyOn(t.email, "send").mockRejectedValueOnce(new ProviderError("resend", 422, "invalid")).mockRejectedValueOnce(new ProviderError("resend", 500, "oops"));
      const r1 = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      const r2 = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      if (r1.status !== "queued" || r2.status !== "queued") throw new Error("not queued");
      await run(r1.deliveryId);
      expect(await row(r1.deliveryId)).toMatchObject({ status: "failed", attempts: 1 });
      await run(r2.deliveryId);
      t.clock.advance(60_000);
      await run(r2.deliveryId);
      expect(await row(r2.deliveryId)).toMatchObject({ status: "delivered", attempts: 2 });
      spy.mockRestore();
    });

    it("an erased account is never emailed: nothing queued, and a queued one goes undeliverable", async () => {
      const a = await account();
      const r = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      await db.account.update({ where: { id: a.id }, data: { erasedAt: NOW } });
      const before = t.email.sent.length;
      await run(r.deliveryId);
      expect((await row(r.deliveryId)).status).toBe("dropped");
      const again = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      expect(again).toMatchObject({ status: "skipped", reason: "erased" });
      expect(t.email.sent.length).toBe(before);
    });

    it("the sign-in code goes to a bare address, cannot be turned off, and is not kept once settled", async () => {
      const to = address();
      const r = await notices.send(undefined, { template: "code", toEmail: to.toUpperCase(), data: { code: "482913" }, key: `auth-code:${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      await notices.deliverNow(r.deliveryId);
      const sent = t.email.lastTo(to)!;
      expect(sent.subject).toBe("Your Firstwish code: 482913");
      const d = await row(r.deliveryId);
      expect(d.status).toBe("delivered");
      expect(JSON.stringify(d.vars)).not.toContain("482913");
      await run(r.deliveryId);
      expect(t.email.sent.filter((e) => e.to === to)).toHaveLength(1);
    });
  });

  describe("resting soon (the send-notice job)", () => {
    async function liveWish(accountId: string, endsAt: Date, over: Record<string, unknown> = {}): Promise<string> {
      const id = ids.next();
      await db.wish.create({
        data: { id, accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", name: "Tunde", endsAt, version: 0, ...over },
      });
      await db.wishLink.create({ data: { id: ids.next(), slug: `b11-${id.slice(-12)}`, wishId: id, active: true } });
      await jobs.schedule("send-notice", new Date(endsAt.getTime() - 3 * 86_400_000), id);
      return id;
    }
    const deliveriesOf = (wishId: string) => db.notice.findMany({ where: { wishId } });

    it("goes to the sender at once when 09:00 local has passed, with the wish's link and end date", async () => {
      const a = await account();
      const wish = await liveWish(a.id, new Date("2030-03-13T14:00:00.000Z"));
      t.clock.set(new Date("2030-03-10T14:00:00.000Z"));
      await run(wish);
      const notice = await db.notice.findFirstOrThrow({ where: { wishId: wish } });
      expect(notice).toMatchObject({ kind: "term_ends_soon", accountId: a.id, status: "scheduled" });
      await run(notice.deliveryId!);
      const sent = t.email.lastTo(a.email)!;
      expect(sent.subject).toBe("Tunde's wish rests on 13 March 2030");
      expect(sent.text).toContain("/w/b11-");
      expect((await db.notice.findUniqueOrThrow({ where: { id: notice.id } })).status).toBe("sent");
      expect((await db.job.findFirstOrThrow({ where: { subjectId: wish, type: "send_notice" } })).status).toBe("succeeded");
    });

    it("waits for 09:00 in the wish's zone when the job comes earlier, then sends once", async () => {
      const a = await account();
      const wish = await liveWish(a.id, new Date("2030-03-13T06:00:00.000Z"));
      t.clock.set(new Date("2030-03-10T06:00:00.000Z"));
      await run(wish);
      expect(await deliveriesOf(wish)).toHaveLength(0);
      const job = await db.job.findFirstOrThrow({ where: { subjectId: wish, type: "send_notice" } });
      expect(job.runAt.toISOString()).toBe("2030-03-10T08:00:00.000Z");
      t.clock.set(new Date("2030-03-10T08:00:00.000Z"));
      await run(wish);
      expect(await deliveriesOf(wish)).toHaveLength(1);
      await jobs.schedule("send-notice", new Date("2030-03-10T08:00:00.000Z"), wish);
      await run(wish);
      expect(await deliveriesOf(wish)).toHaveLength(1);
    });

    it("a wish kept, erased, taken down or resting meanwhile sends nothing", async () => {
      const a = await account();
      const end = new Date("2030-03-13T14:00:00.000Z");
      const wishes = [
        await liveWish(a.id, end, { keptUntil: new Date("2031-01-01T00:00:00Z") }),
        await liveWish(a.id, end, { erasedAt: NOW }),
        await liveWish(a.id, end, { status: "removed", removedAt: NOW }),
        await liveWish(a.id, end, { status: "resting" }),
        await liveWish(a.id, new Date("2030-03-20T14:00:00.000Z")),
      ];
      t.clock.set(new Date("2030-03-10T14:00:00.000Z"));
      for (const w of wishes) await run(w);
      for (const w of wishes) expect(await deliveriesOf(w)).toHaveLength(0);
      const later = await db.job.findFirstOrThrow({ where: { subjectId: wishes[4], type: "send_notice" } });
      expect(later.runAt.toISOString()).toBe("2030-03-17T14:00:00.000Z");
    });

    it("a sender who turned it off is not written to; an erased sender is not either", async () => {
      const a = await account();
      const muted = await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: ["resting"] });
      expect(muted.status).toBe(200);
      const w1 = await liveWish(a.id, new Date("2030-03-13T14:00:00.000Z"));
      const b = await account();
      const w2 = await liveWish(b.id, new Date("2030-03-13T14:00:00.000Z"));
      await db.account.update({ where: { id: b.id }, data: { erasedAt: NOW } });
      t.clock.set(new Date("2030-03-10T14:00:00.000Z"));
      await run(w1, w2);
      expect(await deliveriesOf(w1)).toHaveLength(0);
      expect(await deliveriesOf(w2)).toHaveLength(0);
      expect(t.email.lastTo(a.email)).toBeUndefined();
    });
  });

  describe("notice choices (E-77, E-78)", () => {
    it("401 without a token; 422 for the sign-in code, an unknown kind or a bad body", async () => {
      expect((await t.http().patch("/v1/me/notice-prefs").send({ muted: [] })).status).toBe(401);
      expect((await t.http().get("/v1/me/notices")).status).toBe(401);
      const a = await account();
      const code = await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: ["code"] });
      expect(code.status).toBe(422);
      expect(code.body.error.fields.muted).toContain("sign-in code");
      expect((await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: ["nope"] })).status).toBe(422);
      expect((await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: "opened" })).status).toBe(422);
      expect((await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: [], channel: "sms" })).status).toBe(422);
    });
    it("turns kinds off (spelling normalised); off means no row is queued; on again queues", async () => {
      const a = await account();
      const r = await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: [" Opened ", "opened", "sealed"] });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ channel: "email", muted: ["opened", "sealed"] });
      const key = `k-${ids.next()}`;
      expect(await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "T" }, key })).toMatchObject({ status: "skipped", reason: "muted" });
      expect(await db.messageDelivery.count({ where: { idempotencyKey: key } })).toBe(0);
      const code = await notices.send(undefined, { template: "code", toAccountId: a.id, data: { code: "111111" }, key: `auth-code:${ids.next()}` });
      expect(code.status).toBe("queued");
      await t.http().patch("/v1/me/notice-prefs").set(bearer(a.token)).send({ muted: ["sealed"] });
      expect((await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "T" }, key })).status).toBe("queued");
    });
    it("lists only my own notices, newest first, with the address masked, paged", async () => {
      const a = await account();
      const b = await account();
      for (const who of [a, a, b]) await notices.send(undefined, { template: "opened", toAccountId: who.id, data: { name: "Ada", for: "T" }, key: `k-${ids.next()}` });
      const p1 = await t.http().get("/v1/me/notices").query({ limit: 1 }).set(bearer(a.token));
      expect(p1.status).toBe(200);
      expect(p1.body.items).toHaveLength(1);
      expect(p1.body.nextCursor).toEqual(expect.any(String));
      const p2 = await t.http().get("/v1/me/notices").query({ limit: 1, cursor: p1.body.nextCursor }).set(bearer(a.token));
      expect(p2.body.items).toHaveLength(1);
      expect(p2.body.nextCursor).toBeNull();
      expect(p2.body.items[0].id < p1.body.items[0].id).toBe(true);
      expect(p1.body.items[0]).toMatchObject({ kind: "opened", key: "opened", accountId: a.id, status: "scheduled" });
      expect(JSON.stringify(p1.body)).not.toContain(a.email);
      expect((await t.http().get("/v1/me/notices").query({ cursor: "junk" }).set(bearer(a.token))).status).toBe(422);
    });
  });

  describe("staff: wording (E-75, E-76)", () => {
    const edit = (token: string, key: string, body: Record<string, unknown>) => t.http().put(`/v1/admin/messages/templates/${key}`).set(bearer(token)).send(body);
    const good = { subject: "{for} opened your wish", body: "Hi {name},\n\n{for} just opened your wish.\n\nFirstwish", reason: "Wording check" };

    it("401 without a token; 403 for a user, finance and moderator", async () => {
      expect((await t.http().get("/v1/admin/messages/templates")).status).toBe(401);
      const a = await account();
      expect((await t.http().get("/v1/admin/messages/templates").set(bearer(a.token))).status).toBe(403);
      expect((await t.http().get("/v1/admin/messages/templates").set(bearer("finance"))).status).toBe(403);
      expect((await edit("moderator", "opened", good)).status).toBe(403);
    });
    it("owner, ops and support read the seven messages", async () => {
      for (const who of ["owner", "ops", "support"]) {
        const r = await t.http().get("/v1/admin/messages/templates").set(bearer(who));
        expect(r.status).toBe(200);
        expect((r.body.items as { key: string }[]).map((i) => i.key)).toEqual(["code", "invite", "login-invite", "opened", "opens", "resting", "sealed"]);
        expect(r.body.nextCursor).toBeNull();
      }
      const p = await t.http().get("/v1/admin/messages/templates").query({ limit: 2 }).set(bearer("ops"));
      expect(p.body.items).toHaveLength(2);
      const p2 = await t.http().get("/v1/admin/messages/templates").query({ limit: 2, cursor: p.body.nextCursor }).set(bearer("ops"));
      expect((p2.body.items as { key: string }[]).map((i) => i.key)).toEqual(["opened", "opens"]);
    });
    it("422 for a short reason, a dropped placeholder, an unknown one, an emoji, a banned word or an empty body; 404 for an unknown message", async () => {
      expect((await edit("ops", "opened", { ...good, reason: "ab" })).status).toBe(422);
      const dropped = await edit("ops", "opened", { ...good, subject: "Your wish was opened", body: "Hi {name}, someone opened your wish." });
      expect(dropped.status).toBe(422);
      expect(dropped.body.error.fields.body).toContain("{for}");
      expect((await edit("ops", "opened", { ...good, body: `${good.body} {secret}` })).status).toBe(422);
      expect((await edit("ops", "opened", { ...good, body: `${good.body} \u{1F389}` })).status).toBe(422);
      expect((await edit("ops", "opened", { ...good, subject: "Open forever" })).status).toBe(422);
      expect((await edit("ops", "opened", { ...good, body: "  " })).status).toBe(422);
      expect((await edit("ops", "code", { subject: "Code", body: "Your code", reason: "Wording check" })).status).toBe(422);
      expect((await edit("ops", "nope", good)).status).toBe(404);
    });
    it("a good edit changes the wording used from then on, bumps the version and writes one audit row without an address", async () => {
      const before = await db.auditEntry.count({ where: { action: "messages.template_edit" } });
      const r = await edit("support", "opened", { subject: "{for} opened your wish today", body: good.body, reason: "Wording check" });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ key: "opened", subject: "{for} opened your wish today", name: "Your wish was opened" });
      expect(await db.auditEntry.count({ where: { action: "messages.template_edit" } })).toBe(before + 1);
      const audit = await db.auditEntry.findFirstOrThrow({ where: { action: "messages.template_edit" }, orderBy: { id: "desc" } });
      expect(JSON.stringify(audit)).not.toMatch(/@/);
      const a = await account();
      const s = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      if (s.status !== "queued") throw new Error("not queued");
      await run(s.deliveryId);
      expect(t.email.lastTo(a.email)!.subject).toBe("Tunde opened your wish today");
      expect((await edit("ops", "opened", { ...good, subject: "{for} opened your wish" })).status).toBe(200);
    });
    it("an edit that adds a placeholder with no value makes the delivery fail, not send a hole", async () => {
      await db.messageTemplate.updateMany({ where: { key: "opened" }, data: { body: "Hi {name}, {for} opened it on {date}." } });
      const a = await account();
      const s = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      expect(s.status).toBe("failed");
      await db.messageTemplate.updateMany({ where: { key: "opened" }, data: { body: good.body } });
    });
  });

  describe("staff: the delivery log and send again (E-71, E-70)", () => {
    async function failedDelivery(): Promise<{ id: string; email: string; accountId: string }> {
      const a = await account();
      const spy = jest.spyOn(t.email, "send").mockRejectedValueOnce(new ProviderError("resend", 422, "invalid"));
      const r = await notices.send(undefined, { template: "opened", toAccountId: a.id, data: { name: "Ada", for: "Tunde" }, key: `k-${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      await run(r.deliveryId);
      spy.mockRestore();
      return { id: r.deliveryId, email: a.email, accountId: a.id };
    }
    const resend = (token: string, id: string, reason = "Customer asked") => t.http().post(`/v1/admin/messages/${id}/resend`).set(bearer(token)).send({ reason });

    it("401 / 403 / 422 on the log; it pages, filters failed and shows the address masked", async () => {
      expect((await t.http().get("/v1/admin/messages/log")).status).toBe(401);
      expect((await t.http().get("/v1/admin/messages/log").set(bearer("finance"))).status).toBe(403);
      expect((await t.http().get("/v1/admin/messages/log").query({ status: "weird" }).set(bearer("ops"))).status).toBe(422);
      expect((await t.http().get("/v1/admin/messages/log").query({ cursor: "junk" }).set(bearer("ops"))).status).toBe(422);
      const f = await failedDelivery();
      const r = await t.http().get("/v1/admin/messages/log").query({ status: "failed", limit: 50 }).set(bearer("support"));
      expect(r.status).toBe(200);
      const mine = (r.body.items as { id: string; to: string }[]).find((i) => i.id === f.id)!;
      expect(mine).toMatchObject({ status: "failed", state: "failed", channel: "email", templateKey: "opened", purpose: "opened", attempts: 1, wish: null });
      expect(mine.to).toBe(`${f.email.slice(0, 1)}***${f.email.slice(f.email.indexOf("@"))}`);
      expect(JSON.stringify(r.body)).not.toContain(f.email);
      expect((r.body.items as { status: string }[]).every((i) => i.status === "failed")).toBe(true);
      const p1 = await t.http().get("/v1/admin/messages/log").query({ limit: 1 }).set(bearer("ops"));
      expect(p1.body.items).toHaveLength(1);
      const p2 = await t.http().get("/v1/admin/messages/log").query({ limit: 1, cursor: p1.body.nextCursor }).set(bearer("ops"));
      expect(p2.body.items[0].id < p1.body.items[0].id).toBe(true);
    });
    it("the sign-in code never shows in the log", async () => {
      const to = address();
      const r = await notices.send(undefined, { template: "code", toEmail: to, data: { code: "739104" }, key: `auth-code:${ids.next()}` });
      if (r.status !== "queued") throw new Error("not queued");
      const log = await t.http().get("/v1/admin/messages/log").query({ limit: 50 }).set(bearer("owner"));
      expect(JSON.stringify(log.body)).not.toContain("739104");
      expect(JSON.stringify(log.body)).not.toContain(to);
      await run(r.deliveryId);
    });
    it("send again: 401, 403, 422 reason, 404, 409 when not failed; then works once and writes one audit row", async () => {
      const f = await failedDelivery();
      expect((await t.http().post(`/v1/admin/messages/${f.id}/resend`).send({ reason: "Customer asked" })).status).toBe(401);
      expect((await resend("finance", f.id)).status).toBe(403);
      expect((await resend("ops", f.id, "no")).status).toBe(422);
      expect((await resend("ops", ids.next())).status).toBe(404);
      expect((await resend("ops", "not-a-uuid")).status).toBe(404);
      const fine = await account();
      const ok = await notices.send(undefined, { template: "opened", toAccountId: fine.id, data: { name: "Ada", for: "T" }, key: `k-${ids.next()}` });
      if (ok.status !== "queued") throw new Error("not queued");
      expect((await resend("ops", ok.deliveryId)).status).toBe(409);
      const audits = await db.auditEntry.count({ where: { action: "messages.resend", subjectId: f.id } });
      const r = await resend("ops", f.id);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "delivered", templateKey: "opened" });
      expect(r.body.id).not.toBe(f.id);
      expect(t.email.sent.filter((e) => e.to === f.email)).toHaveLength(1);
      expect(await db.auditEntry.count({ where: { action: "messages.resend", subjectId: f.id } })).toBe(audits + 1);
      const second = await resend("ops", f.id);
      expect(second.status).toBe(409);
      const log = await t.http().get("/v1/admin/messages/log").query({ status: "failed", limit: 50 }).set(bearer("ops"));
      expect((log.body.items as { id: string; resent: string }[]).find((i) => i.id === f.id)!.resent).toBe(r.body.id);
      const audit = await db.auditEntry.findFirstOrThrow({ where: { action: "messages.resend", subjectId: f.id } });
      expect(JSON.stringify(audit)).not.toContain(f.email);
    });
    it("two at once: one send", async () => {
      const f = await failedDelivery();
      const [x, y] = await Promise.all([resend("ops", f.id), resend("support", f.id)]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      expect(await db.messageDelivery.count({ where: { idempotencyKey: { endsWith: "#resend" }, to: f.email } })).toBe(1);
      expect(t.email.sent.filter((e) => e.to === f.email)).toHaveLength(1);
    });
    it("an erased account's failed message is not sent again; a sign-in code never is", async () => {
      const f = await failedDelivery();
      await db.account.update({ where: { id: f.accountId }, data: { erasedAt: NOW } });
      expect((await resend("ops", f.id)).status).toBe(409);
      const to = address();
      const spy = jest.spyOn(t.email, "send").mockRejectedValueOnce(new ProviderError("resend", 422, "invalid"));
      const c = await notices.send(undefined, { template: "code", toEmail: to, data: { code: "246810" }, key: `auth-code:${ids.next()}` });
      if (c.status !== "queued") throw new Error("not queued");
      await run(c.deliveryId);
      spy.mockRestore();
      expect((await row(c.deliveryId)).status).toBe("failed");
      expect((await resend("ops", c.deliveryId)).status).toBe(409);
    });
  });
});
