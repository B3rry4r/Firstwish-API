import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis, { RedisOptions } from "ioredis";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";

/** Key prefix for this database: two stacks on one Redis never share keys. */
export function keyPrefixFor(databaseUrl: string): string {
  const db = new URL(databaseUrl).pathname.replace(/^\//, "") || "default";
  return `fw:${db}`;
}

/** Plain Redis client (health, rate limits, locks). Fails fast instead of queueing commands while Redis is down. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly prefix: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.prefix = keyPrefixFor(env.DATABASE_URL);
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on("error", () => undefined); // reported through ping() and health
  }

  /** Connection options for BullMQ, which needs maxRetriesPerRequest null. */
  bullConnection(): RedisOptions {
    const u = new URL(this.env.REDIS_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
      tls: u.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status === "wait" || this.client.status === "end") await this.client.connect();
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== "end" && this.client.status !== "wait") await this.client.quit().catch(() => undefined);
    else this.client.disconnect();
  }
}
