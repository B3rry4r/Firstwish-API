import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { RateLimited } from "../../common/errors/rate-limited";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";

/** PROVISIONAL (owner may change): reads a minute per address, passcode tries an hour per link and address, wrong tries that lock a link. */
export const READS_PER_MINUTE = 60;
export const UNLOCKS_PER_HOUR = 10;
export const LINK_WRONG_TRIES = 30;
export const LINK_LOCK_SECONDS = 3600;

/** A key made from an address: a hash, so no address is ever stored. */
export const keyOf = (...parts: (string | null | undefined)[]): string =>
  createHash("sha256").update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 32);

/**
 * Limits counted in the database (they fail closed: a dead database refuses the request). A take is ONE statement (insert
 * where the count in the window is under the limit) run under an advisory lock on the bucket and key, so requests at once
 * never pass the limit.
 */
@Injectable()
export class LinkLimits {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

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
    // old rows are cleared now and then, never on the path of the limit itself
    if (Math.random() < 0.02) void this.db.$executeRaw`DELETE FROM link_hit WHERE at < ${new Date(now.getTime() - 2 * 3600 * 1000)}`.catch(() => undefined);
  }
}
