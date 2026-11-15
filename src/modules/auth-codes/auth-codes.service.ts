import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AuthCode as AuthCodeRow } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignInCode } from "../../contracts";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { EmailPort } from "../../common/ports/email.port";
import { normaliseEmail } from "../../common/normalise/email";
import { AccountsService } from "../accounts/accounts.service";
import { ClientMeta, SessionsService, StartedSession } from "../sessions/sessions.service";
import {
  CODE_DIGITS,
  CODE_LIFE_SECONDS,
  CODE_TRIES,
  CODES_PER_EMAIL_PER_HOUR,
  CODES_PER_IP_PER_HOUR,
  HOUR_MS,
  RESEND_AFTER_SECONDS,
} from "./limits";
import { RateLimited } from "./rate-limited";

/** What asking for a code answers. The same whether or not the email has an account. */
export type CodeSent = SignInCode & { sent: true; resendAfter: number; destination: string };

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

const secondsUntil = (from: Date, to: Date): number => Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));

@Injectable()
export class AuthCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly email: EmailPort,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * E-19. One code to the email, stored only as a peppered hash. A new code ends the email's earlier unused codes.
   * Limits (resend wait, per email per hour, per IP per hour) are checked under a lock per email and per IP, so two
   * requests at once cannot both slip past a limit. If the email cannot be sent nothing is stored or counted.
   */
  async request(destination: string, mode: "up" | "in" | undefined, ip: string | null): Promise<CodeSent> {
    await this.prisma.$transaction(async (tx) => {
      const lockKeys = [`auth-code:email:${destination}`, ...(ip ? [`auth-code:ip:${ip}`] : [])].sort();
      for (const k of lockKeys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${k}))`;
      const now = this.clock.now();
      const hourAgo = new Date(now.getTime() - HOUR_MS);

      const last = await tx.authCode.findFirst({ where: { destination, purpose: "sign_in" }, orderBy: { createdAt: "desc" } });
      if (last && now.getTime() - last.createdAt.getTime() < RESEND_AFTER_SECONDS * 1000) {
        throw new RateLimited(secondsUntil(now, new Date(last.createdAt.getTime() + RESEND_AFTER_SECONDS * 1000)));
      }
      const byEmail = await tx.authCode.findMany({
        where: { destination, purpose: "sign_in", createdAt: { gt: hourAgo } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      if (byEmail.length >= CODES_PER_EMAIL_PER_HOUR) {
        throw new RateLimited(secondsUntil(now, new Date(byEmail[byEmail.length - CODES_PER_EMAIL_PER_HOUR].createdAt.getTime() + HOUR_MS)));
      }
      if (ip) {
        const byIp = await tx.authCode.findMany({
          where: { ip, purpose: "sign_in", createdAt: { gt: hourAgo } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        if (byIp.length >= CODES_PER_IP_PER_HOUR) {
          throw new RateLimited(secondsUntil(now, new Date(byIp[byIp.length - CODES_PER_IP_PER_HOUR].createdAt.getTime() + HOUR_MS)));
        }
      }

      await tx.authCode.updateMany({
        where: { destination, purpose: "sign_in", consumedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      const code = this.codes.digits(CODE_DIGITS);
      const id = this.ids.id();
      await tx.authCode.create({
        data: {
          id,
          channel: "email",
          via: "email",
          purpose: "sign_in",
          mode: mode ?? null,
          destination,
          codeHash: this.hash(destination, code),
          attempts: 0,
          expiresAt: new Date(now.getTime() + CODE_LIFE_SECONDS * 1000),
          ip,
          createdAt: now,
        },
      });
      await this.email.send({
        to: destination,
        subject: "Your Firstwish code",
        text: `Your Firstwish code is ${code}. It works for 10 minutes. If you did not ask for it, you can ignore this email.`,
        idempotencyKey: `auth-code:${id}`,
      });
    });
    return { sent: true, resendAfter: RESEND_AFTER_SECONDS, destination: maskEmail(destination) };
  }

  /**
   * E-20. Checks a code. The code row is locked, so the same code sent twice at once signs in once. A wrong code counts a
   * try (kept even though the request fails); after the last try, or once expired or used, the code never works.
   */
  async verify(contact: string, code: string, meta: ClientMeta): Promise<{ started: StartedSession; email: string; isNew: boolean }> {
    const destination = normaliseEmail(contact);
    const fields: Record<string, string> = {};
    if (!destination) fields.contact = "Must be an email address.";
    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) fields.code = "Must be the 6 digits from the email.";
    if (!destination || Object.keys(fields).length) throw AppError.validation(fields);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const now = this.clock.now();
      const rows = await tx.$queryRaw<AuthCodeRow[]>`
        SELECT id, "codeHash", attempts, "expiresAt", "consumedAt"
        FROM auth_code
        WHERE destination = ${destination} AND purpose = 'sign-in' AND "consumedAt" IS NULL
        ORDER BY "createdAt" DESC, id DESC
        LIMIT 1
        FOR UPDATE`;
      const row = rows[0];
      if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime() || row.attempts >= CODE_TRIES) {
        return { kind: "dead" as const };
      }
      if (!this.matches(row.codeHash, destination, clean)) {
        const attempts = row.attempts + 1;
        await tx.authCode.update({ where: { id: row.id }, data: { attempts } });
        return { kind: "wrong" as const, left: CODE_TRIES - attempts };
      }
      await tx.authCode.update({ where: { id: row.id }, data: { consumedAt: now } });
      const { account, isNew } = await this.accounts.findOrCreateByEmail(tx, destination);
      if (account.erasedAt) return { kind: "dead" as const };
      const started = await this.sessions.start(tx, account.id, meta);
      return { kind: "ok" as const, started, isNew };
    });

    if (outcome.kind === "wrong") {
      if (outcome.left <= 0) throw new AppError(HttpStatus.BAD_REQUEST, "code_expired", "That code no longer works. Ask for a new one.");
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "code_wrong",
        `That code is not right. ${outcome.left} ${outcome.left === 1 ? "try" : "tries"} left.`,
      );
    }
    if (outcome.kind === "dead") throw new AppError(HttpStatus.BAD_REQUEST, "code_expired", "That code no longer works. Ask for a new one.");
    return { started: outcome.started, email: destination, isNew: outcome.isNew };
  }

  private hash(destination: string, code: string): string {
    return createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(`${destination}:${code}`).digest("hex");
  }

  private matches(stored: string, destination: string, code: string): boolean {
    const a = Buffer.from(stored);
    const b = Buffer.from(this.hash(destination, code));
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
