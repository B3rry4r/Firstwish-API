import { Inject, Injectable } from "@nestjs/common";
import { Prisma, Session as SessionRow } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../db/prisma.service";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";
import { AppError } from "../errors/app-error";
import { Clock } from "../ports/clock.port";
import { CodeGenerator, IdGenerator } from "../ports/ids.port";
import { AccessTokens, Audience } from "./access-tokens";

/** V2: the same rotated refresh token sent again within this many seconds gets the same new child. */
export const REFRESH_GRACE_SECONDS = 10;

/** Whose session: an account (user sign-in) or a staff member (staff sign-in). */
export type Holder = { kind: "user"; accountId: string } | { kind: "staff"; staffId: string };

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** A started (or rotated) session: the row, the cookie value to set and the access token. */
export interface StartedSession {
  row: SessionRow;
  cookie: string;
  access: { token: string; expiresAt: Date };
}

/** How long a session lives. `fromSignIn`: a rotation keeps the family's first end (staff, 12 h); otherwise it starts again. */
export interface SessionLife {
  seconds: number;
  fromSignIn: boolean;
}

type Db = Prisma.TransactionClient | PrismaService;

const COOKIE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{16,200})$/;
const ENDED = () => AppError.unauthorized("Your session has ended. Sign in again.");
/** HM6: a refresh with no cookie, or one that is not a refresh cookie at all, is a visitor with no session: its own code, so the web shows nothing. */
const NO_SESSION = () => new AppError(401, "no_session", "There is no session. Sign in to continue.");

/**
 * Session families, shared by the user and the staff sign-in (T4, V1, V2). A sign-in starts a family; each refresh rotates the
 * family's live row into a child. The child's token is worked out from the parent's token with the pepper, so the same old
 * token sent again inside the grace gets the SAME child (one rotation, many identical answers) without storing any token.
 * After the grace a reused old token is theft: that family ends, and only that family.
 */
@Injectable()
export class SessionFamilies {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly tokens: AccessTokens,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Opens a new family (a sign-in), in the caller's transaction when given one. */
  async start(db: Db, holder: Holder, meta: ClientMeta, life: SessionLife): Promise<StartedSession> {
    const now = this.clock.now();
    const token = this.codes.token(32);
    const expiresAt = new Date(now.getTime() + life.seconds * 1000);
    return this.open(db, holder, this.ids.id(), token, expiresAt, meta);
  }

  /**
   * Rotates a refresh cookie of this holder kind. Refused (401) when the cookie is not a live one of this kind. The rotated row
   * is locked, so parallel refreshes with one cookie give one child and the same answer each time.
   */
  async rotate(cookie: string | null, kind: Holder["kind"], meta: ClientMeta, life: SessionLife): Promise<StartedSession> {
    const parsed = cookie ? COOKIE.exec(cookie) : null;
    if (!parsed) throw NO_SESSION();
    const [, id, token] = parsed;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const now = this.clock.now();
      const rows = await tx.$queryRaw<SessionRow[]>`SELECT * FROM session WHERE id = ${id}::uuid FOR UPDATE`;
      const row = rows[0];
      if (!row || !this.sameHash(row.refreshTokenHash, kind, token)) return null;
      const holder = this.holderOf(row);
      if (!holder || holder.kind !== kind) return null;
      const childToken = this.childToken(kind, token);
      if (row.rotatedAt) {
        const inGrace = now.getTime() - row.rotatedAt.getTime() <= REFRESH_GRACE_SECONDS * 1000;
        if (inGrace && row.replacedById) {
          // V2: follow replacedById to the family's live head (the token of each hop is worked out from the one before).
          let head: SessionRow | null = row;
          let headToken = token;
          for (let hops = 0; head?.replacedById && hops < 50; hops++) {
            head = await tx.session.findUnique({ where: { id: head.replacedById } });
            headToken = this.childToken(kind, headToken);
          }
          if (head && head.id !== row.id && !head.revokedAt && head.expiresAt.getTime() > now.getTime()) {
            return { row: head, cookie: `${head.id}.${headToken}`, access: this.access(holder, head) };
          }
        }
        if (!inGrace) await this.endFamily(tx, row.familyId, "reused");
        return null;
      }
      if (row.revokedAt || row.expiresAt.getTime() <= now.getTime()) return null;
      const expiresAt = life.fromSignIn ? row.expiresAt : new Date(now.getTime() + life.seconds * 1000);
      const child = await this.open(tx, holder, row.familyId, childToken, expiresAt, meta);
      await tx.session.update({
        where: { id: row.id },
        data: { rotatedAt: now, revokedAt: now, revokeReason: "rotated", replacedById: child.row.id },
      });
      return child;
    });
    if (!outcome) throw ENDED();
    return outcome;
  }

  /** Ends one family at once (sign-out on this device, or theft). */
  async endFamily(db: Db, familyId: string, reason: string): Promise<number> {
    const r = await db.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: this.clock.now(), revokeReason: reason } });
    return r.count;
  }

  /** Whose session a row is (an account or a staff member). */
  holderOf(row: Pick<SessionRow, "accountId" | "staffId">): Holder | null {
    if (row.accountId && !row.staffId) return { kind: "user", accountId: row.accountId };
    if (row.staffId && !row.accountId) return { kind: "staff", staffId: row.staffId };
    return null;
  }

  private access(holder: Holder, row: SessionRow): { token: string; expiresAt: Date } {
    const aud: Audience = holder.kind;
    return this.tokens.issue(aud, holder.kind === "user" ? holder.accountId : holder.staffId, row.id, row.familyId);
  }

  private async open(db: Db, holder: Holder, familyId: string, token: string, expiresAt: Date, meta: ClientMeta): Promise<StartedSession> {
    const row = await db.session.create({
      data: {
        id: this.ids.id(),
        accountId: holder.kind === "user" ? holder.accountId : null,
        staffId: holder.kind === "staff" ? holder.staffId : null,
        familyId,
        refreshTokenHash: this.hash(holder.kind, token),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
        expiresAt,
        createdAt: this.clock.now(),
      },
    });
    return { row, cookie: `${row.id}.${token}`, access: this.access(holder, row) };
  }

  /** The child's token: worked out from the parent's token, so a repeat inside the grace gives the same cookie. */
  private childToken(kind: Holder["kind"], parent: string): string {
    return createHmac("sha256", this.env.REFRESH_TOKEN_PEPPER).update(`child:${kind}:${parent}`).digest("base64url");
  }

  private hash(kind: Holder["kind"], token: string): string {
    return createHmac("sha256", this.env.REFRESH_TOKEN_PEPPER).update(`${kind}:${token}`).digest("hex");
  }

  private sameHash(stored: string, kind: Holder["kind"], token: string): boolean {
    const a = Buffer.from(stored);
    const b = Buffer.from(this.hash(kind, token));
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
