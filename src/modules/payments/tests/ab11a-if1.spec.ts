import { ENV } from "../../../common/env/env.module";
import type { Env } from "../../../common/env/env";
import { testSlug, testWishNo, RUN } from "../../../../test/kit/unique";
import { uniqueAddress } from "../../../../test/kit/app";
import { boot, ids } from "../../concierge/tests/kit";

const NOW = new Date("2027-06-07T09:00:00.000Z");
const DAY = 86_400_000;
const run = RUN;
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-11A case 1 (IF1): a payment start may name where the payer comes back to. */
describe("IF1: the return path of a payment start", () => {
  let k: Kit;
  let site: string;
  const address = uniqueAddress();
  let n = 0;
  const key = () => `ab11a-${run}-${++n}-key`;
  beforeAll(async () => {
    k = await boot("ab11a1", NOW);
    site = k.t.app.get<Env>(ENV).PUBLIC_SITE_URL.replace(/\/+$/, "");
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  const draft = (accountId: string) => k.wish(accountId, { status: "draft" });
  const liveWish = (accountId: string, over: Record<string, unknown> = {}) =>
    k.wish(accountId, { status: "live", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - 9 * DAY), openedAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() + 5 * DAY), ...over });
  const post = (auth: string, body: Record<string, unknown>, idem = key()) => http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", idem).send(body);
  const lastStart = () => k.t.payments.started[k.t.payments.started.length - 1];
  const rows = (subject: string) => k.db.payment.count({ where: { subjectId: subject } });
  const reasonOf = (r: { status: number; body: { error?: { fields?: Record<string, string> } } }) => r.body.error?.fields?.returnPath ?? "";
  const back = (path: string, reference: string) => `${site}${path}?reference=${encodeURIComponent(reference)}`;

  it("a ticket start gives the provider the site's address, the path and the reference; the stand-in returns there too; no path is as before", async () => {
    const a = await k.account();
    const w = await draft(a.id);
    const r = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w, returnPath: `/app/wishes/${w}` });
    expect(r.status).toBe(201);
    const ref = r.body.payment.reference as string;
    expect(lastStart().callbackUrl).toBe(back(`/app/wishes/${w}`, ref));
    expect(r.body.payment.authorizationUrl).toBe(`https://checkout.standin.invalid/${encodeURIComponent(ref)}?return=${encodeURIComponent(lastStart().callbackUrl as string)}`);
    // the web's own callback page is served for any payment
    const w2 = await draft(a.id);
    const r2 = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w2, returnPath: "/app/wishes/return" });
    expect(r2.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back("/app/wishes/return", r2.body.payment.reference));
    // no path: today's behaviour (the provider's own default address, no return on the stand-in address)
    const w3 = await draft(a.id);
    const r3 = await post(a.auth, { purpose: "ticket", ticket: "keepsake", subjectId: w3 });
    expect(r3.status).toBe(201);
    expect(lastStart().callbackUrl).toBeUndefined();
    expect(r3.body.payment.authorizationUrl).toBe(`https://checkout.standin.invalid/${encodeURIComponent(r3.body.payment.reference)}`);
  });

  it("refused in words, before anything is stored or asked of the provider", async () => {
    const a = await k.account();
    const w = await draft(a.id);
    const other = await draft(a.id);
    const bad: [string, string, RegExp][] = [
      ["an outside address", "https://evil.example/app/wishes/return", /starts with one \/|not an address/],
      ["//host", "//evil.example/app/wishes/return", /\/\/.*another site/],
      ["a scheme", "javascript:alert(1)", /starts with one \//],
      ["a scheme after the slash", "/javascript:alert(1)", /scheme/],
      ["a backslash", "/\\evil.example", /backslash/],
      ["a backslash inside", "/app/wishes\\return", /backslash/],
      ["a control character", "/app/wishes/return\n", /control/],
      ["a tab", "/app/wishes/\treturn", /control/],
      ["2,000 characters", `/${"a".repeat(1999)}`, /shorter/],
      ["a query", "/app/wishes/return?next=https://evil.example", /\? and #/],
      ["a fragment", "/app/wishes/return#x", /\? and #/],
      ["an encoded slash", "/app/wishes/%2Freturn", /plain path/],
      ["dot dot", "/app/wishes/../admin", /plain path/],
      ["a path the web does not serve", "/admin", /no page at that path/],
      ["another wish's page", `/app/wishes/${other}`, /no page at that path/],
      ["a plan's page for a ticket", "/app/pro/plan", /no page at that path/],
      ["a link page that is not this wish's", `/w/${testSlug("none")}`, /no page at that path/],
      ["an empty path", "", /starts with one \//],
    ];
    const calls = k.t.payments.started.length;
    for (const [what, path, words] of bad) {
      const r = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w, returnPath: path });
      expect([what, r.status]).toEqual([what, 422]);
      expect([what, reasonOf(r)]).toEqual([what, expect.stringMatching(words)]);
    }
    expect((await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w, returnPath: 7 })).status).toBe(422);
    expect(await rows(w)).toBe(0);
    expect(k.t.payments.started.length).toBe(calls);
  });

  it("the same key with a different path: the first start wins and a different path is 409; the same path returns the same payment", async () => {
    const a = await k.account();
    const w = await draft(a.id);
    const idem = key();
    const first = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w, returnPath: `/app/wishes/${w}` }, idem);
    expect(first.status).toBe(201);
    const calls = k.t.payments.started.length;
    const other = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w, returnPath: "/app/wishes/return" }, idem);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("idempotency_key_reused");
    const none = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w }, idem);
    expect(none.status).toBe(409);
    const same = await post(a.auth, { purpose: "ticket", ticket: "moment", subjectId: w, returnPath: `/app/wishes/${w}` }, idem);
    expect([200, 201]).toContain(same.status);
    expect(same.body.payment.reference).toBe(first.body.payment.reference);
    expect(k.t.payments.started.length).toBe(calls);
    expect(await rows(w)).toBe(1);
    const row = await k.db.payment.findUniqueOrThrow({ where: { providerReference: first.body.payment.reference } });
    expect((row.options as { request: { returnPath: string } }).request.returnPath).toBe(`/app/wishes/${w}`);
  });

  it("an extra, and the owner's keep and wake, take a path; a path of another subject is refused", async () => {
    const a = await k.account();
    const w = await liveWish(a.id);
    const held = await k.wish(a.id, { status: "draft", ticket: "signature" });
    const extra = await post(a.auth, { purpose: "extra", id: "five-photos", subjectId: held, returnPath: `/app/wishes/${held}` });
    expect(extra.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back(`/app/wishes/${held}`, extra.body.payment.reference));
    expect((await post(a.auth, { purpose: "extra", id: "five-photos", subjectId: held, returnPath: "/app/pass" })).status).toBe(422);
    // keep on a live wish, by the keep route
    const keepAt = (wish: string, body: Record<string, unknown>) => http().post(`/v1/wishes/${wish}/keep`).set("Authorization", a.auth).set("Idempotency-Key", key()).send(body);
    const keep = await keepAt(w, { keepKey: "month", returnPath: `/app/wishes/${w}` });
    expect(keep.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back(`/app/wishes/${w}`, keep.body.payment.reference));
    expect((await keepAt(w, { keepKey: "half", returnPath: "https://evil.example/" })).status).toBe(422);
    // wake: a keep on a resting wish by its owner
    const rest = await liveWish(a.id, { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY) });
    const wake = await keepAt(rest, { keepKey: "month", returnPath: "/app/wishes/return" });
    expect(wake.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back("/app/wishes/return", wake.body.payment.reference));
    // the same keep through the payments route
    const w2 = await liveWish(a.id);
    const viaPay = await post(a.auth, { purpose: "keep", id: "year", subjectId: w2, returnPath: `/app/wishes/${w2}` });
    expect(viaPay.status).toBe(201);
  });

  it("a link holder with no account comes back to the link, and to no other page", async () => {
    const owner = await k.account();
    const w = await liveWish(owner.id);
    const slug = testSlug("if1");
    await k.db.wishLink.create({ data: { id: ids.next(), slug, wishId: w, active: true } });
    const proof = (await http().get(`/v1/w/${slug}`).set("x-forwarded-for", address)).body.keepOffer.proof as string;
    const start = (returnPath: string | undefined, idem = key()) =>
      http()
        .post(`/v1/w/${slug}/keep`)
        .set("x-forwarded-for", address)
        .set("x-wish-proof", proof)
        .set("Idempotency-Key", idem)
        .send({ keepKey: "month", email: `if1-${run}@example.com`, ...(returnPath === undefined ? {} : { returnPath }) });
    const good = await start(`/w/${slug}`);
    expect(good.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back(`/w/${slug}`, good.body.payment.reference));
    for (const path of ["/app/wishes/return", `/app/wishes/${w}`, `/w/${testSlug("zz")}`, `//evil.example/w/${slug}`, `/w/${slug}?x=1`, "https://evil.example/"]) {
      const r = await start(path);
      expect([path, r.status]).toEqual([path, 422]);
    }
    expect((await start(undefined)).status).toBe(201);
    // a signed-in person who holds the link and pays comes back to it as well
    const receiver = await k.account();
    const viaReceiver = await http()
      .post(`/v1/wishes/${w}/keep`)
      .set("Authorization", receiver.auth)
      .set("x-wish-link", slug)
      .set("x-forwarded-for", address)
      .set("Idempotency-Key", key())
      .send({ keepKey: "half", returnPath: `/w/${slug}` });
    expect(reasonOf(viaReceiver)).toBe("");
    if (viaReceiver.status === 201) expect(lastStart().callbackUrl).toBe(back(`/w/${slug}`, viaReceiver.body.payment.reference));
  });

  it("a plan, a pack, Concierge, the Pass and the Studio's starts take a path the web serves for them", async () => {
    const a = await k.account(["person", "business"]);
    await k.db.business.create({ data: { id: ids.next(), accountId: a.id, name: "Studio" } });
    const plan = await post(a.auth, { purpose: "pro-plan", key: "starter", returnPath: "/app/pro/plan" });
    expect(plan.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back("/app/pro/plan", plan.body.payment.reference));
    expect((await post(a.auth, { purpose: "pro-plan", key: "studio", returnPath: "/app/pass" })).status).toBe(422);
    const pack = await post(a.auth, { purpose: "wish-pack", packs: 1, returnPath: "/app/pro/plan" });
    expect(pack.status).toBe(201);
    expect(lastStart().callbackUrl).toContain(`${site}/app/pro/plan?reference=`);
    // Concierge
    const buyer = await k.account();
    const order = await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false });
    expect(order.status).toBe(201);
    expect((await post(buyer.auth, { purpose: "concierge", subjectId: order.body.id, returnPath: "/admin/concierge" })).status).toBe(422);
    const concierge = await post(buyer.auth, { purpose: "concierge", subjectId: order.body.id, returnPath: "/app/wishes" });
    expect(concierge.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back("/app/wishes", concierge.body.payment.reference));
    // the Pass
    const pass = await post(buyer.auth, { purpose: "pass", returnPath: "/app/pass" });
    expect(pass.status).toBe(201);
    expect(lastStart().callbackUrl).toBe(back("/app/pass", pass.body.payment.reference));
    expect((await post(buyer.auth, { purpose: "pass", returnPath: "/app/pro/plan" })).status).toBe(422);
    // the Studio's own purchases: the path is judged first; a served path is never the reason for a refusal
    const creator = await k.account();
    for (const [purpose, extra] of [["creator-plan", {}], ["signed", {}], ["credit-pack", { packs: 1 }], ["extra-review", {}]] as const) {
      const wrong = await post(creator.auth, { purpose, ...extra, returnPath: "/app/pass" });
      expect([purpose, wrong.status, reasonOf(wrong)]).toEqual([purpose, 422, expect.stringMatching(/no page at that path/)]);
      for (const path of ["/app/creator/studio", "/app/creator", "/app/wishes/return"]) {
        const ok = await post(creator.auth, { purpose, ...extra, returnPath: path });
        expect([purpose, path, reasonOf(ok)]).toEqual([purpose, path, ""]);
        if (ok.status === 201) expect(lastStart().callbackUrl).toBe(back(path, ok.body.payment.reference));
      }
    }
    const vault = await post(a.auth, { purpose: "vault-space", id: "block", packs: 1, returnPath: "/app/pro/vault" });
    expect(reasonOf(vault)).toBe("");
    expect((await post(a.auth, { purpose: "vault-space", id: "block", packs: 1, returnPath: "/app/pro/wishes" })).status).toBe(422);
  });
});
