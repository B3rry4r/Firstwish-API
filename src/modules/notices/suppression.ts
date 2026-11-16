import { Inject, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { canonicalEmail } from "../../common/normalise/email";

type Db = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

/**
 * B20 case 4: an address that complained gets no more email. The table (email_suppression, raw SQL, no Prisma model) holds the
 * address's keyed hash, never the address, so an account erase has nothing to blank.
 */
@Injectable()
export class EmailSuppression {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The keyed hash of an address in the canonical form (letter case and +tag folded). */
  hashOf(address: string): string {
    const canon = canonicalEmail(address) ?? address.trim().toLowerCase();
    return createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(`suppress|${canon}`).digest("hex");
  }

  async has(address: string, db: Db = this.prisma): Promise<boolean> {
    const rows = await db.$queryRaw<{ one: number }[]>`SELECT 1 AS one FROM email_suppression WHERE hash = ${this.hashOf(address)}`;
    return rows.length > 0;
  }

  /** Stops email to the address. Twice changes nothing. */
  async add(address: string, reason: "complained", db: Db = this.prisma): Promise<void> {
    await db.$executeRaw`INSERT INTO email_suppression (hash, reason) VALUES (${this.hashOf(address)}, ${reason}) ON CONFLICT (hash) DO NOTHING`;
  }
}
