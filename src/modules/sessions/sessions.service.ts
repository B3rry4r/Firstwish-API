import { Inject, Injectable } from "@nestjs/common";
import { Prisma, Session as SessionRow } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Session } from "../../contracts";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { AppError } from "../../common/errors/app-error";
import { toWireInstant } from "../../common/time/time";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { AccessTokens } from "./access-tokens";

/** Refresh token life: 30 days, counted again from each rotation (conventions.md, Signing in). */
export const REFRESH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the API says about a session. The refresh token's hash never leaves the server. */
export type SessionView = Pick<Session, "id" | "familyId" | "createdAt" | "expiresAt" | "rotatedAt" | "revokedAt" | "ip" | "userAgent"> & {
  accountId: string | null;
  current?: boolean;
};

/** The answer to a sign-in or a refresh: the session, and the access token the web app keeps in memory only (R10). */
export type SignedIn = SessionView &
  Pick<Session, "contact"> & {
    accessToken: string;
    accessExpiresAt: string;
    /** true when this sign-in made the account (the web app shows Welcome). */
    isNew: boolean;
    returnTo?: string;
  };

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** A started session: the row, the cookie value to set and the access token. */
export interface StartedSession {
  row: SessionRow;
  cookie: string;
  access: { token: string; expiresAt: Date };
}

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly tokens: AccessTokens,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Opens a new session family for an account (a sign-in). Runs in the caller's transaction when given one. */
  async start(db: Db, accountId: string, meta: ClientMeta): Promise<StartedSession> {
    return this.open(db, accountId, this.ids.id(), meta);
  }

  /** The body every sign-in route answers with. */
  signedIn(s: StartedSession, contact: string, isNew: boolean, returnTo?: string): SignedIn {
    return {
      ...this.view(s.row),
      contact,
      accessToken: s.access.token,
      accessExpiresAt: toWireInstant(s.access.expiresAt),
      isNew,
      ...(returnTo !== undefined ? { returnTo } : {}),
    };
  }

  /**
   * Rotates a refresh token. The old token is dead once used; a dead (rotated) token used again means it was copied,
   * so its whole session family ends.
   */
  async refresh(cookie: string | null, meta: ClientMeta): Promise<{ started: StartedSession; contact: string }> {
    const parsed = this.parseCookie(cookie);
    if (!parsed) throw AppError.unauthorized("Your session has ended. Sign in again.");
    const now = this.clock.now();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SessionRow[]>`
        SELECT id, "accountId", "staffId", "familyId", "refreshTokenHash", "rotatedAt", "revokedAt", "revokeReason",
               "userAgent", ip, "expiresAt", "createdAt"
        FROM session WHERE id = ${parsed.id}::uuid FOR UPDATE`;
      const row = rows[0];
      if (!row || !row.accountId || !this.sameHash(row.refreshTokenHash, parsed.token)) return { kind: "bad" as const };
      if (row.rotatedAt) {
        await tx.session.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: now, revokeReason: "reused" },
        });
        return { kind: "reused" as const };
      }
      if (row.revokedAt || row.expiresAt.getTime() <= now.getTime()) return { kind: "bad" as const };
      await tx.session.update({ where: { id: row.id }, data: { rotatedAt: now, revokedAt: now, revokeReason: "rotated" } });
      const account = await tx.account.findUnique({ where: { id: row.accountId }, select: { contact: true, erasedAt: true } });
      if (!account || account.erasedAt) return { kind: "bad" as const };
      const started = await this.open(tx, row.accountId, row.familyId, meta);
      return { kind: "ok" as const, started, contact: account.contact ?? "" };
    });
    if (outcome.kind !== "ok") throw AppError.unauthorized("Your session has ended. Sign in again.");
    return { started: outcome.started, contact: outcome.contact };
  }

  /** Ends the session family of this access token (this device). */
  async signOut(accountId: string, sessionId: string): Promise<void> {
    const row = await this.prisma.session.findFirst({ where: { id: sessionId, accountId }, select: { familyId: true } });
    if (!row) return;
    await this.prisma.session.updateMany({
      where: { familyId: row.familyId, accountId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokeReason: "signed-out" },
    });
  }

  /** Ends every session of the account. */
  async signOutEverywhere(accountId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokeReason: "signed-out-everywhere" },
    });
  }

  /** The account's live sessions, newest first. */
  async list(accountId: string, currentId: string | null, cursor: string | undefined, limit = DEFAULT_LIMIT): Promise<Page<SessionView>> {
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
    return { items: page.items.map((r) => ({ ...this.view(r), current: r.id === currentId })), nextCursor: page.nextCursor };
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

  private async open(db: Db, accountId: string, familyId: string, meta: ClientMeta): Promise<StartedSession> {
    const now = this.clock.now();
    const token = this.codes.token(32);
    const row = await db.session.create({
      data: {
        id: this.ids.id(),
        accountId,
        familyId,
        refreshTokenHash: this.hash(token),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
        expiresAt: new Date(now.getTime() + REFRESH_DAYS * DAY_MS),
        createdAt: now,
      },
    });
    return { row, cookie: `${row.id}.${token}`, access: this.tokens.issue("user", accountId, row.id) };
  }

  private parseCookie(cookie: string | null): { id: string; token: string } | null {
    if (!cookie) return null;
    const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{16,200})$/.exec(cookie);
    return m ? { id: m[1], token: m[2] } : null;
  }

  private hash(token: string): string {
    return createHmac("sha256", this.env.REFRESH_TOKEN_PEPPER).update(token).digest("hex");
  }

  private sameHash(stored: string, token: string): boolean {
    const a = Buffer.from(stored);
    const b = Buffer.from(this.hash(token));
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
