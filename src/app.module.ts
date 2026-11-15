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
import { CreatorsModule } from "./modules/creators/creators.module";
import { FollowsModule } from "./modules/follows/follows.module";
// end B02

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
  ],
})
export class AppModule {}
