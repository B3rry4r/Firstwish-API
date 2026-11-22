import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";

/** The database client. It connects on first use, so the API still boots (and health reports) when the database is down. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    // Every transaction in the app is opened through this client: one wait for a free connection (15 s) and one run time (20 s) for all of them,
    // so a crowd of settles on one account waits its turn instead of failing at Prisma's 2 s default.
    super({ datasourceUrl: env.DATABASE_URL, transactionOptions: { maxWait: 15_000, timeout: 20_000 } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
