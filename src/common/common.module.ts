import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EnvModule } from "./env/env.module";
import { ProvidersModule } from "./ports/providers.module";
import { PrismaService } from "./db/prisma.service";
import { RedisService } from "./queue/redis.service";
import { QueueService } from "./queue/queue.service";
import { AccessGuard } from "./auth/access.guard";
import { AccessTokens } from "./auth/access-tokens";
import { AccessTokenVerifier } from "./auth/principal";
import { SessionFamilies } from "./auth/session-families";
import { SessionTokenVerifier } from "./auth/session-token.verifier";
import { SignInCodes } from "./auth/sign-in-codes";

/**
 * The shared kernel: env, ports, database, Redis and queues, the global access guard, and identity: the one access-token
 * issuer and verifier for user and staff tokens (S1, T5), session families (T4, V1, V2) and the sign-in code helper (U1, U2).
 */
@Global()
@Module({
  imports: [EnvModule, ProvidersModule],
  providers: [
    PrismaService,
    RedisService,
    QueueService,
    AccessTokens,
    SessionFamilies,
    SignInCodes,
    SessionTokenVerifier,
    { provide: AccessTokenVerifier, useExisting: SessionTokenVerifier },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [EnvModule, ProvidersModule, PrismaService, RedisService, QueueService, AccessTokenVerifier, AccessTokens, SessionFamilies, SignInCodes],
})
export class CommonModule {}
