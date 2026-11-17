import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";

const ROOT = join(__dirname, "../../../..");
export const NOW = new Date("2027-03-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

type Req = ReturnType<ReturnType<TestApp["http"]>["post"]>;

export interface Biz {
  accountId: string;
  businessId: string;
  token: string;
  email: string;
}

/** The shared set-up of the API-BASE-9 specs: an app, a seeded database, every request from an address of this spec's own, and makers of businesses, shoots, files and wishes. */
export function useKit(now: Date = NOW) {
  const k = {} as {
    t: TestApp;
    db: PrismaService;
    address: string;
    ids: UuidV7Maker;
    who: (email?: string) => Promise<{ accountId: string; email: string; token: string }>;
    owner: (over?: Record<string, unknown>) => Promise<Biz>;
    login: (o: Biz, status?: string) => Promise<{ accountId: string; email: string; token: string }>;
    vaultFile: (o: Biz, bytes?: number, status?: "ready" | "screening", type?: string) => Promise<string>;
    shootWith: (o: Biz, set?: "proofs" | "finals", n?: number) => Promise<{ shoot: string; files: string[] }>;
    clientWish: (o: Biz, client?: string) => Promise<string>;
    post: (path: string, token: string, body?: object, headers?: Record<string, string>) => Req;
    get: (path: string, token: string) => Req;
    patch: (path: string, token: string, body?: object) => Req;
    codeOf: (link: string) => string;
    revealBody: (over?: Record<string, unknown>) => Record<string, unknown>;
  };
  beforeAll(async () => {
    k.t = await createTestApp({ now });
    k.db = k.t.app.get(PrismaService);
    k.ids = ids;
    k.address = uniqueAddress();
    const plain = k.t.http;
    k.t.http = () => {
      const agent = plain();
      const verbs = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
      return new Proxy(agent, {
        get: (target, prop) => {
          const v = (target as unknown as Record<string | symbol, unknown>)[prop];
          return typeof prop === "string" && verbs.has(prop) ? (url: string) => (v as (u: string) => { set: (a: string, b: string) => unknown }).call(target, url).set("x-forwarded-for", k.address) : v;
        },
      });
    };
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    k.who = async (email = `ab9-${run}-${++seq}@example.com`) => {
      const accountId = ids.next();
      await k.db.account.create({ data: { id: accountId, contact: email, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
      const token = `ab9-${accountId}`;
      k.t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
      return { accountId, email, token };
    };
    k.owner = async (over = {}) => {
      const w = await k.who();
      const businessId = ids.next();
      await k.db.business.create({
        data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Lens House", since: now, plan: "starter", renews: new Date("2027-06-01T09:00:00.000Z"), allowance: 10, used: 0, rolled: 0, month: "2027-03", ...over },
      });
      return { ...w, businessId };
    };
    k.login = async (o, status = "active") => {
      const w = await k.who();
      await k.db.login.create({ data: { id: ids.next(), businessId: o.businessId, contact: w.email, status } });
      return w;
    };
    k.vaultFile = async (o, bytes = 1000, status = "ready", type = "image/jpeg") => {
      const id = ids.next();
      await k.db.storedFile.create({ data: { id, ownerAccountId: o.accountId, businessId: o.businessId, purpose: "vault_file", objectKey: `vault-file/${id}/k`, contentType: type, bytes: BigInt(bytes), status, variants: [], driver: "r2" } });
      return id;
    };
    k.shootWith = async (o, set = "proofs", n = 2) => {
      const s = await k.t.http().post("/v1/business/shoots").set(auth(o.token)).send({ client: "Ada Obi", date: "2027-02-20", title: "Wedding" });
      if (s.status !== 201) throw new Error(`shoot ${s.status}`);
      const files: string[] = [];
      for (let i = 0; i < n; i++) files.push(await k.vaultFile(o, 1000 + i));
      const r = await k.t.http().post(`/v1/business/shoots/${(s.body as { id: string }).id}/${set === "proofs" ? "files" : "finals"}`).set(auth(o.token)).send({ files, set, shoot: (s.body as { id: string }).id });
      if (r.status !== 201) throw new Error(`files ${r.status}`);
      return { shoot: (s.body as { id: string }).id, files };
    };
    k.clientWish = async (o, client = "Ada Obi") => {
      const id = ids.next();
      await k.db.clientWish.create({ data: { id, businessId: o.businessId, client, kind: "photographers", occasion: "wedding", day: new Date("2027-03-01T00:00:00Z"), no: `09${++seq}`, key: `k-${id}`, wish: "", shoot: "", hearts: [], sentAt: now } });
      return id;
    };
    k.post = (path, token, body = {}, headers = {}) => k.t.http().post(path).set(auth(token)).set(headers).send(body);
    k.get = (path, token) => k.t.http().get(path).set(auth(token));
    k.patch = (path, token, body = {}) => k.t.http().patch(path).set(auth(token)).send(body);
    k.codeOf = (link) => link.split("/r/")[1] ?? "";
    k.revealBody = (over = {}) => ({ client: "Ada Obi", occasion: "Wedding", city: "Lagos", date: "2027-02-20", note: "Thank you.", credits: [], style: "golden", ...over });
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(now));
  return k;
}
