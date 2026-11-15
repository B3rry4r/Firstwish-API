import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";
import { RateLimited } from "../errors/rate-limited";
import { canonicalEmail } from "../normalise/email";
import { Clock } from "../ports/clock.port";
import { CodeGenerator, IdGenerator } from "../ports/ids.port";

/** Codes: 6 digits, 10 minutes, 5 tries (conventions.md, Signing in). */
export const CODE_DIGITS = 6;
export const CODE_LIFE_SECONDS = 10 * 60;
export const TRIES_PER_CODE = 5;
/** U2 (PROVISIONAL, owner may change): wrong tries per email per hour, across codes, so a new code is no fresh budget. */
export const TRIES_PER_EMAIL_PER_HOUR = 15;
/** V9 (PROVISIONAL, owner may change): code checks per address per hour. */
export const TRIES_PER_ADDRESS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

/** The two sign-ins that use codes. */
export type CodePurpose = "sign_in" | "staff_sign_in";
const DB_PURPOSE: Record<CodePurpose, string> = { sign_in: "sign-in", staff_sign_in: "staff-sign-in" };

export interface Window {
  count: number;
  seconds: number;
}
/** How often a code may be asked for. Every count is a database count (U2): no limit depends on Redis. */
export interface AskLimits {
  /** Seconds before another code may go to the same email (0: none). */
  resendAfterSeconds: number;
  /** Codes per canonical email (V5) in a window. */
  perEmail: Window;
  /** Codes per address in a window. */
  perAddress: Window;
}

export interface CodeAsk {
  /** The email the code goes to, as typed (canon: trimmed, lowercased). */
  destination: string;
  purpose: CodePurpose;
  /** What limits count per address and what is stored: the client address, or its network. */
  address: string | null;
  mode?: "up" | "in" | null;
  limits: AskLimits;
}

export type CodeCheck = { kind: "ok"; id: string } | { kind: "wrong"; left: number } | { kind: "dead" };

const secondsUntil = (from: Date, to: Date): number => Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));

/**
 * The one code helper both sign-ins use (user E-19/E-20 and staff E-174/E-176): U1, U2, V5, V9.
 * Asking: limits counted in the database under a lock per canonical email and per address; a new code ends the older ones.
 * Checking: one UPDATE adds a try only while the code has tries left, and the code is compared only when that UPDATE took the
 * row, so N parallel guesses at one code are at most 5 looked at. Wrong tries are also capped per email per hour across codes,
 * and checks per address per hour. If the database cannot answer, the request fails (503), never let through.
 */
@Injectable()
export class SignInCodes {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Makes and stores a code (hashed). Throws RateLimited past a limit. Runs in the caller's transaction. */
  async issue(tx: Prisma.TransactionClient, ask: CodeAsk): Promise<{ id: string; code: string }> {
    const canonical = canonicalEmail(ask.destination) ?? ask.destination;
    const keys = [`code:${ask.purpose}:email:${canonical}`, ...(ask.address ? [`code:${ask.purpose}:addr:${ask.address}`] : [])].sort();
    for (const k of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${k}))`;
    const now = this.clock.now();
    const { limits } = ask;

    if (limits.resendAfterSeconds > 0) {
      const last = await tx.authCode.findFirst({ where: { canonical, purpose: ask.purpose }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (last && now.getTime() - last.createdAt.getTime() < limits.resendAfterSeconds * 1000) {
        throw new RateLimited(secondsUntil(now, new Date(last.createdAt.getTime() + limits.resendAfterSeconds * 1000)));
      }
    }
    await this.within(tx, { canonical, purpose: ask.purpose }, limits.perEmail, now);
    if (ask.address) await this.within(tx, { ip: ask.address, purpose: ask.purpose }, limits.perAddress, now);

    await tx.authCode.updateMany({
      where: { destination: ask.destination, purpose: ask.purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    const code = this.codes.digits(CODE_DIGITS);
    const id = this.ids.id();
    await tx.authCode.create({
      data: {
        id,
        channel: "email",
        via: "email",
        purpose: ask.purpose,
        mode: ask.mode ?? null,
        destination: ask.destination,
        canonical,
        codeHash: this.hash(ask.purpose, ask.destination, code),
        attempts: 0,
        expiresAt: new Date(now.getTime() + CODE_LIFE_SECONDS * 1000),
        ip: ask.address,
        createdAt: now,
      },
    });
    return { id, code };
  }

  /**
   * Checks a code against the newest open code of the email. A try is counted (and kept, even when the request then fails)
   * before the code is compared. The right code is used up once. Runs in the caller's transaction; the caller must let a
   * "wrong" outcome commit so the try stays counted.
   */
  async check(tx: Prisma.TransactionClient, p: { destination: string; purpose: CodePurpose; code: string; address: string | null }): Promise<CodeCheck> {
    const canonical = canonicalEmail(p.destination) ?? p.destination;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`code-check:${p.purpose}:${canonical}`}))`;
    const now = this.clock.now();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const purpose = DB_PURPOSE[p.purpose];

