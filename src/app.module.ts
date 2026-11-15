import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./health/health.module";
// B01: sign-in
import { AccountsModule } from "./modules/accounts/accounts.module";
import { AuthCodesModule } from "./modules/auth-codes/auth-codes.module";
import { GoogleIdentityModule } from "./modules/google-identity/google-identity.module";
import { SessionsModule } from "./modules/sessions/sessions.module";
// B03: staff accounts, roles, sign-in, and the one audit log
import { AuditModule } from "./modules/audit/audit.module";
import { RoleAccessModule } from "./modules/role-access/role-access.module";
import { StaffAccountsModule } from "./modules/staff-accounts/staff-accounts.module";
// end B03
// B09: files
import { StoredFilesModule } from "./modules/stored-files/stored-files.module";
import { ScreeningResultsModule } from "./modules/screening-results/screening-results.module";
import { VoiceNotesModule } from "./modules/voice-notes/voice-notes.module";
import { VaultFilesModule } from "./modules/vault-files/vault-files.module";
// end B09

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
    // B03
    AuditModule,
    RoleAccessModule,
    StaffAccountsModule,
    // end B03
    // B09
    StoredFilesModule,
    ScreeningResultsModule,
    VoiceNotesModule,
    VaultFilesModule,
    // end B09
  ],
})
export class AppModule {}
