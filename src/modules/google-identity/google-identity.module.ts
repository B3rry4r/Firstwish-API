import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { SessionsModule } from "../sessions/sessions.module";
import { GoogleIdentityController } from "./google-identity.controller";
import { GoogleIdentityService } from "./google-identity.service";

/** Google sign-in and linking (B01). The Google port, its adapter and stand-in are kernel ports (T5), picked by PROVIDERS. */
@Module({
  imports: [AccountsModule, SessionsModule],
  controllers: [GoogleIdentityController],
  providers: [GoogleIdentityService],
})
export class GoogleIdentityModule {}
