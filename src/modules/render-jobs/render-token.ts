import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";

/** The shape of a token: 32 random bytes as base64url. Anything else is looked up as a never-issued value (so a malformed one costs what a wrong one costs). */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** RENDER_TOKEN_TTL_SECONDS when the environment says nothing. */
export const RENDER_TOKEN_TTL_DEFAULT_SECONDS = 900;

export interface TokenJob {
  jobId: string;
  wishId: string;
  kind: "status-video" | "keepsake-export";
  width: number;
  height: number;
  seconds: number;
}

/**
 * R3 (IK6): the one-use token a render reads its wish with. Minted by the server when a render job's run starts (nothing else mints one: no
 * route does), bound to that job and its wish, 32 random bytes, kept only as an HMAC, good RENDER_TOKEN_TTL_SECONDS and for ONE read. A job that
 * ended (done, failed) or was taken over leaves no token alive. The token is never logged, audited, noticed or put in a job payload.
 */
@Injectable()
export class RenderTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  ttlSeconds(): number {
    return this.env.RENDER_TOKEN_TTL_SECONDS > 0 ? this.env.RENDER_TOKEN_TTL_SECONDS : RENDER_TOKEN_TTL_DEFAULT_SECONDS;
  }

  /** The HMAC a token is kept as (RENDER_TOKEN_SECRET, else the server's own secret): a copy of the table cannot be played back as a token. */
  hashOf(token: string): string {
    const secret = this.env.RENDER_TOKEN_SECRET || this.env.JWT_ACCESS_SECRET;
    const key = createHmac("sha256", secret).update("render-token").digest();
    return createHmac("sha256", key).update(token).digest("hex");
  }

  /** A fresh token and what is stored for it. The caller writes the hash and expiry on the job's row and hands the token to the renderer in memory only. */
  make(): { token: string; hash: string; expiresAt: Date } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashOf(token), expiresAt: new Date(this.clock.now().getTime() + this.ttlSeconds() * 1000) };
  }

  /**
   * Spends the token: ONE statement marks it used where it is unused, unexpired and its job is still rendering, so two reads at once give one
   * winner. 404 for a token that was never issued (a malformed one too: the same two queries, the same words), 410 for one that was (used,
   * expired, or its job ended): a holder of a real token may be told it is dead; nobody can tell a wrong one from a made-up one.
   */
  async consume(token: string): Promise<TokenJob> {
    const hash = this.hashOf(TOKEN.test(token) ? token : "never-issued");
    const now = this.clock.now();
    const rows = await this.db.$queryRaw<{ jobId: string; wishId: string; kind: string; width: number; height: number; seconds: number }[]>`
      UPDATE render_job SET "tokenUsedAt" = ${now}
       WHERE "tokenHash" = ${hash} AND "tokenUsedAt" IS NULL AND "tokenExpiresAt" > ${now} AND status = 'rendering'
      RETURNING id::text AS "jobId", "wishId"::text AS "wishId", kind::text AS kind, width, height, seconds`;
    const r = TOKEN.test(token) ? rows[0] : undefined;
    if (r) return { ...r, kind: r.kind === "keepsake-export" ? "keepsake-export" : "status-video" };
    const known = await this.db.renderJob.findUnique({ where: { tokenHash: hash }, select: { id: true } });
    if (TOKEN.test(token) && known) throw new AppError(HttpStatus.GONE, "gone", "This render link is no longer good.");
    throw AppError.notFound("No such render.");
  }
}
