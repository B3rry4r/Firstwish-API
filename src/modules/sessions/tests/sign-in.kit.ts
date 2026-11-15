import type { Response } from "supertest";
import { AccessTokenVerifier } from "../../../common/auth/principal";
import { PrismaService } from "../../../common/db/prisma.service";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccessTokens } from "../access-tokens";
import { JwtAccessTokenVerifier } from "../jwt-access-token.verifier";

/*
 * Test helpers for the sign-in bundle. The app runs with the real JWT verifier (not the kit's token map), so tokens the
 * API issues are the tokens the tests send. Emails and IPs are unique per call, so specs never share rate-limit rows.
 */

export interface SignInApp extends TestApp {
  db: PrismaService;
}

export async function signInApp(): Promise<SignInApp> {
  const holder: { v?: JwtAccessTokenVerifier } = {};
  // The stand-in ids come from the clock and a counter that starts at 0 in every app; specs share one database, so each
  // app starts at its own random moment or two apps would issue the same ids.
  const now = new Date(Date.UTC(2026, 0, 1, 9) + Math.floor(Math.random() * 50 * 365 * 24 * 3600) * 1000);
  const t = await createTestApp({
    now,
    configure: (b) =>
      b.overrideProvider(AccessTokenVerifier).useValue({ verify: (tok: string) => (holder.v ? holder.v.verify(tok) : Promise.resolve(null)) }),
  });
  holder.v = t.app.get(JwtAccessTokenVerifier);
  return { ...t, db: t.app.get(PrismaService) };
}

let seq = 0;
const run = `${process.pid}${Date.now() % 100000}`;
export function uniqueEmail(tag: string): string {
  return `${tag}-${run}-${++seq}@example.com`;
}
export function uniqueIp(): string {
  seq++;
  return `10.${(Number(run) + seq) % 250}.${Math.floor(seq / 250) % 250}.${seq % 250}`;
}

/** The code in the last email the stand-in captured for this address. */
export function codeFor(t: TestApp, email: string): string {
  const m = /(\d{6})/.exec(t.email.lastTo(email)?.text ?? "");
  if (!m) throw new Error(`no code emailed to ${email}`);
  return m[1];
}

/** The refresh cookie value from a response, or null. */
export function refreshCookieOf(res: Response): string | null {
  const raw = res.headers["set-cookie"] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const c = list.find((x) => x.startsWith("fw_refresh="));
  if (!c) return null;
  const v = c.slice("fw_refresh=".length).split(";")[0];
  return v || null;
}

export interface Signed {
  accountId: string;
  accessToken: string;
  cookie: string;
  body: Record<string, unknown>;
}

/** Asks for a code and verifies it; returns the access token and the refresh cookie. Moves the clock past the resend wait first. */
export async function signIn(t: TestApp, email: string, ip = uniqueIp()): Promise<Signed> {
  t.clock.advance(61_000);
  const asked = await t.http().post("/v1/auth/codes").set("X-Forwarded-For", ip).send({ contact: email, via: "email" });
  if (asked.status !== 200) throw new Error(`code request answered ${asked.status}: ${JSON.stringify(asked.body)}`);
  const res = await t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", ip).send({ contact: email, code: codeFor(t, email) });
  if (res.status !== 200) throw new Error(`verify answered ${res.status}: ${JSON.stringify(res.body)}`);
  const body = res.body as Record<string, unknown>;
  return { accountId: body.accountId as string, accessToken: body.accessToken as string, cookie: refreshCookieOf(res) as string, body };
}

/** A staff member with a live session and an access token for it (to prove user routes refuse staff). */
export async function staffToken(t: SignInApp): Promise<string> {
  const ids = t.app.get(IdGenerator);
  const staffId = ids.id();
  const sid = ids.id();
  await t.db.staffAccount.create({ data: { id: staffId, email: uniqueEmail("staff"), name: "Staff", roles: ["support"], status: "active" } });
  await t.db.session.create({
    data: { id: sid, staffId, familyId: sid, refreshTokenHash: "x", expiresAt: new Date(t.clock.now().getTime() + 3600_000) },
  });
  return t.app.get(AccessTokens).issue("staff", staffId, sid).token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
