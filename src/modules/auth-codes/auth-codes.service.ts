import { HttpStatus, Injectable } from "@nestjs/common";
import type { SignInCode } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { SignInCodes } from "../../common/auth/sign-in-codes";
import { EmailPort } from "../../common/ports/email.port";
import { normaliseEmail } from "../../common/normalise/email";
import { AccountsService } from "../accounts/accounts.service";
import { ClientMeta, SessionsService, StartedSession } from "../sessions/sessions.service";
import { RESEND_AFTER_SECONDS, USER_CODE_LIMITS } from "./limits";

/** What asking for a code answers. The same whether or not the email has an account. */
export type CodeSent = SignInCode & { sent: true; resendAfter: number; destination: string };

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

const expired = () => new AppError(HttpStatus.BAD_REQUEST, "code_expired", "That code no longer works. Ask for a new one.");

@Injectable()
export class AuthCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: SignInCodes,
    private readonly email: EmailPort,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * E-19. One code to the email, stored only as a peppered hash; a new code ends the email's earlier ones. Limits (resend wait,
   * per canonical email per hour, per IP per hour) are database counts under a lock (U2, V5). If the email cannot be sent
   * nothing is stored or counted.
   */
  async request(destination: string, mode: "up" | "in" | undefined, ip: string | null): Promise<CodeSent> {
    await this.prisma.$transaction(async (tx) => {
      const { id, code } = await this.codes.issue(tx, { destination, purpose: "sign_in", address: ip, mode: mode ?? null, limits: USER_CODE_LIMITS });
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
   * E-20. Checks a code through the shared helper (U1: a try is counted atomically before the code is compared; U2: wrong
   * tries capped per email per hour; V9: checks capped per address). The right code signs in once, making the account on the
   * first sign-in.
   */
  async verify(contact: string, code: string, meta: ClientMeta): Promise<{ started: StartedSession; email: string; isNew: boolean }> {
    const destination = normaliseEmail(contact);
    const fields: Record<string, string> = {};
    if (!destination) fields.contact = "Must be an email address.";
    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) fields.code = "Must be the 6 digits from the email.";
    if (!destination || Object.keys(fields).length) throw AppError.validation(fields);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const checked = await this.codes.check(tx, { destination, purpose: "sign_in", code: clean, address: meta.ip ?? null });
      if (checked.kind !== "ok") return checked;
      const { account, isNew } = await this.accounts.findOrCreateByEmail(tx, destination);
      if (account.erasedAt) return { kind: "dead" as const };
      const started = await this.sessions.start(tx, account.id, meta);
      return { kind: "signed" as const, started, isNew };
    });

    if (outcome.kind === "wrong") {
      if (outcome.left <= 0) throw expired();
      throw new AppError(HttpStatus.BAD_REQUEST, "code_wrong", `That code is not right. ${outcome.left} ${outcome.left === 1 ? "try" : "tries"} left.`);
    }
    if (outcome.kind !== "signed") throw expired();
    return { started: outcome.started, email: destination, isNew: outcome.isNew };
  }
}
