import { Inject, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { RateLimited } from "../../common/errors/rate-limited";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";

/** Reports and take-down asks per address in 24 hours (PROVISIONAL, the owner may change it). */
export const REPORTS_PER_DAY = 10;
/** Take-down codes mailed to one email address in 24 hours, whoever asks (PROVISIONAL). */
export const TAKE_DOWN_CODES_PER_EMAIL_PER_DAY = 3;
const DAY_SECONDS = 24 * 60 * 60;

/** The report limit, counted in the database under a lock per key; a database that cannot answer refuses the request (fail closed). */
@Injectable()
export class ReportLimits {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** A key made from an address is an HMAC with a server secret, so a leaked table cannot be turned back into addresses. */
  keyOf(address: string | null | undefined): string {
    const key = createHmac("sha256", this.env.JWT_ACCESS_SECRET).update("report-key").digest();
    return createHmac("sha256", key).update(address ?? "").digest("hex").slice(0, 32);
  }

  async take(bucket: "report" | "take-down" | "take-down-email", address: string | null | undefined, perDay = REPORTS_PER_DAY): Promise<void> {
    const key = this.keyOf(address);
    const now = this.clock.now();
    const since = new Date(now.getTime() - DAY_SECONDS * 1000);
    const rows = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${bucket}:${key}`}))`;
      return tx.$queryRaw<{ took: boolean; first: Date | null }[]>`
        WITH ins AS (
          INSERT INTO report_hit (id, bucket, key, at)
          SELECT ${this.ids.id()}::uuid, ${bucket}, ${key}, ${now}
           WHERE (SELECT count(*) FROM report_hit WHERE bucket = ${bucket} AND key = ${key} AND at > ${since}) < ${perDay}
          RETURNING 1)
        SELECT EXISTS (SELECT 1 FROM ins) AS took,
               (SELECT min(at) FROM report_hit WHERE bucket = ${bucket} AND key = ${key} AND at > ${since}) AS first`;
    });
    if (!rows[0]?.took) {
      const first = rows[0]?.first ?? now;
      const wait = Math.max(1, Math.ceil((first.getTime() + DAY_SECONDS * 1000 - now.getTime()) / 1000));
      throw new RateLimited(wait, bucket === "take-down-email" ? "That address has been sent enough codes for today. Try again later." : "You have sent enough reports for today. Try again later.");
    }
    await this.db.$executeRaw`DELETE FROM report_hit WHERE at < ${new Date(now.getTime() - 2 * DAY_SECONDS * 1000)}`;
  }
}
