import type { Response } from "supertest";
import { PrismaService } from "../../../common/db/prisma.service";
import { SessionFamilies } from "../../../common/auth/session-families";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";

/*
 * Test helpers for the sign-in bundle. The app runs with the kernel's real verifier (not the kit's token map), so tokens the
 * API issues are the tokens the tests send. Emails and IPs are unique per call, so specs never share rate-limit rows.
 */

export interface SignInApp extends TestApp {
  db: PrismaService;
}

export async function signInApp(now?: Date): Promise<SignInApp> {
  // Every app starts at the same frozen moment unless told otherwise: stand-in ids never repeat across apps (T6).
  const t = await createTestApp({ now, realTokens: true });
  return { ...t, db: t.app.get(PrismaService) };
}

let seq = 0;
const run = `${process.pid}${Date.now() % 100000}`;
export function uniqueEmail(tag: string): string {
  return `${tag}-${run}-${++seq}@example.com`;
}
/** AA6: the kit's per-worker address block, so two specs never share a per-address limit. */
export function uniqueIp(): string {
  return uniqueAddress();
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
  sessionId: string;
}

/** The subject (account or staff id) of an access token. */
export function subOf(token: string): string {
  return (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub: string }).sub;
}

/** Asks for a code and verifies it; returns the access token and the refresh cookie. Moves the clock past the resend wait first. */
export async function signIn(t: TestApp, email: string, ip = uniqueIp()): Promise<Signed> {
  t.clock.advance(61_000);
  const asked = await t.http().post("/v1/auth/codes").set("X-Forwarded-For", ip).send({ contact: email, via: "email" });
  if (asked.status !== 200) throw new Error(`code request answered ${asked.status}: ${JSON.stringify(asked.body)}`);
  const res = await t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", ip).send({ contact: email, code: codeFor(t, email) });
  if (res.status !== 200) throw new Error(`verify answered ${res.status}: ${JSON.stringify(res.body)}`);
  const body = res.body as Record<string, unknown>;
  const accessToken = body.accessToken as string;
  return { accountId: subOf(accessToken), accessToken, cookie: refreshCookieOf(res) as string, body, sessionId: (body.session as { id: string }).id };
}

/** A staff member with a live session and an access token for it (to prove user routes refuse staff). */
export async function staffToken(t: SignInApp): Promise<string> {
  const staffId = t.app.get(IdGenerator).id();
  await t.db.staffAccount.create({ data: { id: staffId, email: uniqueEmail("staff"), name: "Staff", roles: ["support"], status: "active" } });
  const s = await t.app.get(SessionFamilies).start(t.db, { kind: "staff", staffId }, {}, { seconds: 3600, fromSignIn: true });
  return s.access.token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
