import { Module } from "@nestjs/common";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AccountsModule } from "../accounts/accounts.module";
import { SessionsModule } from "../sessions/sessions.module";
import { GoogleOidc, StandinGoogle } from "./google.adapters";
import { GoogleIdentityPort } from "./google.port";
import { GoogleIdentityController } from "./google-identity.controller";
import { GoogleIdentityService } from "./google-identity.service";

/** Google sign-in and linking (B01). The port is picked by PROVIDERS like every other port. */
@Module({
  imports: [AccountsModule, SessionsModule],
  controllers: [GoogleIdentityController],
  providers: [
    {
      provide: GoogleIdentityPort,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.PROVIDERS === "standin" ? new StandinGoogle() : new GoogleOidc(env.GOOGLE_CLIENT_ID as string, env.GOOGLE_CLIENT_SECRET as string),
    },
    GoogleIdentityService,
  ],
})
export class GoogleIdentityModule {}
