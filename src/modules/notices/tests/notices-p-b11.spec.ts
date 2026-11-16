import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { ProviderError } from "../../../common/ports/adapters/http";
import type { StaffRole } from "../../../common/auth/principal";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { wordingProblems } from "../catalog";
import { NoticesService } from "../notices.service";

const ROOT = join(__dirname, "../../../..");
const ids = new UuidV7Maker();
const NOW = new Date("2030-03-10T08:00:00.000Z");
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
let n = 0;
const address = () => `pb11-${process.pid}-${Date.now()}-${++n}@example.test`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("P-B11 notices patch", () => {
  let t: TestApp;
  let db: PrismaService;
  let notices: NoticesService;
  let jobs: JobsService;

  async function account(): Promise<{ id: string; email: string }> {
    const id = ids.next();
    const email = address();
    await db.account.create({ data: { id, sides: ["person"], lastSide: "person", name: "Ada", contact: email } });
    return { id, email };
  }
  const queue = async (a: { id: string }, data: Record<string, string> = { name: "Ada", for: "Tunde", link: "https://example.test/w/x" }) => {
    const r = await notices.send(undefined, { template: "opens", toAccountId: a.id, data, key: `k-${ids.next()}` });
    if (r.status !== "queued") throw new Error(`not queued: ${r.status} ${"reason" in r ? r.reason : ""}`);
    return r.deliveryId;
  };
  const row = (id: string) => db.messageDelivery.findUniqueOrThrow({ where: { id } });
  const edit = (key: string, body: Record<string, unknown>) =>
    t.http().put(`/v1/admin/messages/templates/${key}`).set(bearer("ops")).send(body);

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    notices = t.app.get(NoticesService);
    jobs = t.app.get(JobsService);
    notices.registerAll();
    // The sibling spec seeds the same database at the same time: wait for the wording, and only seed when it never comes.
    for (let i = 0; i < 40 && (await db.messageTemplate.count({ where: { channel: "email" } })) < 5; i++) await sleep(250);
    if ((await db.messageTemplate.count({ where: { channel: "email" } })) < 5) {
      const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    }
    for (const role of ["owner", "ops"] as StaffRole[]) t.tokens.set(role, { kind: "staff", staffId: ids.next(), roles: [role] });
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));
  afterEach(() => jest.restoreAllMocks());

  it("KK1 the job tick and deliverNow at the same moment make one provider call", async () => {
    const a = await account();
    const id = await queue(a);
    const spy = jest.spyOn(t.email, "send").mockImplementation(async () => { await sleep(150); return { id: "re_x" }; });
    await Promise.all([jobs.runDue(100, [id]), notices.deliverNow(id), notices.deliverNow(id)]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await row(id)).toMatchObject({ status: "delivered", attempts: 1 });
  });

  it("KK1 50 deliver calls at once on a failing provider: one call per try, 3 in all, then failed for staff", async () => {
    const a = await account();
    const id = await queue(a);
    const spy = jest.spyOn(t.email, "send").mockImplementation(async () => { await sleep(100); throw new ProviderError("resend", 503, "down"); });
    for (let round = 0; round < 3; round++) {
      await Promise.all(Array.from({ length: 50 }, () => notices.deliver(id)));
      expect(spy).toHaveBeenCalledTimes(round + 1);
    }
    expect(await row(id)).toMatchObject({ status: "failed", attempts: 3 });
    await Promise.all(Array.from({ length: 50 }, () => notices.deliver(id)));
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("KK1 a delivery whose caller died mid-try is picked up again after 5 minutes, and a fresh one is left alone", async () => {
    const a = await account();
    const id = await queue(a);
    await db.$executeRaw`UPDATE message_delivery SET status = 'sending', attempts = 1, "updatedAt" = ${t.clock.now()} WHERE id = ${id}::uuid`;
    expect((await notices.deliver(id)).outcome).toBe("skipped");
    await db.$executeRaw`UPDATE message_delivery SET "updatedAt" = ${new Date(t.clock.now().getTime() - 6 * 60_000)} WHERE id = ${id}::uuid`;
    expect((await notices.deliver(id)).outcome).toBe("delivered");
    expect((await row(id)).attempts).toBe(2);
  });

  it("J1 (MM2) a sender that dies on its third try ends failed for staff, never in flight for good", async () => {
    const a = await account();
    const id = await queue(a);
    await db.$executeRaw`UPDATE message_delivery SET status = 'sending', attempts = 3, "updatedAt" = ${t.clock.now()} WHERE id = ${id}::uuid`;
    expect((await notices.deliver(id)).outcome).toBe("skipped"); // fresh: its caller may still be working
    await db.$executeRaw`UPDATE message_delivery SET "updatedAt" = ${new Date(t.clock.now().getTime() - 6 * 60_000)} WHERE id = ${id}::uuid`;
    const spy = jest.spyOn(t.email, "send");
    await jobs.runDue(100, [id]); // the same sweep that picks up stale ones
    expect(spy).not.toHaveBeenCalled();
    expect(await row(id)).toMatchObject({ status: "failed", attempts: 3 });
    expect((await row(id)).error).toBeTruthy();
    expect((await notices.deliver(id)).outcome).toBe("skipped");
  });

  it("J1 (MM2) a retry is taken only once its wait has passed", async () => {
    const a = await account();
    const id = await queue(a);
    await db.$executeRaw`UPDATE message_delivery SET status = 'queued', attempts = 1, "updatedAt" = ${t.clock.now()} WHERE id = ${id}::uuid`;
    const spy = jest.spyOn(t.email, "send");
    await jobs.runDue(100, [id]);
    expect(spy).not.toHaveBeenCalled();
    expect(await row(id)).toMatchObject({ status: "queued", attempts: 1 });
    expect((await db.job.findFirstOrThrow({ where: { subjectId: id } })).status).not.toBe("dead");
    t.clock.advance(59_000);
    await jobs.runDue(100, [id]);
    expect(spy).not.toHaveBeenCalled();
    t.clock.advance(1_000);
    await jobs.runDue(100, [id]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await row(id)).toMatchObject({ status: "delivered", attempts: 2 });
  });

  // The 200 cases are checked on the rule itself (an edit would add an audit row the sibling spec counts); every 422 goes over HTTP.
  it("KK2 staff wording: subject 150, body 4000; a tag, a zero-width or a control character is 422", async () => {
    const good = { subject: "{for}'s wish opens", body: "Hi {name}, here is {for}'s wish: {link}", reason: "Wording check" };
    const pad = (base: string, total: number) => base + "a".repeat(total - base.length);
    expect(wordingProblems("opens", pad(good.subject, 150), good.body)).toBeNull();
    expect(wordingProblems("opens", good.subject, pad(good.body, 4000))).toBeNull();
    expect(wordingProblems("opens", good.subject, `${good.body}\n\nSecond line.`)).toBeNull();
    expect((await edit("opens", { ...good, subject: pad(good.subject, 151) })).status).toBe(422);
    const long = await edit("opens", { ...good, body: pad(good.body, 4001) });
    expect(long.status).toBe(422);
    expect((long.body as { error: { fields: Record<string, string> } }).error.fields.body).toBeDefined();
    for (const bad of ["<script>x</script>", "<b>hi</b>", "zero\u200bwidth", "bell\u0007", "nul\u0000", "del\u007f"]) {
      expect((await edit("opens", { ...good, body: `${good.body} ${bad}` })).status).toBe(422);
      expect((await edit("opens", { ...good, subject: `${good.subject} ${bad}` })).status).toBe(422);
    }
  });

  it("KK3 a value with a line break put in a subject goes out as one line", async () => {
    const a = await account();
    const r = await notices.send(undefined, { template: "opens", toAccountId: a.id, data: { name: "Ada", for: "Tunde\r\nBcc: x@example.test\nmore", link: "https://example.test/w/x" }, key: `k-${ids.next()}` });
    if (r.status !== "queued") throw new Error("not queued");
    await notices.deliver(r.deliveryId);
    const sent = t.email.sent.filter((e) => e.to === a.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).not.toMatch(/[\r\n]/);
    expect(sent[0].subject).toContain("Tunde Bcc:");
  });

  it("KK4 the staff log shows no full address anywhere, values included", async () => {
    const a = await account();
    const typed = "typed-in@example.test";
    const id = await queue(a, { name: typed, for: `see ${typed} now`, link: "https://example.test/w/x" });
    // Other specs write sign-in deliveries into the same database: page on until this row is found, never assume it is on the first page.
    let res = await t.http().get("/v1/admin/messages/log").set(bearer("ops"));
    let mine: { id: string; vars: unknown } | undefined;
    let text = "";
    for (let page = 0; page < 200; page++) {
      expect(res.status).toBe(200);
      const body = res.body as { items: { id: string; vars: unknown }[]; nextCursor?: string | null };
      text += JSON.stringify(body);
      mine = body.items.find((i) => i.id === id);
      if (mine || !body.nextCursor) break;
      res = await t.http().get(`/v1/admin/messages/log?cursor=${encodeURIComponent(body.nextCursor)}`).set(bearer("ops"));
    }
    expect(mine).toBeDefined();
    expect(text).not.toContain(typed);
    expect(text).not.toContain(a.email);
    expect(JSON.stringify(mine?.vars)).toContain("t***@example.test");
  });

  it("KK5 an erased account's queued deliveries end dropped, with nothing sent", async () => {
    const a = await account();
    const ida = await queue(a);
    const idb = await queue(a);
    // what account erasure does to its deliveries (account-erasure.service.ts)
    await db.messageDelivery.updateMany({ where: { to: a.email }, data: { to: "", vars: undefined } });
    await db.$executeRaw`UPDATE message_delivery SET vars = NULL WHERE id IN (${ida}::uuid, ${idb}::uuid)`;
    await db.account.update({ where: { id: a.id }, data: { erasedAt: NOW, contact: null } });
    const before = t.email.sent.length;
    await jobs.runDue(100, [ida, idb]);
    for (const id of [ida, idb]) {
      const r = await row(id);
      expect(r.status).toBe("dropped");
      expect(r.error).toContain("Dropped");
      expect(r.error).not.toContain("No value");
    }
    expect(t.email.sent.length).toBe(before);
  });

  it("KK6 a provider error holding a six-digit code is stored without it", async () => {
    const a = await account();
    const id = await queue(a);
    jest.spyOn(t.email, "send").mockRejectedValue(new ProviderError("resend", 422, `bad body: your code is 482913 and 482 913 and 482-913 for ${a.email}`));
    await notices.deliver(id);
    const r = await row(id);
    expect(r.status).toBe("failed");
    expect(r.error).not.toMatch(/\d{3}[ -]?\d{3}/);
    expect(r.error).not.toContain(a.email);
    const log = await t.http().get("/v1/admin/messages/log?status=failed").set(bearer("ops"));
    expect(JSON.stringify(log.body)).not.toContain("482913");
  });

  it("again: 30 sends with one key make one row and one email; sending again 10 at once makes one", async () => {
    const a = await account();
    const key = `k-${ids.next()}`;
    const out = await Promise.all(Array.from({ length: 30 }, () => notices.send(undefined, { template: "opens", toAccountId: a.id, data: { name: "Ada", for: "Tunde", link: "https://example.test/w/x" }, key })));
    expect(await db.messageDelivery.count({ where: { idempotencyKey: key } })).toBe(1);
    const id = out.find((o) => o.status === "queued")?.deliveryId ?? "";
    await Promise.all([jobs.runDue(100, [id]), notices.deliverNow(id)]);
    expect(t.email.sent.filter((e) => e.to === a.email)).toHaveLength(1);
    // send again on a failed one, 10 at once
    const bad = await queue(a);
    jest.spyOn(t.email, "send").mockRejectedValueOnce(new ProviderError("resend", 422, "invalid"));
    await notices.deliver(bad);
    expect((await row(bad)).status).toBe("failed");
    const res = await Promise.all(Array.from({ length: 10 }, () => t.http().post(`/v1/admin/messages/${bad}/resend`).set(bearer("ops")).send({ reason: "Customer asked" })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(t.email.sent.filter((e) => e.to === a.email)).toHaveLength(2);
  });

  it.each([
    ["Africa/Lagos", "2030-03-10T06:00:00.000Z", "2030-03-10T08:00:00.000Z"],
    ["Asia/Tokyo", "2030-03-09T20:00:00.000Z", "2030-03-10T00:00:00.000Z"],
    ["America/Los_Angeles", "2030-03-10T12:00:00.000Z", "2030-03-10T16:00:00.000Z"],
  ])("again: resting soon waits for 09:00 in %s", async (zone, noticeAt, nineAm) => {
    const a = await account();
    const endsAt = new Date(new Date(noticeAt).getTime() + 3 * 86_400_000);
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: a.id, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: zone, name: "Tunde", endsAt, version: 0 } });
    await jobs.schedule("send-notice", new Date(endsAt.getTime() - 3 * 86_400_000), id);
    t.clock.set(new Date(noticeAt));
    await jobs.runDue(100, [id]);
    const job = await db.job.findFirstOrThrow({ where: { subjectId: id, type: "send_notice" } });
    expect(await db.notice.count({ where: { wishId: id } })).toBe(0);
    expect(job.runAt.toISOString()).toBe(nineAm);
    t.clock.set(new Date(new Date(nineAm).getTime() - 1));
    await jobs.runDue(100, [id]);
    expect(await db.notice.count({ where: { wishId: id } })).toBe(0);
    t.clock.set(new Date(nineAm));
    await jobs.runDue(100, [id]);
    expect(await db.notice.count({ where: { wishId: id } })).toBe(1);
  });

  it("again: an erased account is never emailed and its address is in no row", async () => {
    const a = await account();
    await db.account.update({ where: { id: a.id }, data: { erasedAt: NOW } });
    const r = await notices.send(undefined, { template: "opens", toAccountId: a.id, data: { name: "Ada", for: "Tunde", link: "https://example.test/w/x" }, key: `k-${ids.next()}` });
    expect(r).toMatchObject({ status: "skipped", reason: "erased" });
    expect(t.email.sent.filter((e) => e.to === a.email)).toHaveLength(0);
    const rows = await db.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM message_delivery WHERE "to" = ${a.email} OR vars::text LIKE ${"%" + a.email + "%"}`;
    expect(Number(rows[0].c)).toBe(0);
  });
});
