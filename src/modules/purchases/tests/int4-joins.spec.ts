import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobHandlers } from "../../job-handlers/job-handlers.service";
import { JobsService } from "../../jobs/jobs.service";
import { NoticesService } from "../../notices/notices.service";
import { atLocalHour } from "../../notices/zoned";
import { FulfilmentRegistry } from "../../payments/fulfilment.registry";
import { SettlementService } from "../../payments/settlement.service";
import { vaultLimitBytes } from "../../stored-files/stored-files.service";
import { WishesService } from "../../wishes/wishes.service";
import { RUN } from "../../../../test/kit/unique";

/* INT-4: the joins the shared changes force, each case named by its ruling id. Specs share one database: every row here is this
   spec's own, and the one global job (clean-link-hits) is run on a clock before every other spec's. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-05T09:00:00.000Z");
const EARLY = new Date("2025-06-01T09:00:00.000Z");
const DAY = 86_400_000;
const GB = 1024 ** 3;
const ids = new UuidV7Maker();
let seq = 0;
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("INT-4 joins", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const account = async (zone?: string) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `int4-${RUN}-${++seq}@example.com`, sides: ["person"], lastSide: "person", timeZone: zone ?? null } });
    const token = `int4-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", name: "Ada", content: { letter: { paras: ["Happy birthday."] } }, ...over } as never,
    });
    return id;
  };
  const wishRow = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });

  async function pay(accountId: string, sku: string, request: Record<string, unknown> = {}, o: { qty?: number; businessId?: string } = {}) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const qty = o.qty ?? 1;
    const id = ids.next();
    const total = unit * BigInt(qty);
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId, businessId: o.businessId ?? null, payerContact: "x@example.com", purpose: "ticket", subjectId: (request.subjectId as string) ?? null,
        lines: [{ sku, name: sku, qty, unitKobo: Number(unit), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x", ...request }, server: { fingerprint: id, flags: [] } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return (await db.payment.findUniqueOrThrow({ where: { providerReference: reference } })).id;
  }
  const withPass = async (a: { id: string }) => {
    await pay(a.id, "pass.year");
    return db.passMembership.findFirstOrThrow({ where: { accountId: a.id } });
  };

  it("GG2: the ticket handler gives the ticket through the wish bundle's fulfilTicketIn, once", async () => {
    const a = await account();
    const w = await wish(a.id);
    const spy = jest.spyOn(t.app.get(WishesService), "fulfilTicketIn");
    await pay(a.id, "ticket.keepsake", { subjectId: w });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0].slice(1)).toEqual([w, "keepsake"]);
    expect((await wishRow(w)).ticket).toBe("keepsake");
    spy.mockRestore();
  });

  it("GG3: the start refuses a ticket line for a wish that has a ticket (422) and takes one for a draft with none", async () => {
    const a = await account();
    const ticketed = await wish(a.id, { ticket: "keepsake" });
    const bare = await wish(a.id);
    const start = (subjectId: string, ticket: string) => t.http().post("/v1/payments").set(bearer(a.token)).send({ purpose: "ticket", ticket, subjectId });
    for (const ticket of ["keepsake", "signature", "premiere"]) {
      const r = await start(ticketed, ticket);
      expect(r.status).toBe(422);
      expect(r.body.error.fields.subjectId).toMatch(/already has/);
    }
    expect((await start(bare, "signature")).status).toBe(201); // HH8: every ticket id is taken
    expect((await start(ids.next(), "keepsake")).status).toBe(422); // not a wish at all
  });

  it("GG3: a Pass upgrade draws one upgrade and makes the draft a Signature; 20 at once with 1 left: one", async () => {
    const a = await account();
    const m = await withPass(a);
    const w = await wish(a.id);
    const r = await t.http().post(`/v1/wishes/${w}/pass-upgrade`).set(bearer(a.token));
    expect(r.status).toBe(200);
    expect(r.body.ticket).toBe("signature");
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).upgradesUsed).toBe(1);
    expect((await t.http().post(`/v1/wishes/${w}/pass-upgrade`).set(bearer(a.token))).status).toBe(409); // already a Signature
    expect((await t.http().post(`/v1/wishes/${w}/pass-upgrade`)).status).toBe(401);
    const other = await account();
    expect((await t.http().post(`/v1/wishes/${w}/pass-upgrade`).set(bearer(other.token))).status).toBe(404);
    await db.passMembership.update({ where: { id: m.id }, data: { upgradesUsed: 3 } });
    const drafts = await Promise.all(Array.from({ length: 20 }, () => wish(a.id)));
    const all = await Promise.all(drafts.map((d) => t.http().post(`/v1/wishes/${d}/pass-upgrade`).set(bearer(a.token))));
    expect(all.filter((x) => x.status === 200)).toHaveLength(1);
    expect(all.filter((x) => x.status === 409)).toHaveLength(19);
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).upgradesUsed).toBe(4);
    const none = await account();
    expect((await t.http().post(`/v1/wishes/${await wish(none.id)}/pass-upgrade`).set(bearer(none.token))).status).toBe(409); // no Pass
  });

  it("GG4: business.pack is wishes left, and the Vault limit is the plan's GB plus the GB of live grants", async () => {
    const a = await account();
    const b = ids.next();
    const renews = new Date(NOW.getTime() + 1000 * DAY); // EA3: the plan's space counts while the plan is live
    await db.business.create({ data: { id: b, accountId: a.id, name: "Studio", plan: "starter", renews } });
    const plan = await db.$transaction((tx) => vaultLimitBytes(tx, { id: b, plan: "starter", renews }, t.clock.now()));
    const pk = await pay(a.id, "pro.pack", {}, { businessId: b });
    expect((await db.business.findUniqueOrThrow({ where: { id: b } })).pack).toBe(5); // wishes left, not a count of packs
    const g = await db.purchaseGrant.findFirstOrThrow({ where: { paymentId: pk } });
    const withPack = await db.$transaction((tx) => vaultLimitBytes(tx, { id: b, plan: "starter", renews }, t.clock.now()));
    expect(withPack - plan).toBe(Number((g.detail as { vaultGb: number }).vaultGb) * GB);
    await pay(a.id, "vault.block", {}, { businessId: b });
    const withVault = await db.$transaction((tx) => vaultLimitBytes(tx, { id: b, plan: "starter", renews }, t.clock.now()));
    expect(withVault).toBeGreaterThan(withPack);
    t.clock.set(new Date(NOW.getTime() + 400 * DAY)); // every grant has ended
    expect(await db.$transaction((tx) => vaultLimitBytes(tx, { id: b, plan: "starter", renews }, t.clock.now()))).toBe(plan);
  });

  it("GG5: seal with usePass draws one Pass wish in the seal transaction; 20 at once with 1 left: one seals", async () => {
    const a = await account();
    const m = await withPass(a);
    const w = await wish(a.id);
    const v = (await wishRow(w)).version;
    const r = await t.http().post(`/v1/wishes/${w}/seal`).set(bearer(a.token)).send({ version: v, openNow: true, usePass: true });
    expect(r.status).toBe(200);
    expect(await wishRow(w)).toMatchObject({ ticket: "keepsake", status: "sealed" });
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(1);
    expect(await db.passDraw.count({ where: { wishId: w, kind: "wish" } })).toBe(1);
    // no Pass wish and no ticket: 402 without usePass; a wish with a paid ticket needs no Pass wish
    const bare = await wish(a.id);
    expect((await t.http().post(`/v1/wishes/${bare}/seal`).set(bearer(a.token)).send({ version: 0, openNow: true })).status).toBe(402);
    const paid = await wish(a.id, { ticket: "keepsake" });
    expect((await t.http().post(`/v1/wishes/${paid}/seal`).set(bearer(a.token)).send({ version: 0, openNow: true, usePass: true })).status).toBe(422);
    // an upgrade alone never seals for free
    const up = await wish(a.id);
    expect((await t.http().post(`/v1/wishes/${up}/pass-upgrade`).set(bearer(a.token))).status).toBe(200);
    const upV = (await wishRow(up)).version;
    expect((await t.http().post(`/v1/wishes/${up}/seal`).set(bearer(a.token)).send({ version: upV, openNow: true })).status).toBe(402);
    expect((await t.http().post(`/v1/wishes/${up}/seal`).set(bearer(a.token)).send({ version: upV, openNow: true, usePass: true })).status).toBe(200);
    expect((await wishRow(up)).ticket).toBe("signature");
    // 20 at once with 1 left
    await db.passMembership.update({ where: { id: m.id }, data: { wishesUsed: 19 } });
    const drafts = await Promise.all(Array.from({ length: 20 }, () => wish(a.id)));
    const all = await Promise.all(drafts.map((d) => t.http().post(`/v1/wishes/${d}/seal`).set(bearer(a.token)).send({ version: 0, openNow: true, usePass: true })));
    expect(all.filter((x) => x.status === 200)).toHaveLength(1);
    expect(all.filter((x) => x.status === 402)).toHaveLength(19);
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(20);
  });

  it("II3 and MM1: one key is one email, by the unique index; the status has sending and dropped", async () => {
    const notices = t.app.get(NoticesService);
    const key = `int4-key-${RUN}-${Date.now()}`;
    const out = await Promise.all(Array.from({ length: 20 }, () => notices.send(undefined, { template: "code", toEmail: `k-${seq}@example.test`, data: { code: "123456" }, key })));
    expect(new Set(out.map((o) => o.deliveryId)).size).toBe(1);
    expect(out.filter((o) => o.status === "queued")).toHaveLength(1);
    expect(await db.messageDelivery.count({ where: { idempotencyKey: key } })).toBe(1);
    const row = await db.messageDelivery.findFirstOrThrow({ where: { idempotencyKey: key } });
    await expect(db.messageDelivery.create({ data: { id: ids.next(), templateKey: "code", channel: "email", to: "x@example.test", purpose: "auth_code", status: "queued", attempts: 0, idempotencyKey: key } })).rejects.toThrow(/Unique/);
    for (const status of ["sending", "dropped"] as const) {
      await db.messageDelivery.update({ where: { id: row.id }, data: { status } });
      expect((await db.messageDelivery.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(status);
    }
    await db.messageDelivery.update({ where: { id: row.id }, data: { purpose: "sealed" } });
    await db.messageDelivery.update({ where: { id: row.id }, data: { purpose: "opens" } });
  });

  it("II4: the account's time zone is read and set through /v1/me, and the resting notice uses it (else the wish's)", async () => {
    const a = await account();
    expect((await t.http().get("/v1/me").set(bearer(a.token))).body.timeZone).toBeNull();
    expect((await t.http().patch("/v1/me").set(bearer(a.token)).send({ timeZone: "Nowhere/Land" })).status).toBe(422);
    const set = await t.http().patch("/v1/me").set(bearer(a.token)).send({ timeZone: "Pacific/Auckland" });
    expect(set.status).toBe(200);
    expect(set.body.timeZone).toBe("Pacific/Auckland");
    expect((await t.http().get("/v1/me").set(bearer(a.token))).body.timeZone).toBe("Pacific/Auckland");
    const endsAt = new Date(NOW.getTime() + 10 * DAY);
    const w = await wish(a.id, { status: "live", ticket: "keepsake", endsAt, openedAt: NOW });
    const noticeAt = new Date(endsAt.getTime() - 3 * DAY);
    t.clock.set(noticeAt);
    const notices = t.app.get(NoticesService);
    const ctx = { subjectId: w, now: noticeAt, attempts: 1, jobRunId: ids.next() } as never;
    const nineAm = atLocalHour(noticeAt, "Pacific/Auckland", 9);
    const lagos = atLocalHour(noticeAt, "Africa/Lagos", 9);
    expect(nineAm.getTime()).not.toBe(lagos.getTime());
    const first = await notices.restingJob(ctx);
    if (noticeAt.getTime() < nineAm.getTime()) expect(first).toMatchObject({ skipped: true, again: nineAm });
    else expect(first).toMatchObject({ changed: expect.anything() });
    const b = await account();
    const w2 = await wish(b.id, { status: "live", ticket: "keepsake", endsAt, openedAt: NOW });
    const second = await notices.restingJob({ subjectId: w2, now: noticeAt, attempts: 1, jobRunId: ids.next() } as never);
    if (noticeAt.getTime() < lagos.getTime()) expect(second).toMatchObject({ skipped: true, again: lagos });
    else expect(second).toMatchObject({ changed: expect.anything() });
  });

  it("LL4: old link hits are removed by the timed job clean-link-hits, which the tick really runs", async () => {
    const e = await createTestApp({ now: EARLY });
    try {
      const edb = e.app.get(PrismaService);
      const jobs = e.app.get(JobsService);
      e.app.get(JobHandlers).registerAll();
      const old = ids.next();
      const fresh = ids.next();
      await edb.linkHit.create({ data: { id: old, bucket: "int4", key: "k", at: new Date(EARLY.getTime() - 3 * 86_400_000) } }); // older than the 2 days a hit is kept (the gather ask limit counts over a day: HU4)
      await edb.linkHit.create({ data: { id: fresh, bucket: "int4", key: "k", at: new Date(EARLY.getTime() - 30 * 60_000) } });
      const subject = `int4-clean-${RUN}-${Date.now()}`;
      await jobs.schedule("clean-link-hits", EARLY, subject);
      expect(await jobs.runDue(5, [subject])).toBe(1);
      expect(await edb.linkHit.findUnique({ where: { id: old } })).toBeNull();
      expect(await edb.linkHit.findUnique({ where: { id: fresh } })).not.toBeNull();
      const job = await edb.job.findUniqueOrThrow({ where: { type_subjectId: { type: "clean_link_hits", subjectId: subject } } });
      expect(job.runAt.getTime()).toBe(EARLY.getTime() + 10 * 60_000); // it runs again
      await edb.linkHit.delete({ where: { id: fresh } });
      await edb.jobRun.deleteMany({ where: { jobId: job.id } });
      await edb.job.delete({ where: { id: job.id } });
    } finally {
      await e.close();
    }
  });

  it("JJ1: the body limit is the config value (512 KB): an oversize wish gets the service's 422 with its reason, not a 413", async () => {
    const a = await account();
    const w = await wish(a.id);
    const body = { version: 0, content: { letter: { paras: ["x".repeat(300_000)] } } };
    const r = await t.http().patch(`/v1/wishes/${w}`).set(bearer(a.token)).send(body);
    expect(r.status).toBe(422);
    expect(r.body.error.fields.content).toMatch(/Too large/);
    const huge = await t.http().patch(`/v1/wishes/${w}`).set(bearer(a.token)).send({ version: 0, content: { letter: { paras: ["x".repeat(600_000)] } } });
    expect(huge.status).toBe(413);
  });

  it("GG7: the draft save takes a passcode (never returned) and refuses the legacy whole-wish fields", async () => {
    const a = await account();
    const w = await wish(a.id);
    const ok = await t.http().patch(`/v1/wishes/${w}`).set(bearer(a.token)).send({ version: 0, passcode: "open sesame" });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toMatch(/sesame|scrypt/);
    const row = await wishRow(w);
    expect(row.passcodeHash).toMatch(/^scrypt\$/);
    const old = await t.http().patch(`/v1/wishes/${w}`).set(bearer(a.token)).send({ version: row.version, letter: "Dear Ada", ticket: "keepsake" });
    expect(old.status).toBe(422);
  });

  it("II2: E-75 and E-76 answer a MessageTemplate; the staff invite has its own wording", async () => {
    t.tokens.set("int4-owner", { kind: "staff", staffId: ids.next(), roles: ["owner"] } as never);
    const list = await t.http().get("/v1/admin/messages/templates").set(bearer("int4-owner"));
    expect(list.status).toBe(200);
    const invite = (list.body.items as { key: string }[]).find((i) => i.key === "invite");
    expect(invite).toMatchObject({ key: "invite", name: expect.any(String), subject: expect.any(String), placeholders: ["code"], version: 1, editedAt: null, editedBy: null });
    const reg = t.app.get(FulfilmentRegistry);
    expect(reg).toBeDefined();
  });
});
