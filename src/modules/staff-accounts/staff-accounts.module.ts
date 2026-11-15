import { Module } from "@nestjs/common";
import { StaffAccountsController } from "./staff-accounts.controller";
import { StaffAccountsService } from "./staff-accounts.service";
import { StaffAuthService } from "./staff-auth.service";
import { StaffTokens, StaffTokenVerifier } from "./staff-tokens";

/** Staff accounts and staff sign-in (StaffAccount, StaffSession). Exports the staff token verifier for the kernel. */
@Module({
  controllers: [StaffAccountsController],
  providers: [StaffAccountsService, StaffAuthService, StaffTokens, StaffTokenVerifier],
  exports: [StaffTokenVerifier, StaffTokens],
})
export class StaffAccountsModule {}
