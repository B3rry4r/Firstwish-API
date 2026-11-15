import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./health/health.module";
// B01: sign-in
import { AccountsModule } from "./modules/accounts/accounts.module";
import { AuthCodesModule } from "./modules/auth-codes/auth-codes.module";
import { GoogleIdentityModule } from "./modules/google-identity/google-identity.module";
import { SessionsModule } from "./modules/sessions/sessions.module";

/** Registration entry: each resource module adds one import line here. */
@Module({
  imports: [
    CommonModule,
    HealthModule,
    // B01: sign-in
    SessionsModule,
    AccountsModule,
    AuthCodesModule,
    GoogleIdentityModule,
  ],
})
export class AppModule {}
