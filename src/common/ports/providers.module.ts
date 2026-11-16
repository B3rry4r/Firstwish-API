import { Global, Module, Provider } from "@nestjs/common";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";
import { AiWritingPort } from "./ai.port";
import { Clock, StandinClock, SystemClock } from "./clock.port";
import { EmailPort } from "./email.port";
import { GoogleIdentityPort } from "./google.port";
import { CodeGenerator, IdGenerator, StandinCodeGenerator, StandinIdGenerator, SystemCodeGenerator, SystemIdGenerator } from "./ids.port";
import { PaymentsPort } from "./payments.port";
import { PayoutProviderPort } from "./payout-provider.port";
import { RefundProviderPort } from "./refund-provider.port";
import { ImageSizesPort, MissingImageSizes } from "./image-sizes.port";
import { LimitedPort, portTimeouts, withTimeLimit } from "./time-limit";
import { UploadScreeningPort } from "./screening.port";
import { StoragePort } from "./storage.port";
import { AnthropicWriting } from "./adapters/anthropic.adapter";
import { GoogleOidc } from "./adapters/google.adapter";
import { BasicScreening } from "./adapters/basic-screening.adapter";
import { PaystackPayments } from "./adapters/paystack.adapter";
import { PaystackPayoutProvider } from "./adapters/paystack-payout-provider";
import { PaystackRefundProvider } from "./adapters/paystack-refund-provider";
import { StandinPayoutProvider } from "./adapters/standin-payout-provider";
import { StandinRefundProvider } from "./adapters/standin-refund-provider";
import { ResendEmail } from "./adapters/resend.adapter";
import { S3Storage, s3ConfigFor } from "./adapters/s3-storage.adapter";
import {
  StandinAiWriting,
  StandinEmail,
  StandinGoogle,
  StandinImageSizes,
  StandinPayments,
  StandinScreening,
  StandinStorage,
} from "./adapters/standins";

const standin = (env: Env) => env.PROVIDERS === "standin";
const need = (v: string | undefined): string => v as string; // presence is checked by loadEnv for PROVIDERS=live
/** FF1: every port that calls a provider answers within its limit (PORT_TIMEOUTS_MS; the defaults are in time-limit.ts). */
const limited = <T extends object>(env: Env, name: LimitedPort, port: T): T => withTimeLimit(port, name, portTimeouts(env.PORT_TIMEOUTS_MS)[name]);

/** Every port, picked by PROVIDERS (and STORAGE_DRIVER for storage). Inject the abstract class. */
const providers: Provider[] = [
  { provide: Clock, inject: [ENV], useFactory: (env: Env) => (standin(env) ? new StandinClock() : new SystemClock()) },
  {
    provide: IdGenerator,
    inject: [ENV, Clock],
    useFactory: (env: Env, clock: Clock) => (standin(env) ? new StandinIdGenerator(clock) : new SystemIdGenerator(clock)),
  },
  { provide: CodeGenerator, inject: [ENV], useFactory: (env: Env) => (standin(env) ? new StandinCodeGenerator() : new SystemCodeGenerator()) },
  {
    provide: PaymentsPort,
    inject: [ENV, Clock],
    useFactory: (env: Env, clock: Clock) =>
      limited(env, "payments", standin(env) ? new StandinPayments(clock, env.PAYSTACK_SECRET_KEY) : new PaystackPayments(need(env.PAYSTACK_SECRET_KEY), env.PAYSTACK_CALLBACK_URL)),
  },
  // PP1, WW3: the refund and settlement calls and the payout calls are their own ports beside the payments port, on the payments time limit
  {
    provide: RefundProviderPort,
    inject: [ENV],
    useFactory: (env: Env) => limited(env, "payments", standin(env) ? new StandinRefundProvider() : new PaystackRefundProvider(need(env.PAYSTACK_SECRET_KEY))),
  },
  {
    provide: PayoutProviderPort,
    inject: [ENV],
    useFactory: (env: Env) => limited(env, "payments", standin(env) ? new StandinPayoutProvider() : new PaystackPayoutProvider(need(env.PAYSTACK_SECRET_KEY))),
  },
  {
    provide: EmailPort,
    inject: [ENV],
    useFactory: (env: Env) => limited(env, "email", standin(env) ? new StandinEmail() : new ResendEmail(need(env.RESEND_API_KEY), need(env.MAIL_FROM))),
  },
  {
    provide: StoragePort,
    inject: [ENV, Clock],
    useFactory: (env: Env, clock: Clock) => limited(env, "storage", standin(env) ? new StandinStorage(clock) : new S3Storage(s3ConfigFor(env), clock)),
  },
  {
    provide: AiWritingPort,
    inject: [ENV],
    useFactory: (env: Env) => limited(env, "ai", standin(env) ? new StandinAiWriting() : new AnthropicWriting(need(env.ANTHROPIC_API_KEY), need(env.ANTHROPIC_MODEL))),
  },
  {
    provide: GoogleIdentityPort,
    inject: [ENV, Clock],
    useFactory: (env: Env, clock: Clock) =>
      limited(env, "google", standin(env) ? new StandinGoogle() : new GoogleOidc(need(env.GOOGLE_CLIENT_ID), need(env.GOOGLE_CLIENT_SECRET), clock)),
  },
  { provide: UploadScreeningPort, inject: [ENV], useFactory: (env: Env) => limited(env, "screening", standin(env) ? new StandinScreening() : new BasicScreening()) },
  // X22: the image-sizes port; its real adapter comes with the jobs frame (B06)
  { provide: ImageSizesPort, inject: [ENV], useFactory: (env: Env) => limited(env, "imageSizes", standin(env) ? new StandinImageSizes() : new MissingImageSizes()) },
];

@Global()
@Module({
  providers,
  exports: [Clock, IdGenerator, CodeGenerator, PaymentsPort, RefundProviderPort, PayoutProviderPort, EmailPort, StoragePort, AiWritingPort, UploadScreeningPort, GoogleIdentityPort, ImageSizesPort],
})
export class ProvidersModule {}
