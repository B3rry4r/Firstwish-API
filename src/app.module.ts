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
// B14: styles (levels, on and off, use counts), app events, Studio templates
import { EventsModule } from "./modules/events/events.module";
import { StylesModule } from "./modules/styles/styles.module";
import { TemplatesModule } from "./modules/templates/templates.module";
// end B14
// B04: the price book
import { PriceBookModule } from "./modules/price-book/price-book.module";
// end B04
// B02: account sides, creators, business profile, follow
import { BusinessModule } from "./modules/business/business.module";
import { ProBusinessModule } from "./modules/pro-business/pro-business.module";
import { CreatorsModule } from "./modules/creators/creators.module";
import { FollowsModule } from "./modules/follows/follows.module";
// end B02
// B09: files
import { StoredFilesModule } from "./modules/stored-files/stored-files.module";
import { ScreeningResultsModule } from "./modules/screening-results/screening-results.module";
import { VoiceNotesModule } from "./modules/voice-notes/voice-notes.module";
import { VaultFilesModule } from "./modules/vault-files/vault-files.module";
// end B09
// B12: dates and saved things
import { DatesModule } from "./modules/dates/dates.module";
import { PeopleModule } from "./modules/people/people.module";
import { SavedWishesModule } from "./modules/saved-wishes/saved-wishes.module";
// end B12
// B06: the wish and the jobs frame
import { JobsModule } from "./modules/jobs/jobs.module";
import { WishesModule } from "./modules/wishes/wishes.module";
import { PublicWishesModule } from "./modules/public-wishes/public-wishes.module";
// end B06

// B05: payments core
import { PaymentsModule } from "./modules/payments/payments.module";
// end B05
// INT-3: the joins (handlers other bundles exported, registered with the jobs frame)
import { PurchasesModule } from "./modules/purchases/purchases.module";
import { JobHandlersModule } from "./modules/job-handlers/job-handlers.module";
// end INT-3

// B11: email notices
import { NoticesModule } from "./modules/notices/notices.module";
// end B11

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
    // B14
    StylesModule,
    EventsModule,
    TemplatesModule,
    // end B14
    // B04
    PriceBookModule,
    // end B04
    // B02
    CreatorsModule,
    FollowsModule,
    BusinessModule,
    // end B02
    // B09
    StoredFilesModule,
    ScreeningResultsModule,
    VoiceNotesModule,
    VaultFilesModule,
    // end B09
    // B12
    PeopleModule,
    DatesModule,
    SavedWishesModule,
    // end B12
    // B05
    PaymentsModule,
    // end B05
    // B06
    JobsModule,
    WishesModule,
    // end B06
    // B07
    PurchasesModule,
    // end B07
    // B10
    PublicWishesModule,
    // end B10
    // INT-3
    JobHandlersModule,
    // end INT-3
    // B17
    ProBusinessModule,
    // end B17
    // B11
    NoticesModule,
    // end B11
  ],
})
export class AppModule {}
