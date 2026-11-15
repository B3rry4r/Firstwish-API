import { Injectable } from "@nestjs/common";
import { Prisma, Session as SessionRow } from "@prisma/client";
import type { AuthResult, Session } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { ClientMeta, SessionFamilies, SessionLife, StartedSession } from "../../common/auth/session-families";
import { Clock } from "../../common/ports/clock.port";
import { AppError } from "../../common/errors/app-error";
import { toWireInstant } from "../../common/time/time";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";

export type { ClientMeta, StartedSession } from "../../common/auth/session-families";

/** Refresh token life: 30 days, counted again from each rotation (conventions.md, Signing in). */
export const REFRESH_DAYS = 30;
export const USER_SESSION: SessionLife = { seconds: REFRESH_DAYS * 24 * 60 * 60, fromSignIn: false };

/** What the API says about a session. The refresh token's hash never leaves the server. */
export type SessionView = Pick<Session, "id" | "familyId" | "createdAt" | "expiresAt" | "rotatedAt" | "revokedAt" | "ip" | "userAgent"> & {
  accountId: string | null;
  current?: boolean;
};

type Db = Prisma.TransactionClient | PrismaService;

/** User sessions on top of the kernel's session families (T4, V1, V2). */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly families: SessionFamilies,
  ) {}

  /** Opens a new session family for an account (a sign-in). Runs in the caller's transaction when given one. */
  start(db: Db, accountId: string, meta: ClientMeta): Promise<StartedSession> {
    return this.families.start(db, { kind: "user", accountId }, meta, USER_SESSION);
  }

  /** T1: the body every user sign-in and refresh answers with. No token hash, no refresh token. */
  authResult(s: StartedSession, isNew: boolean, returnTo?: string): AuthResult {
    return {
      accessToken: s.access.token,
      accessExpiresAt: toWireInstant(s.access.expiresAt),
      isNew,
      session: { id: s.row.id, expiresAt: toWireInstant(s.row.expiresAt) },
      ...(returnTo !== undefined ? { returnTo } : {}),
    };
  }

  /** E-159: rotates the refresh cookie (10-second grace, V2); an erased account cannot refresh. */
  async refresh(cookie: string | null, meta: ClientMeta): Promise<StartedSession> {
    const started = await this.families.rotate(cookie, "user", meta, USER_SESSION);
    const account = await this.prisma.account.findUnique({ where: { id: started.row.accountId ?? "" }, select: { erasedAt: true } });
    if (!account || account.erasedAt) {
      await this.families.endFamily(this.prisma, started.row.familyId, "erased");
      throw AppError.unauthorized("Your session has ended. Sign in again.");
    }
    return started;
  }

  /** E-160: ends this device's session family. */
  async signOut(accountId: string, familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, accountId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokeReason: "signed-out" },
    });
  }

  /** E-161: ends every session of the account. */
  async signOutEverywhere(accountId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokeReason: "signed-out-everywhere" },
    });
  }

  /** E-162: the account's live sessions, newest first; `current` marks this device's family. */
  async list(accountId: string, currentFamily: string | null, cursor: string | undefined, limit = DEFAULT_LIMIT): Promise<Page<SessionView>> {
    const now = this.clock.now();
    const where: Prisma.SessionWhereInput = { accountId, revokedAt: null, expiresAt: { gt: now } };
    if (cursor) {
      const pos = decodeCursor(cursor);
      const at = typeof pos.key === "string" ? new Date(pos.key) : new Date(Number.NaN);
      if (Number.isNaN(at.getTime())) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: pos.id } }];
    }
    const rows = await this.prisma.session.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: toWireInstant(r.createdAt), id: r.id }));
    return { items: page.items.map((r) => ({ ...this.view(r), current: r.familyId === currentFamily })), nextCursor: page.nextCursor };
  }

  view(r: SessionRow): SessionView {
    return {
      id: r.id,
      familyId: r.familyId,
      accountId: r.accountId,
      createdAt: toWireInstant(r.createdAt),
      expiresAt: toWireInstant(r.expiresAt),
      rotatedAt: r.rotatedAt ? toWireInstant(r.rotatedAt) : null,
      revokedAt: r.revokedAt ? toWireInstant(r.revokedAt) : null,
      ip: r.ip,
      userAgent: r.userAgent,
    };
  }
}
