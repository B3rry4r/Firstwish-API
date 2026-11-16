import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { RateLimited } from "../../common/errors/rate-limited";
import { canonicalEmail } from "../../common/normalise/email";
import { Clock } from "../../common/ports/clock.port";
import { dateOnlyOf } from "../../common/time/time";
import { networkOf } from "../audit/ip-network";
import { THREADS_PER_DAY, TOKEN_MESSAGES_PER_DAY } from "./rules";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

/**
 * Case 5: a thread is let in only while its network and its email are each under THREADS_PER_DAY for the UTC day. The count lives in
 * support_intake_count (raw SQL table), raised by ONE statement that only counts up while under the limit, so two requests at once
 * cannot both take the last place. It runs in the caller's transaction: a refusal on the second key undoes the first. A database
 * that does not answer throws, so the request is refused, never let through. Keys are keyed hashes, never the address.
 */
@Injectable()
export class IntakeLimits {
  constructor(
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private key(kind: "network" | "email", value: string): string {
    return createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(`intake|${kind}|${value}`).digest("hex");
  }

  /** Takes one place for this network (null: unknown, shared bucket) and this email, or throws 429. */
  async take(tx: Tx, ip: string | null | undefined, email: string): Promise<void> {
    const now = this.clock.now();
    const day = dateOnlyOf(now);
    await tx.$executeRaw`DELETE FROM support_intake_count WHERE day < ${day}::date - 2`;
    const keys: [string, string][] = [["network", this.key("network", networkOf(ip) ?? "unknown")], ["email", this.key("email", canonicalEmail(email) ?? email.trim().toLowerCase())]];
    for (const [kind, key] of keys) {
      const rows = await tx.$queryRaw<{ count: number }[]>`
        INSERT INTO support_intake_count (kind, key, day, count) VALUES (${kind}, ${key}, ${day}::date, 1)
        ON CONFLICT (kind, key, day) DO UPDATE SET count = support_intake_count.count + 1 WHERE support_intake_count.count < ${THREADS_PER_DAY}
        RETURNING count`;
      if (rows.length === 0) {
        const next = new Date(`${day}T00:00:00.000Z`).getTime() + 86_400_000;
        throw new RateLimited(Math.max(1, Math.ceil((next - now.getTime()) / 1000)), "Too many messages today. Try again tomorrow.");
      }
    }
  }

  /** Takes a place for an email only (mail that came in; there is no network to count). */
  async takeEmail(tx: Tx, email: string): Promise<boolean> {
    const day = dateOnlyOf(this.clock.now());
    const key = this.key("email", canonicalEmail(email) ?? email.trim().toLowerCase());
    const rows = await tx.$queryRaw<{ count: number }[]>`
      INSERT INTO support_intake_count (kind, key, day, count) VALUES ('email', ${key}, ${day}::date, 1)
      ON CONFLICT (kind, key, day) DO UPDATE SET count = support_intake_count.count + 1 WHERE support_intake_count.count < ${THREADS_PER_DAY}
      RETURNING count`;
    return rows.length > 0;
  }

  /**
   * DA3: one place for a reply token's message today, or false when it has had TOKEN_MESSAGES_PER_DAY. One statement counts it in the
   * database (the kind column is "email": the key is a hash of the token, so it never meets an address's key).
   */
  async takeToken(tx: Tx, token: string): Promise<boolean> {
    const day = dateOnlyOf(this.clock.now());
    const key = this.key("email", `token|${token}`);
    const rows = await tx.$queryRaw<{ count: number }[]>`
      INSERT INTO support_intake_count (kind, key, day, count) VALUES ('email', ${key}, ${day}::date, 1)
      ON CONFLICT (kind, key, day) DO UPDATE SET count = support_intake_count.count + 1 WHERE support_intake_count.count < ${TOKEN_MESSAGES_PER_DAY}
      RETURNING count`;
    return rows.length > 0;
  }
}
