import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/db/prisma.service";
import { RedisService } from "../common/queue/redis.service";
import { API_VERSION } from "../common/version";

export type DbState = "ok" | "unmigrated" | "down";
export type RedisState = "ok" | "down";
export interface Health {
  status: "ok" | "degraded";
  db: DbState;
  redis: RedisState;
  version: string;
}

const TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), TIMEOUT_MS).unref())]);
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** db is "ok" when the database answers and has at least one finished migration in _prisma_migrations. */
  private async db(): Promise<DbState> {
    try {
      const rows = await this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      return rows[0]?.n > 0 ? "ok" : "unmigrated";
    } catch (e) {
      // 42P01: the migrations table does not exist, so the database answers but was never migrated
      const code = (e as { meta?: { code?: string } }).meta?.code;
      return code === "42P01" ? "unmigrated" : "down";
    }
  }

  async check(): Promise<Health> {
    const [db, redisOk] = await Promise.all([withTimeout<DbState>(this.db(), "down"), withTimeout(this.redis.ping(), false)]);
    const redis: RedisState = redisOk ? "ok" : "down";
    return { status: db === "ok" && redis === "ok" ? "ok" : "degraded", db, redis, version: API_VERSION };
  }
}
