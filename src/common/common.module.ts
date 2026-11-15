import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EnvModule } from "./env/env.module";
import { ProvidersModule } from "./ports/providers.module";
import { PrismaService } from "./db/prisma.service";
import { RedisService } from "./queue/redis.service";
import { QueueService } from "./queue/queue.service";
import { AccessGuard } from "./auth/access.guard";
import { AccessTokenVerifier, RefuseAllTokens } from "./auth/principal";

/** The shared kernel: env, ports, database, Redis and queues, and the global access guard. */
@Global()
@Module({
  imports: [EnvModule, ProvidersModule],
  providers: [
    PrismaService,
    RedisService,
    QueueService,
    { provide: AccessTokenVerifier, useClass: RefuseAllTokens },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [EnvModule, ProvidersModule, PrismaService, RedisService, QueueService, AccessTokenVerifier],
})
export class CommonModule {}