    if (p.address) {
      const rows = await tx.$queryRaw<{ n: bigint; first: Date | null }[]>`
        SELECT count(*)::bigint AS n, min(c."createdAt") AS first
        FROM auth_code c, unnest(c."triedFrom") AS t(addr)
        WHERE t.addr = ${p.address} AND c.purpose = ${purpose}::"AuthCodePurpose" AND c."createdAt" > ${hourAgo}`;
      if (Number(rows[0]?.n ?? 0) >= TRIES_PER_ADDRESS_PER_HOUR) {
        throw new RateLimited(secondsUntil(now, new Date((rows[0].first ?? now).getTime() + HOUR_MS)), "Too many tries from here. Try again later.");
      }
    }
    const used = await tx.$queryRaw<{ n: bigint; first: Date | null }[]>`
      SELECT COALESCE(sum(attempts), 0)::bigint AS n, min("createdAt") AS first
      FROM auth_code WHERE canonical = ${canonical} AND purpose = ${purpose}::"AuthCodePurpose" AND "createdAt" > ${hourAgo}`;
    if (Number(used[0]?.n ?? 0) >= TRIES_PER_EMAIL_PER_HOUR) {
      throw new RateLimited(secondsUntil(now, new Date((used[0].first ?? now).getTime() + HOUR_MS)), "Too many tries for this email. Try again later.");
    }

    const took = await tx.$queryRaw<{ id: string; codeHash: string; attempts: number }[]>`
      UPDATE auth_code SET attempts = attempts + 1,
        "triedFrom" = CASE WHEN ${p.address}::text IS NULL THEN "triedFrom" ELSE array_append("triedFrom", ${p.address}::text) END
      WHERE id = (
        SELECT id FROM auth_code
        WHERE destination = ${p.destination} AND purpose = ${purpose}::"AuthCodePurpose" AND "consumedAt" IS NULL AND "expiresAt" > ${now}
        ORDER BY "createdAt" DESC, id DESC LIMIT 1)
      AND attempts < ${TRIES_PER_CODE} AND "consumedAt" IS NULL AND "expiresAt" > ${now}
      RETURNING id::text AS id, "codeHash", attempts`;
    const row = took[0];
    if (!row) return { kind: "dead" };
    if (!/^\d{6}$/.test(p.code) || !this.matches(row.codeHash, p.purpose, p.destination, p.code)) {
      return { kind: "wrong", left: TRIES_PER_CODE - row.attempts };
    }
    const done = await tx.authCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
    return done.count === 1 ? { kind: "ok", id: row.id } : { kind: "dead" };
  }

  private async within(tx: Prisma.TransactionClient, where: Prisma.AuthCodeWhereInput, w: Window, now: Date): Promise<void> {
    const since = new Date(now.getTime() - w.seconds * 1000);
    const rows = await tx.authCode.findMany({ where: { ...where, createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    if (rows.length >= w.count) {
      throw new RateLimited(secondsUntil(now, new Date(rows[rows.length - w.count].createdAt.getTime() + w.seconds * 1000)));
    }
  }

  private hash(purpose: CodePurpose, destination: string, code: string): string {
    return createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(`${purpose}:${destination}:${code}`).digest("hex");
  }

  private matches(stored: string, purpose: CodePurpose, destination: string, code: string): boolean {
    const a = Buffer.from(stored);
    const b = Buffer.from(this.hash(purpose, destination, code));
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
