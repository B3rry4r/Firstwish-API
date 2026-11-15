import { Module } from "@nestjs/common";
import { SessionsController, SessionsListController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

/** User sessions: rotating refresh tokens in an httpOnly cookie, sign out (B01; families and tokens live in the kernel). */
@Module({
  controllers: [SessionsController, SessionsListController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
