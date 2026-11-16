import { Inject, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { canonicalEmail } from "../../common/normalise/email";

type Db = Pick<Prisma.TransactionClient, "emailSuppression">;

/**
 * B20 case 4: an address that complained gets no more email. The table (email_suppression, the EmailSuppression model) holds the
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
    return (await db.emailSuppression.count({ where: { hash: this.hashOf(address) } })) > 0;
  }

  /** Stops email to the address. Twice changes nothing. */
  async add(address: string, reason: "complained", db: Db = this.prisma): Promise<void> {
    await db.emailSuppression.createMany({ data: [{ hash: this.hashOf(address), reason }], skipDuplicates: true });
  }
}
