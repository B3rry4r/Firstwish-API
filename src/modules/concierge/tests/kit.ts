import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, TestAppOptions } from "../../../../test/kit/app";

const ROOT = join(__dirname, "../../../..");
export const ids = new UuidV7Maker();
let seq = 0;

/** The app with the seeded price book and role table, and the small makers of rows these specs share. Each spec owns its rows. */
export async function boot(prefix: string, now: Date, opts: TestAppOptions = {}) {
  const t: TestApp = await createTestApp({ now, ...opts });
  const db = t.app.get(PrismaService);
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  const account = async (sides: ("person" | "business")[] = ["person"]) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `${prefix}-${process.pid}-${++seq}@example.com`, sides, lastSide: sides[0] } });
    t.tokens.set(`user-${id}`, { kind: "user", accountId: id, sides });
    return { id, auth: `Bearer user-${id}` };
  };
  const staff = async (roles: ("maker" | "ops" | "owner" | "finance")[]) => {
    const id = ids.next();
    await db.staffAccount.create({ data: { id, email: `${prefix}-staff-${process.pid}-${++seq}@example.com`, name: `Staff ${seq}`, roles, status: "active" } });
    t.tokens.set(`staff-${id}`, { kind: "staff", staffId: id, roles });
    return { id, auth: `Bearer staff-${id}` };
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "sealed", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ...over } as never });
    return id;
  };
  return { t, db, account, staff, wish };
}

/** The server's own signed PUT goes to the stand-in storage (nothing leaves the machine); `fail` makes storage refuse. */
export function routeStorage(t: TestApp): { fail: boolean; restore: () => void } {
  const state = { fail: false, restore: () => undefined as void };
  const real = globalThis.fetch;
  globalThis.fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!url.startsWith("https://storage.standin.invalid/")) return real(input as never, init);
    if (state.fail) return new Response("no", { status: 500 });
    const key = decodeURI(new URL(url).pathname.replace(/^\/[^/]+\//, ""));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const ok = t.storage.putSigned(key, Buffer.from(init?.body as Uint8Array), headers["content-type"]);
    return new Response(ok ? "" : "bad", { status: ok ? 200 : 403 });
  };
  state.restore = () => {
    globalThis.fetch = real;
  };
  return state;
}
