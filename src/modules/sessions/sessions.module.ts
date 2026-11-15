import { Module } from "@nestjs/common";
import { AccessTokens } from "./access-tokens";
import { JwtAccessTokenVerifier } from "./jwt-access-token.verifier";
import { SessionsController, SessionsListController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

/** Sessions: rotating refresh tokens in an httpOnly cookie, 15-minute access tokens, sign out (B01). */
@Module({
  controllers: [SessionsController, SessionsListController],
  providers: [AccessTokens, SessionsService, JwtAccessTokenVerifier],
  exports: [AccessTokens, SessionsService, JwtAccessTokenVerifier],
})
export class SessionsModule {}
