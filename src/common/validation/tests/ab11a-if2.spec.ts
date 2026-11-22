import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOT_AN_ID_ROUTES } from "../id-params.interceptor";
import { StandinPayments } from "../../ports/adapters/standins";
import { Money } from "../../money/money";
import { testSlug, testWishNo } from "../../../../test/kit/unique";
import { boot, ids } from "../../../modules/concierge/tests/kit";

const NOW = new Date("2027-07-01T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;
type Endpoint = { id: string; method: string; path: string; auth: { kind: string }[] };

const registry = JSON.parse(readFileSync(join(__dirname, "../../../../.pipeline/registry.json"), "utf8")) as { resources: { endpoints: Endpoint[] }[] };
const ID_NAMES = ["id", "wishId", "fileId", "voiceId", "creator", "reference"];
/** every route of the registry (the route table) that takes an id in its path */
const routes = registry.resources.flatMap((r) => r.endpoints).filter((e) => e.method !== "INTERNAL" && !NOT_AN_ID_ROUTES.includes(`${e.method} ${e.path}`) && [...e.path.matchAll(/:(\w+)/g)].some((m) => ID_NAMES.includes(m[1])));

const UUID7 = "0192f5a0-1c2b-7000-8000-0123456789ab";
const JUNK = ["not-an-id", "12345", "0192f5a0-1c2b-7000-8000-0123456789a", "0192f5a0-1c2b-7000-8000-0123456789abc", "%27%20OR%201=1", "null"];

/** API-BASE-11A case 2 (IF2a): a non-id in the path is 404, in a body or query field 422, never 500; an id in any case is the same id. */
describe("IF2a: ids in every spelling", () => {
  let k: Kit;
  let staffAuth: string;
  let userAuth: string;
  let std: StandinPayments;
  beforeAll(async () => {
    k = await boot("ab11a2", NOW);
    staffAuth = (await k.staff(["owner", "ops", "maker"])).auth;
    const id = ids.next();
    await k.db.account.create({ data: { id, contact: `ab11a2-${process.pid}@example.com`, sides: ["person", "creator", "business"], lastSide: "person" } });
    k.t.tokens.set(`user-${id}`, { kind: "user", accountId: id, sides: ["person", "creator", "business"] });
    userAuth = `Bearer user-${id}`;
    std = k.t.payments;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const call = (e: Endpoint, values: Record<string, string>) => {
    const url = e.path.replace(/:(\w+)/g, (_m, name: string) => values[name] ?? "x");
    const staff = e.auth.some((a) => a.kind === "staff role");
    const agent = k.t.http();
    const verb = e.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
    const r = agent[verb](url);
    if (e.auth.some((a) => a.kind !== "public")) r.set("Authorization", staff ? staffAuth : userAuth);
    return verb === "get" || verb === "delete" ? r : r.send({});
  };
  const names = (e: Endpoint) => [...e.path.matchAll(/:(\w+)/g)].map((m) => m[1]).filter((n) => ID_NAMES.includes(n));
  const good = (name: string) => (name === "reference" ? `fw-${UUID7}` : UUID7);

  it(`IF2a: a non-id in the path answers as it always has, never 500 and never 200 (${routes.length} routes); the path is not answered with 422 for its id`, async () => {
    expect(routes.length).toBeGreaterThanOrEqual(90);
    const wrong: string[] = [];
    let notFound = 0;
    for (const e of routes) {
      for (const name of names(e)) {
        for (const junk of JUNK) {
          const values: Record<string, string> = Object.fromEntries(names(e).map((n) => [n, good(n)]));
          values[name] = junk;
          const r = await call(e, values);
          const fields = (r.body as { error?: { fields?: Record<string, string> } }).error?.fields ?? {};
          if (r.status === 404) notFound++;
          if (r.status >= 500 || r.status === 200 || r.status === 201 || fields[name]) wrong.push(`${e.method} ${e.path} ${name}=${junk} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(notFound).toBeGreaterThan(routes.length);
  });

  it("an id in upper or mixed case is not refused anywhere and reads as the lower case id: it reaches the route and is looked up as lower case", async () => {
    const wrong: string[] = [];
    for (const e of routes) {
      const values: Record<string, string> = Object.fromEntries(names(e).map((n) => [n, good(n).toUpperCase()]));
      const r = await call(e, values);
      const fields = (r.body as { error?: { fields?: Record<string, string> } }).error?.fields ?? {};
      if (r.status >= 500 || names(e).some((n) => /^Not an? /.test(fields[n] ?? ""))) wrong.push(`${e.method} ${e.path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    }
    expect(wrong).toEqual([]);
  });

  it("the wish read, the payment read and drop by reference, and the link routes give the same answer in any case of the id", async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "draft" });
    const wish = (id: string) => k.t.http().get(`/v1/wishes/${id}`).set("Authorization", a.auth);
    const lower = await wish(w);
    expect(lower.status).toBe(200);
    for (const id of [w.toUpperCase(), w.replace(/[a-f]/g, (c, i: number) => (i % 2 ? c.toUpperCase() : c))]) {
      const r = await wish(id);
      expect(r.status).toBe(200);
      expect(r.body.id).toBe(w);
    }
    // the link routes: the link of the wish read in any case
    const sealed = await k.wish(a.id, { status: "live", ticket: "keepsake", no: testWishNo(), endsAt: new Date(NOW.getTime() + 5 * 86_400_000) });
    await k.db.wishLink.create({ data: { id: ids.next(), slug: testSlug("if2"), wishId: sealed, active: true } });
    const linkLower = await k.t.http().get(`/v1/wishes/${sealed}/link`).set("Authorization", a.auth);
    const linkUpper = await k.t.http().get(`/v1/wishes/${sealed.toUpperCase()}/link`).set("Authorization", a.auth);
    expect(linkLower.status).toBe(200);
    expect([linkUpper.status, linkUpper.body]).toEqual([200, linkLower.body]);
    // the payment read by reference in any case; a waiting payment is dropped by an upper-case reference; a paid one is read as paid
    const start = (ticket: string, wishId: string) => k.t.http().post("/v1/payments").set("Authorization", a.auth).set("Idempotency-Key", `ab11a2-${process.pid}-${ticket}-${wishId}`).send({ purpose: "ticket", ticket, subjectId: wishId.toUpperCase() });
    const first = await start("moment", w);
    expect(first.status).toBe(201);
    const ref = first.body.payment.reference as string;
    const read = await k.t.http().get(`/v1/payments/${ref.toUpperCase()}`).set("Authorization", a.auth);
    expect(read.status).toBe(200);
    expect(read.body.reference).toBe(ref);
    expect(read.body.subjectId).toBe(w);
    const dropped = await k.t.http().post(`/v1/payments/${ref.toUpperCase()}/drop`).set("Authorization", a.auth);
    expect(dropped.status).toBe(200);
    expect(dropped.body.status).toBe("abandoned");
    const w2 = await k.wish(a.id, { status: "draft" });
    const second = await start("keepsake", w2);
    expect(second.status).toBe(201);
    const ref2 = second.body.payment.reference as string;
    std.settle(ref2, "success", Money.kobo(BigInt(second.body.payment.amountKobo)));
    const settled = await k.t.http().get(`/v1/payments/${ref2.toUpperCase()}`).set("Authorization", a.auth);
    expect(settled.status).toBe(200);
    expect(settled.body.state).toBe("succeeded");
    expect((await k.db.wish.findUniqueOrThrow({ where: { id: w2 } })).ticket).toBe("keepsake");
    // a subject that is not an id at a payment start is 422 in words
    const bad = await k.t.http().post("/v1/payments").set("Authorization", a.auth).set("Idempotency-Key", `ab11a2-${process.pid}-bad-key`).send({ purpose: "ticket", ticket: "moment", subjectId: "not-an-id" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.subjectId).toMatch(/^Not an id/);
    // IF2a: an id in a body field that is not an id is 422 in words (the keep body's wishId); in the path the same word is 404
    const keep = await k.t.http().post(`/v1/wishes/${w}/keep`).set("Authorization", a.auth).set("Idempotency-Key", `ab11a2-${process.pid}-keep-key`).send({ keepKey: "month", wishId: "not-an-id" });
    expect(keep.status).toBe(422);
    expect((await k.t.http().get("/v1/wishes/not-an-id").set("Authorization", a.auth)).status).toBe(404);
    expect((await k.t.http().get("/v1/payments/fw-not-a-payment").set("Authorization", a.auth)).status).toBe(404);
  });
});
