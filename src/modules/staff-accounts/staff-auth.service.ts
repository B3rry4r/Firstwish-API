import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma, StaffAccount as StaffRow } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { EmailPort } from "../../common/ports/email.port";
import { RedisService } from "../../common/queue/redis.service";
import type { StaffAccount } from "../../contracts";
import { AuditActor, AuditService } from "../audit/audit.service";
import { networkOf } from "../audit/ip-network";
import { staffToWire } from "./staff-view";
import { STAFF_REFRESH_SECONDS, StaffSessionPrincipal, StaffTokens } from "./staff-tokens";

/** Codes: 6 digits, 10 minutes, 5 tries (conventions); at most 5 codes per address in 10 minutes. */
const CODE_DIGITS = 6;
const CODE_SECONDS = 10 * 60;
const CODE_TRIES = 5;
const CODES_PER_WINDOW = 5;
const PURPOSE = "staff_sign_in" as const;

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface StaffSignIn {
  staff: StaffAccount;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

const BAD_CODE = () => AppError.validation({ code: "That code is not right, or it has ended. Ask for a new one." });

@Injectable()
export class StaffAuthService {
  private readonly log = new Logger("StaffAuth");

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: StaffTokens,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly email: EmailPort,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * E-174. A code goes only to an email that is already on the team (active, or invited and not yet signed in). Every other
   * email gets the same 204 and no email (A8, C-64: nothing tells whether an email is staff). No self sign-up.
   */
  async requestCode(email: string, req: RequestInfo): Promise<void> {
    if (!(await this.withinRate(email))) return;
    const staff = await this.db.staffAccount.findUnique({ where: { email } });
    if (!staff || (staff.status !== "active" && staff.status !== "invited")) return;
    await this.sendCode(staff, req.ip, "sign-in");
  }

  /** Makes a fresh code for a team member (older open codes end) and emails it. Used by sign-in and by invite. */
  async sendCode(staff: Pick<StaffRow, "email">, ip: string | null, why: "sign-in" | "invite"): Promise<void> {
    const code = this.codes.digits(CODE_DIGITS);
    const now = this.clock.now();
    await this.db.$transaction([
      this.db.authCode.updateMany({
        where: { destination: staff.email, purpose: PURPOSE, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.db.authCode.create({
        data: {
          id: this.ids.id(),
          channel: "email",
          via: "email",
          destination: staff.email,
          codeHash: this.hashCode(staff.email, code),
          purpose: PURPOSE,
          attempts: 0,
          expiresAt: new Date(now.getTime() + CODE_SECONDS * 1000),
          ip: networkOf(ip),
        },
      }),
    ]);
    const subject = why === "invite" ? "You are invited to the Firstwish team" : "Your Firstwish staff sign-in code";
    const lead = why === "invite" ? "You have been added to the Firstwish team. " : "";
    try {
      await this.email.send({
        to: staff.email,
        subject,
        text: `${lead}Your sign-in code is ${code}. It works for 10 minutes. If you did not ask for it, you can ignore this email.`,
      });
    } catch (e) {
      // The answer stays the same for every email, so a failed send is logged, not shown.
      this.log.warn(`staff code email not sent: ${(e as Error).message}`);
    }
  }

  /** E-176. A good code opens a staff session: its own row and cookie, 12 h refresh, and a 15-minute staff access token. */
  async verify(email: string, code: string, req: RequestInfo): Promise<StaffSignIn> {
    const now = this.clock.now();
    const row = await this.db.authCode.findFirst({
      where: { destination: email, purpose: PURPOSE, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!row || row.attempts >= CODE_TRIES) throw BAD_CODE();
    if (!/^\d{6}$/.test(code) || !this.sameHash(row.codeHash, this.hashCode(email, code))) {
      await this.db.authCode.updateMany({ where: { id: row.id, attempts: { lt: CODE_TRIES } }, data: { attempts: { increment: 1 } } });
      throw BAD_CODE();
    }
    const refreshToken = this.codes.token(32);
    const sessionId = this.ids.id();
    const staff = await this.db.$transaction(async (tx) => {
      const used = await tx.authCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
      if (used.count !== 1) throw BAD_CODE();
      const found = await tx.staffAccount.findUnique({ where: { email } });
      if (!found || (found.status !== "active" && found.status !== "invited") || found.roles.length === 0) throw BAD_CODE();
      const updated = await tx.staffAccount.update({ where: { id: found.id }, data: { status: "active", lastSignInAt: now } });
      await tx.session.create({
        data: {
          id: sessionId,
          staffId: found.id,
          familyId: this.ids.id(),
          refreshTokenHash: this.hashRefresh(refreshToken),
          userAgent: req.userAgent?.slice(0, 256) ?? null,
          ip: networkOf(req.ip),
          expiresAt: new Date(now.getTime() + STAFF_REFRESH_SECONDS * 1000),
        },
      });
      const actor: AuditActor = { type: "staff", id: found.id, ip: req.ip, requestId: req.requestId };
      const changed = found.status === "invited" ? ["status", "lastSignInAt"] : ["lastSignInAt"];
      await this.audit.write(tx, {
        actor,
        section: "/admin",
        action: "staff.sign-in",
        target: { type: "StaffAccount", id: found.id },
        reason: null,
        changedFields: changed,
      });
      return updated;
    });
    const access = this.tokens.issue(staff.id, sessionId);
    return { staff: staffToWire(staff), accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken };
  }

  /** E-175. Ends this session at once. */
  async signOut(p: StaffSessionPrincipal, req: RequestInfo): Promise<void> {
    await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const ended = await tx.session.updateMany({
        where: { id: p.sessionId, staffId: p.staffId, revokedAt: null },
        data: { revokedAt: this.clock.now(), revokeReason: "sign-out" },
      });
      if (ended.count === 0) return;
      await this.audit.write(tx, {
        actor: { type: "staff", id: p.staffId, ip: req.ip, requestId: req.requestId },
        section: "/admin",
        action: "staff.sign-out",
        target: { type: "Session", id: p.sessionId },
        reason: null,
        changedFields: ["revokedAt"],
      });
    });
  }

  private async withinRate(email: string): Promise<boolean> {
    const key = `${this.redis.prefix}:staff-code:${createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(email).digest("hex").slice(0, 32)}`;
    try {
      const n = await this.redis.client.incr(key);
      if (n === 1) await this.redis.client.expire(key, CODE_SECONDS);
      return n <= CODES_PER_WINDOW;
    } catch (e) {
      // Redis down: codes still end after 10 minutes and 5 tries, so the request goes on.
      this.log.warn(`staff code rate check skipped: ${(e as Error).message}`);
      return true;
    }
  }

  private hashCode(email: string, code: string): string {
    return createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(`staff-sign-in:${email}:${code}`).digest("hex");
  }

  private hashRefresh(token: string): string {
    return createHmac("sha256", this.env.REFRESH_TOKEN_PEPPER).update(`staff:${token}`).digest("hex");
  }

  private sameHash(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
}
