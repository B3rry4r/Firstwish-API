import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { PrismaService } from "../../common/db/prisma.service";
import { RateLimited } from "../../common/errors/rate-limited";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";

/** PROVISIONAL (owner may change): reads a minute per address, passcode tries an hour per link and address, wrong tries that lock a link. */
export const READS_PER_MINUTE = 60;
export const UNLOCKS_PER_HOUR = 10;
export const LINK_WRONG_TRIES = 30;
export const LINK_LOCK_SECONDS = 3600;
/** LL4: the longest window a limit counts over is an hour; a hit older than twice that is of no use, and the timed job removes it. */
export const LINK_HIT_KEEP_SECONDS = 2 * 3600;

/**
 * Limits counted in the database (they fail closed: a dead database refuses the request). A take is ONE statement (insert
 * where the count in the window is under the limit) run under an advisory lock on the bucket and key, so requests at once
 * never pass the limit.
 */
@Injectable()
export class LinkLimits {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** NN4: a key made from an address (or a link) is an HMAC with a server secret, so a table that leaks cannot be hashed back to addresses. */
  keyOf(...parts: (string | null | undefined)[]): string {
    const key = createHmac("sha256", this.env.JWT_ACCESS_SECRET).update("link-key").digest();
    return createHmac("sha256", key).update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 32);
  }

  async take(bucket: string, key: string, max: number, windowSeconds: number): Promise<void> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - windowSeconds * 1000);
    const rows = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${bucket}:${key}`}))`;
      return tx.$queryRaw<{ took: boolean; first: Date | null }[]>`
        WITH ins AS (
          INSERT INTO link_hit (id, bucket, key, at)
          SELECT ${this.ids.id()}::uuid, ${bucket}, ${key}, ${now}
           WHERE (SELECT count(*) FROM link_hit WHERE bucket = ${bucket} AND key = ${key} AND at > ${since}) < ${max}
          RETURNING 1)
        SELECT EXISTS (SELECT 1 FROM ins) AS took,
               (SELECT min(at) FROM link_hit WHERE bucket = ${bucket} AND key = ${key} AND at > ${since}) AS first`;
    });
    if (!rows[0]?.took) {
      const first = rows[0]?.first ?? now;
      const wait = Math.max(1, Math.ceil((first.getTime() + windowSeconds * 1000 - now.getTime()) / 1000));
      throw new RateLimited(wait, `Too many tries. Try again in ${wait} seconds.`);
    }
  }

  /** LL4: removes the hits past their keeping time. The timed job "clean-link-hits" (registered with the jobs frame) calls it; never the path of a limit. */
  async removeOld(): Promise<number> {
    const gone = await this.db.linkHit.deleteMany({ where: { at: { lt: new Date(this.clock.now().getTime() - LINK_HIT_KEEP_SECONDS * 1000) } } });
    return gone.count;
  }
}
