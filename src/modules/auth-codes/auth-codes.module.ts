import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { NoticesModule } from "../notices/notices.module";
import { SessionsModule } from "../sessions/sessions.module";
import { AuthCodesController } from "./auth-codes.controller";
import { AuthCodesService } from "./auth-codes.service";

/** Sign-in by a code to an email (B01). */
@Module({
  imports: [AccountsModule, SessionsModule, NoticesModule],
  controllers: [AuthCodesController],
  providers: [AuthCodesService],
})
export class AuthCodesModule {}
