import { Injectable, Logger } from "@nestjs/common";
import type { StaffAccount as StaffRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { RateLimited } from "../../common/errors/rate-limited";
import { SessionFamilies, StartedSession } from "../../common/auth/session-families";
import { AskLimits, SignInCodes } from "../../common/auth/sign-in-codes";
import type { StaffPrincipal } from "../../common/auth/principal";
import { Clock } from "../../common/ports/clock.port";
import type { StaffAuthResult } from "../../contracts";
import { AuditService } from "../audit/audit.service";
import { networkOf } from "../audit/ip-network";
import { NoticesService } from "../notices/notices.service";
import { staffToWire } from "./staff-view";
import { STAFF_SESSION } from "./staff-session";

/** Staff codes: at most 5 per email in 10 minutes (B03), and 20 per address network in an hour (DEC-28's figure; U2). */
export const STAFF_CODE_LIMITS: AskLimits = {
  resendAfterSeconds: 0,
  perEmail: { count: 5, seconds: 10 * 60 },
  perAddress: { count: 20, seconds: 60 * 60 },
};
/** An invite's code: the inviting owner's address is not counted. */
const INVITE_LIMITS: AskLimits = { ...STAFF_CODE_LIMITS, perAddress: { count: Number.MAX_SAFE_INTEGER, seconds: 1 } };

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

const BAD_CODE = () => AppError.validation({ code: "That code is not right, or it has ended. Ask for a new one." });
const ENDED = () => AppError.unauthorized("Your session has ended. Sign in again.");
const canSignIn = (s: Pick<StaffRow, "status" | "roles"> | null) => !!s && (s.status === "active" || s.status === "invited") && s.roles.length > 0;

@Injectable()
export class StaffAuthService {
  private readonly log = new Logger("StaffAuth");
  /** Emails sent after the answer (U4); tests wait on settle(). */
  private readonly sending = new Set<Promise<void>>();

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly families: SessionFamilies,
    private readonly codes: SignInCodes,
    private readonly notices: NoticesService,
    private readonly clock: Clock,
  ) {}

  /**
   * E-174 (S6). The same 204 whoever asks, and the same work (U4): a code is made and hashed for every email, team or not,
   * under the database limits (U2); only a member who may sign in (active, or invited) is emailed, and the email is sent after
   * the answer. Past a limit the answer is still 204 and nothing is sent.
   */
  async requestCode(email: string, req: RequestInfo): Promise<void> {
    let code: { id: string; code: string };
    try {
      code = await this.db.$transaction(async (tx) => {
        const issued = await this.codes.issue(tx, { destination: email, purpose: "staff_sign_in", address: networkOf(req.ip), limits: STAFF_CODE_LIMITS });
        return issued;
      });
    } catch (e) {
      if (e instanceof RateLimited) return;
      throw e;
    }
    const staff = await this.db.staffAccount.findUnique({ where: { email }, select: { status: true, roles: true } });
    if (canSignIn(staff)) this.queue(email, code);
  }

  /** Makes a fresh code for a newly invited member and emails it (after the answer). */
  async inviteCode(staff: Pick<StaffRow, "email">): Promise<void> {
    try {
      const code = await this.db.$transaction(async (tx) => {
        return this.codes.issue(tx, { destination: staff.email, purpose: "staff_sign_in", address: null, limits: INVITE_LIMITS });
      });
      this.queue(staff.email, code);
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      this.log.warn("invite code not made: too many codes for this email; the member can ask for one at sign-in");
    }
  }

  /** E-176. A good code (U1, U2, V9 by the shared helper) opens a staff session family: 12 h from sign-in, cookie and token. */
  async verify(email: string, code: string, req: RequestInfo): Promise<{ result: StaffAuthResult; started: StartedSession }> {
    const outcome = await this.db.$transaction(async (tx) => {
      const checked = await this.codes.check(tx, { destination: email, purpose: "staff_sign_in", code, address: networkOf(req.ip) });
      if (checked.kind !== "ok") return null;
      const found = await tx.staffAccount.findUnique({ where: { email } });
      if (!found || !canSignIn(found)) return null;
      const now = this.clock.now();
      const updated = await tx.staffAccount.update({ where: { id: found.id }, data: { status: "active", lastSignInAt: now } });
      const started = await this.families.start(tx, { kind: "staff", staffId: found.id }, { ip: networkOf(req.ip), userAgent: req.userAgent }, STAFF_SESSION);
      await this.audit.write(tx, {
        actor: { type: "staff", id: found.id, ip: req.ip, requestId: req.requestId },
        section: "/admin",
        action: "staff.sign-in",
        target: { type: "StaffAccount", id: found.id },
        reason: null,
        changedFields: found.status === "invited" ? ["status", "lastSignInAt"] : ["lastSignInAt"],
      });
      return { updated, started };
    });
    if (!outcome) throw BAD_CODE();
    return { result: this.result(outcome.updated, outcome.started), started: outcome.started };
  }

  /** E-234 (S5). Rotates the staff cookie (10-second grace, V2); a member who may no longer sign in ends the family. */
  async refresh(cookie: string | null, req: RequestInfo): Promise<{ result: StaffAuthResult; started: StartedSession }> {
    const started = await this.families.rotate(cookie, "staff", { ip: networkOf(req.ip), userAgent: req.userAgent }, STAFF_SESSION);
    const staff = await this.db.staffAccount.findUnique({ where: { id: started.row.staffId ?? "" } });
    if (!staff || staff.status !== "active" || staff.roles.length === 0) {
      await this.families.endFamily(this.db, started.row.familyId, "not-staff");
      throw ENDED();
    }
    return { result: this.result(staff, started), started };
  }

  /** E-175. Ends this session family at once; one audit row. */
  async signOut(p: StaffPrincipal, req: RequestInfo): Promise<void> {
    const familyId = p.familyId;
    if (!familyId) throw ENDED();
    await this.db.$transaction(async (tx) => {
      const ended = await this.families.endFamily(tx, familyId, "sign-out");
      if (ended === 0) return;
      await this.audit.write(tx, {
        actor: { type: "staff", id: p.staffId, ip: req.ip, requestId: req.requestId },
        section: "/admin",
        action: "staff.sign-out",
        target: { type: "Session", id: p.sessionId ?? familyId },
        reason: null,
        changedFields: ["revokedAt"],
      });
    });
  }

  /** Waits for every queued email (tests). */
  async settle(): Promise<void> {
    while (this.sending.size) await Promise.all([...this.sending]);
  }

  private result(staff: StaffRow, s: StartedSession): StaffAuthResult {
    return { staff: staffToWire(staff), accessToken: s.access.token, accessTokenExpiresAt: s.access.expiresAt.toISOString() };
  }

  /**
   * Sends after the answer has gone (U4), through the one path for every email (II6: notices.send, then deliverNow). A failed
   * send is logged, never shown: the answer is the same for every email, and the code stays.
   */
  private queue(to: string, issued: { id: string; code: string }): void {
    const job: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        const sent = await this.notices.send(undefined, { template: "code", toEmail: to, data: { code: issued.code }, key: `staff-code:${issued.id}` });
        await this.notices.deliverNow(sent.deliveryId);
      })
      .then(
        () => undefined,
        (e: unknown) => this.log.warn(`staff code email not sent: ${(e as Error).message}`),
      )
      .finally(() => this.sending.delete(job));
    this.sending.add(job);
  }
}
