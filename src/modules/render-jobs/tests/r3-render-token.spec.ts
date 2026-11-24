import { Logger } from "@nestjs/common";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { testSlug, testWishNo } from "../../../../test/kit/unique";
import { uniqueAddress } from "../../../../test/kit/app";
import { boot, ids, routeStorage } from "../../concierge/tests/kit";
import { RenderJobsService } from "../render-jobs.service";
import { StandinVideoRenderer, VideoRenderer } from "../video-renderer";

const NOW = new Date("2027-07-07T09:00:00.000Z");
const SKU = "extra.portrait-video";
type Kit = Awaited<ReturnType<typeof boot>>;
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** R3 (IK6, IK4a, Q8): the render token and the one read it opens, through the real routes. */
describe("R3: the render token and GET /v1/render/:token/wish", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  let renderer: StandinVideoRenderer;
  let svc: RenderJobsService;
  const logged: string[] = [];
  const spies: jest.SpyInstance[] = [];

  beforeAll(async () => {
    renderer = new StandinVideoRenderer();
    k = await boot("r3", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(renderer) });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
    for (const m of ["log", "warn", "error", "debug", "verbose"] as const) {
      spies.push(jest.spyOn(Logger.prototype, m).mockImplementation((...a: unknown[]) => void logged.push(a.map((x) => String(x)).join(" "))));
    }
  });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    route.restore();
    await k.t.close();
  });
  const open: (() => void)[] = [];
  afterEach(() => {
    // a spec that failed must not leave a render holding a place
    open.splice(0).forEach((f) => f());
  });
  beforeEach(() => {
    k.t.clock.set(NOW);
    renderer.on = true;
    renderer.failWith = null;
  });

  const http = () => k.t.http();
  const ask = (auth: string, id: string) => http().post(`/v1/wishes/${id}/video`).set("Authorization", auth).send({});
  // the read limit counts per address: this spec reads from addresses of its own, so it never uses another spec's allowance (nor they its)
  const me = uniqueAddress();
  const readWish = (token: string, from = me) => http().get(`/v1/render/${token}/wish`).set("X-Forwarded-For", from);

  /** Starts a render and holds it mid-render (as a real one is while its page reads the wish): answers its token, the job id and a way to finish it. */
  async function rendering(wishId: string, auth: string) {
    let release: () => void = () => undefined;
    renderer.hold = new Promise<void>((r) => (release = r));
    open.push(() => release());
    const before = renderer.rendered.length;
    const job = (await ask(auth, wishId).expect(200)).body.item as { id: string };
    const done = svc.run(job.id);
    for (let i = 0; i < 200 && renderer.rendered.length === before; i++) await new Promise((r) => setTimeout(r, 25));
    const req = renderer.rendered[before];
    if (!req?.token) throw new Error("the render did not start");
    return { jobId: job.id, token: req.token, finish: async () => { release(); return done; } };
  }

  async function wishFor(over: Body = {}, adds: string[] = []) {
    const a = await k.account();
    const no = testWishNo();
    const w = await k.wish(a.id, { ticket: "signature", no, name: "Ada", ...over, ...(adds.length ? { adds, ticket: "keepsake" } : {}) });
    return { a, w, no };
  }
  const addFile = async (ownerId: string, wishId: string, status: string, role = "photo") => {
    const id = ids.next();
    await k.db.storedFile.create({ data: { cleanAt: new Date(), id, ownerAccountId: ownerId, purpose: "wish_photo", status, contentType: "image/jpeg", bytes: 10n, objectKey: `r3/${id}`, variants: [], driver: "r2" } as never });
    await k.db.wishFile.create({ data: { id: ids.next(), wishId, fileId: id, role } as never });
    return id;
  };

  it("1. mint: the run makes one random token bound to its job and wish, kept only hashed, 900 seconds; no route mints one; it is in no payload, log or row in the clear", async () => {
    const { a, w } = await wishFor();
    const r = await rendering(w, a.auth);
    const row = await k.db.renderJob.findUniqueOrThrow({ where: { id: r.jobId } });
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(r.token);
    expect(row.tokenExpiresAt?.getTime()).toBe(NOW.getTime() + 900_000);
    expect(row.tokenUsedAt).toBeNull();
    expect(row.wishId).toBe(w);
    // a second run of another job makes another token
    const other = await wishFor();
    const r2 = await rendering(other.w, other.a.auth);
    expect(r2.token).not.toBe(r.token);
    // nothing but the id is in the job's payload; the token is in no stored row, notice, audit entry or log line
    const job = await k.db.job.findFirstOrThrow({ where: { type: "render_video" as never, subjectId: r.jobId } });
    expect(JSON.stringify(job)).toBe(JSON.stringify(job).replace(r.token, "")); // not there
    expect(Object.keys(job).sort()).toEqual(["attempts", "createdAt", "id", "runAt", "status", "subjectId", "type"]);
    for (const t of [r.token, r2.token]) {
      const dump = JSON.stringify([await k.db.renderJob.findMany(), await k.db.notice.findMany(), await k.db.auditEntry.findMany(), await k.db.job.findMany(), await k.db.jobRun.findMany()]);
      expect(dump).not.toContain(t);
      expect(logged.join("\n")).not.toContain(t);
    }
    // no route mints: the only addresses on /v1/render are the read
    for (const m of ["post", "put", "patch", "delete"] as const) expect((await http()[m](`/v1/render/${r.token}/wish`).send({})).status).toBe(404);
    expect((await http().post("/v1/render").send({})).status).toBe(404);
    await r.finish();
    await r2.finish();
  });

  it("1. source: only the job's run makes a token, and no logger call in the render folder names it", () => {
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.endsWith(".spec.ts") && !p.includes("/tests/")) files.push(p);
      }
    };
    walk(join(__dirname, "../../.."));
    const makers = files.filter((f) => /\btokens\.make\(\)/.test(readFileSync(f, "utf8")));
    expect(makers.map((f) => f.split("/").pop())).toEqual(["render-jobs.service.ts"]);
    for (const f of files.filter((x) => x.includes("/render-jobs/"))) {
      const calls = readFileSync(f, "utf8").split("\n").filter((l) => /\blog\.(log|warn|error|debug|verbose)\(/.test(l));
      for (const c of calls) expect(c).not.toMatch(/token/i);
    }
  });

  it("2. the read answers what the player needs: the opened view, no opening, signed files that live the limit plus a margin, the style, the kind and length; no-store", async () => {
    const { a, w, no } = await wishFor({ content: { to: "Ada", text: "Happy birthday", opening: { id: "plain", scene: "letter" } } });
    const photo = await addFile(a.id, w, "ready");
    const r = await rendering(w, a.auth);
    const res = await readWish(r.token).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ kind: "status-video", seconds: 60, width: 1080, height: 1920 });
    expect(res.body.wish).toMatchObject({ state: "open", openable: true, opening: null, wishNo: no, receiverName: "Ada", styleSlug: "golden", kind: "birthday", house: false });
    expect(res.body.wish.content).toMatchObject({ to: "Ada", text: "Happy birthday" });
    expect(res.body.wish.files).toHaveLength(1);
    expect(res.body.wish.content.files).toEqual(res.body.wish.files);
    expect(res.body.wish.files[0]).toMatchObject({ fileId: photo, role: "photo" });
    // the job's limit (1200 s) plus a margin of ten minutes, not the ten minutes of an ordinary read
    expect(Date.parse(res.body.wish.files[0].expiresAt)).toBe(NOW.getTime() + 1800_000);
    expect(res.body.wish.files[0].url).toMatch(/signature=/);
    expect(res.body.style).toEqual({ style: "golden", items: [], document: null }); // a house style holds no Studio document
    await r.finish();
  });

  it("2. a Studio style: its approved document and its files (signed for the render) come with the wish", async () => {
    const styleId = ids.next();
    const slug = testSlug("r3st");
    const doc = { name: "Gold hour", base: "noir", brief: "Warm light.", theme: {}, scenes: { letter: { layers: {} } }, art: [], made: { kinds: ["love"], occasions: {}, best: "portrait" } };
    await k.db.style.create({ data: { id: styleId, slug, on: true, name: "Gold hour", level: "free", house: false } as never });
    await k.db.studioStyle.create({ data: { id: styleId, status: "live", liveAt: NOW, document: doc, version: 1 } });
    const asset = ids.next();
    await k.db.storedFile.create({ data: { cleanAt: new Date(), id: asset, purpose: "studio_asset", status: "ready", contentType: "image/png", bytes: 10n, objectKey: `r3/${asset}`, variants: [], driver: "r2", styleId } as never });
    const { a, w } = await wishFor({ styleSlug: slug });
    const r = await rendering(w, a.auth);
    const res = await readWish(r.token).expect(200);
    expect(res.body.style.style).toBe(slug);
    expect(res.body.style.document).toMatchObject({ id: styleId, name: "Gold hour", base: "noir" });
    expect((res.body.style.items as Body[]).map((i) => i.fileId as string)).toEqual([asset]);
    expect(Date.parse(res.body.style.items[0].expiresAt)).toBe(NOW.getTime() + 1800_000);
    await r.finish();
  });

  it("2. a passcode and a question wish give their content (IK6); the secret and its hash never appear", async () => {
    const hash = `scrypt$${"ab".repeat(8)}$${"cd".repeat(32)}`;
    const mk = (opening: Body) => wishFor({ passcodeHash: hash, content: { text: "For you", opening } });
    const p = await mk({ id: "passcode", scene: "lock", values: { hint: "our street" } });
    const q = await mk({ id: "question", scene: "ask", values: { question: "Where did we meet?" } });
    for (const x of [p, q]) {
      const r = await rendering(x.w, x.a.auth);
      const res = await readWish(r.token).expect(200);
      const text = JSON.stringify(res.body);
      expect(res.body.wish.content.text).toBe("For you");
      expect(text).not.toContain(hash);
      expect(text).not.toMatch(/passcodeHash|scrypt|"code"|"answer"/);
      expect(res.body.wish.state).toBe("open");
      await r.finish();
    }
    expect(JSON.stringify((await readWish("x")).body)).not.toContain(hash);
  });

  it("3. one use: the second read is 410; expired is 410; unknown and malformed are 404 with the same words; a token reads only its own wish; an ended job's token reads nothing", async () => {
    const A = await wishFor({ content: { text: "wish A" } });
    const B = await wishFor({ content: { text: "wish B" } });
    const ra = await rendering(A.w, A.a.auth);
    const rb = await rendering(B.w, B.a.auth);
    const a1 = await readWish(ra.token).expect(200);
    expect(a1.body.wish.content.text).toBe("wish A");
    expect(a1.body.wish.wishNo).toBe(A.no);
    expect((await readWish(ra.token)).status).toBe(410);
    const b1 = await readWish(rb.token).expect(200);
    expect(b1.body.wish.content.text).toBe("wish B");
    expect(JSON.stringify(b1.body)).not.toContain("wish A");
    await ra.finish();
    await rb.finish();
    // used tokens answer no wish
    const dead = await readWish(ra.token);
    expect(JSON.stringify(dead.body)).not.toMatch(/wish A|content/);
    // expired
    const C = await wishFor();
    const rc = await rendering(C.w, C.a.auth);
    k.t.clock.set(new Date(NOW.getTime() + 901_000));
    expect((await readWish(rc.token)).status).toBe(410);
    k.t.clock.set(NOW);
    // an unknown token, a wrong one (one character changed) and a malformed one: the same status and words
    const wrong = rc.token.slice(0, -1) + (rc.token.endsWith("A") ? "B" : "A");
    const answers = await Promise.all([readWish("a".repeat(43)), readWish(wrong), readWish("short"), readWish("%20%20")]);
    for (const x of answers) {
      expect(x.status).toBe(404);
      const { requestId: _r, ...rest } = x.body.error;
      expect(rest).toEqual({ code: "not_found", message: "No such render." });
    }
    // a job that ended kills its token (never read)
    const D = await wishFor();
    const rd = await rendering(D.w, D.a.auth);
    expect(await rd.finish()).toBe("done");
    expect([404, 410]).toContain((await readWish(rd.token)).status);
    // a job cancelled in the store while its token is still stored: the read is refused
    const E = await wishFor();
    const re = await rendering(E.w, E.a.auth);
    await k.db.renderJob.update({ where: { id: re.jobId }, data: { status: "failed" } });
    const gone = await readWish(re.token);
    expect(gone.status).toBe(410);
    expect(JSON.stringify(gone.body)).not.toContain("content");
    for (const x of [rc, re]) await x.finish();
  });

  it("3. two reads at once of one token: one wins", async () => {
    const { a, w } = await wishFor();
    const r = await rendering(w, a.auth);
    const both = await Promise.all([readWish(r.token), readWish(r.token)]);
    expect(both.map((x) => x.status).sort()).toEqual([200, 410]);
    await r.finish();
  });

  it("4. erase and refund (IK4a): a wish erased, or an extra refunded, between mint and read is 404 with nothing returned", async () => {
    const erased = await wishFor({ content: { text: "secret words" } });
    const r1 = await rendering(erased.w, erased.a.auth);
    await k.db.wish.update({ where: { id: erased.w }, data: { erasedAt: NOW } });
    const res1 = await readWish(r1.token);
    expect(res1.status).toBe(404);
    expect(JSON.stringify(res1.body)).not.toMatch(/secret words|files|url/);

    const paid = await wishFor({ content: { text: "paid words" } }, [SKU]);
    const r2 = await rendering(paid.w, paid.a.auth);
    const pid = ids.next();
    await k.db.payment.create({
      data: { id: pid, accountId: paid.a.id, payerContact: "x@example.com", purpose: "extra", subjectId: paid.w, lines: [{ sku: SKU, name: "v", qty: 1, unitKobo: 100, totalKobo: 100 }], amountKobo: 100n, currency: "NGN", priceBookVersion: (await k.db.price.findFirstOrThrow({ where: { sku: SKU }, orderBy: { version: "desc" } })).version,
        status: "succeeded", provider: "paystack", providerReference: `fw-${pid}`, idempotencyKey: `${paid.a.id}:${pid}`, channel: "card", options: { request: { purpose: "extra", subjectId: paid.w }, server: { fingerprint: pid, flags: [] } } } as never,
    });
    await k.db.purchaseGrant.create({ data: { id: ids.next(), paymentId: pid, accountId: paid.a.id, wishId: paid.w, kind: "extra", sku: SKU, detail: {}, startsAt: NOW, createdAt: NOW } as never });
    // before the refund the same shape of wish reads
    const fine = await wishFor({ content: { text: "fine" } });
    const r3 = await rendering(fine.w, fine.a.auth);
    expect((await readWish(r3.token)).status).toBe(200);
    await k.db.refund.create({ data: { id: ids.next(), paymentId: pid, amountKobo: 100n, status: "sent", reason: "staff_decision", requestedBy: (await k.staff(["finance"])).id, createdAt: NOW } as never });
    const res2 = await readWish(r2.token);
    expect(res2.status).toBe(404);
    expect(JSON.stringify(res2.body)).not.toMatch(/paid words|files|url/);
    for (const x of [r1, r2, r3]) await x.finish();
  });

  it("5. a wish that is not sealed, taken down, of an erased account, or not yet delivered is 404; a held or refused photo is left out as the public link leaves it out", async () => {
    const cases: [string, (w: string, accountId: string) => Promise<unknown>][] = [
      ["draft", (w) => k.db.wish.update({ where: { id: w }, data: { status: "draft" } })],
      ["taken down", (w) => k.db.wish.update({ where: { id: w }, data: { status: "removed", removedAt: NOW } })],
      ["erased account", (_w, id) => k.db.account.update({ where: { id }, data: { erasedAt: NOW } })],
    ];
    for (const [name, change] of cases) {
      const x = await wishFor({ content: { text: `words of ${name}` } });
      const r = await rendering(x.w, x.a.auth);
      await change(x.w, x.a.id);
      const res = await readWish(r.token);
      expect([name, res.status]).toEqual([name, 404]);
      expect(JSON.stringify(res.body)).not.toContain("words of");
      await r.finish();
    }
    // the public link and the render read give the same files: only a photo that passed screening
    const slug = testSlug("r3l");
    const x = await wishFor({ status: "live", opensAt: new Date(NOW.getTime() - 86_400_000), openedAt: new Date(NOW.getTime() - 3_600_000), endsAt: new Date(NOW.getTime() + 86_400_000), content: { text: "pictures" } });
    await k.db.wishLink.create({ data: { id: ids.next(), slug, wishId: x.w, active: true } });
    const ready = await addFile(x.a.id, x.w, "ready");
    await addFile(x.a.id, x.w, "screening");
    await addFile(x.a.id, x.w, "rejected");
    const r = await rendering(x.w, x.a.auth);
    const res = await readWish(r.token).expect(200);
    const pub = await http().get(`/v1/w/${slug}`).expect(200);
    expect((res.body.wish.files as Body[]).map((f) => f.fileId as string)).toEqual([ready]);
    expect((pub.body.files as Body[]).map((f) => f.fileId as string)).toEqual([ready]);
    expect(res.body.wish.slug).toBe(slug);
    await r.finish();
  });

  it("5. a resting wish (a keepsake file) reads its content too", async () => {
    const x = await wishFor({ status: "resting", openedAt: new Date(NOW.getTime() - 9 * 86_400_000), endsAt: new Date(NOW.getTime() - 86_400_000), content: { text: "resting words" } });
    const r = await rendering(x.w, x.a.auth);
    const res = await readWish(r.token).expect(200);
    expect(res.body).toMatchObject({ kind: "keepsake-export", seconds: 60 });
    expect(res.body.wish.content.text).toBe("resting words");
    await r.finish();
  });

  it("7. the read does not start the term, count an open, notify the sender or mark the wish opened", async () => {
    const x = await wishFor({ content: { text: "unopened" } });
    const r = await rendering(x.w, x.a.auth);
    const snap = async () => ({
      wish: await k.db.wish.findUniqueOrThrow({ where: { id: x.w } }),
      opens: await k.db.wishOpen.count({ where: { wishId: x.w } }),
      notices: await k.db.notice.count(),
      audits: await k.db.auditEntry.count(),
      transitions: await k.db.wishTransition.count({ where: { wishId: x.w } }),
    });
    const before = await snap();
    await readWish(r.token).expect(200);
    const after = await snap();
    expect(after).toEqual(before);
    expect(after.wish.openedAt).toBeNull();
    expect(after.wish.endsAt).toBeNull();
    expect(after.opens).toBe(0);
    await r.finish();
  });

  it("6. limits: the read is limited like the link's reads (a minute, per address), with Retry-After and no-store, even on an error", async () => {
    const from = uniqueAddress();
    let last = 200;
    let res = await readWish("a".repeat(43), from);
    for (let i = 0; i < 70 && last !== 429; i++) {
      res = await readWish("a".repeat(43), from);
      last = res.status;
    }
    expect(last).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((await readWish("a".repeat(43), from)).headers["cache-control"]).toBe("no-store");
  });
});
