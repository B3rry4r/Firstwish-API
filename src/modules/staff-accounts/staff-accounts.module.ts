import { Module } from "@nestjs/common";
import { StaffAccountsController } from "./staff-accounts.controller";
import { StaffAccountsService } from "./staff-accounts.service";
import { StaffAuthService } from "./staff-auth.service";

/** Staff accounts and staff sign-in (StaffAccount, staff sessions). Tokens are the kernel's (S1). */
@Module({
  controllers: [StaffAccountsController],
  providers: [StaffAccountsService, StaffAuthService],
  exports: [StaffAuthService],
})
export class StaffAccountsModule {}
