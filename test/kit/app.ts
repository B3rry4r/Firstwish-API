import { INestApplication, ModuleMetadata, Type } from "@nestjs/common";
import { Test, TestingModuleBuilder } from "@nestjs/testing";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { AppModule } from "../../src/app.module";
import { setupApp } from "../../src/app.setup";
import { AccessTokenVerifier, Principal } from "../../src/common/auth/principal";
import { Clock, StandinClock } from "../../src/common/ports/clock.port";
import { CodeGenerator, StandinCodeGenerator } from "../../src/common/ports/ids.port";
import { PaymentsPort } from "../../src/common/ports/payments.port";
import { EmailPort } from "../../src/common/ports/email.port";
import { StoragePort } from "../../src/common/ports/storage.port";
import { AiWritingPort } from "../../src/common/ports/ai.port";
import { UploadScreeningPort } from "../../src/common/ports/screening.port";
import {
  StandinAiWriting,
  StandinEmail,
  StandinPayments,
  StandinScreening,
  StandinStorage,
} from "../../src/common/ports/adapters/standins";

/** Tokens the test verifier understands: "Bearer <token>" maps to the principal given here. */
export class TestTokens extends AccessTokenVerifier {
  private readonly map = new Map<string, Principal>();
  set(token: string, p: Principal): void {
    this.map.set(token, p);
  }
  verify(token: string): Promise<Principal | null> {
    return Promise.resolve(this.map.get(token) ?? null);
  }
}

export interface TestApp {
  app: INestApplication;
  http: () => TestAgent;
  clock: StandinClock;
  codes: StandinCodeGenerator;
  tokens: TestTokens;
  payments: StandinPayments;
  email: StandinEmail;
  storage: StandinStorage;
  ai: StandinAiWriting;
  screening: StandinScreening;
  close: () => Promise<void>;
}

export interface TestAppOptions {
  /** Extra modules, controllers or providers (for a resource under test, or a test-only controller). */
  imports?: ModuleMetadata["imports"];
  controllers?: Type<unknown>[];
  providers?: ModuleMetadata["providers"];
  /** Where the stand-in clock starts (frozen). Default 2026-01-01T09:00:00Z. */
  now?: Date;
  configure?: (b: TestingModuleBuilder) => TestingModuleBuilder;
  /** true: real access tokens, checked by the kernel's verifier (sign-in tests). Default: the TestTokens map. */
  realTokens?: boolean;
}

/**
 * The full app with stand-in providers and a frozen clock, set up exactly as main.ts sets it up.
 * Use http() for requests; read stand-ins (email.sent, payments.started, ...) to assert what the app asked providers to do.
 */
export async function createTestApp(opts: TestAppOptions = {}): Promise<TestApp> {
  const clock = new StandinClock(opts.now ?? new Date("2026-01-01T09:00:00.000Z"));
  const tokens = new TestTokens();
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(opts.imports ?? [])],
    controllers: opts.controllers ?? [],
    providers: opts.providers ?? [],
  })
    .overrideProvider(Clock)
    .useValue(clock);
  if (!opts.realTokens) builder = builder.overrideProvider(AccessTokenVerifier).useValue(tokens);
  if (opts.configure) builder = opts.configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  setupApp(app);
  await app.init();
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  return {
    app,
    http: () => request(server),
    clock,
    tokens,
    codes: app.get<CodeGenerator, StandinCodeGenerator>(CodeGenerator),
    payments: app.get<PaymentsPort, StandinPayments>(PaymentsPort),
    email: app.get<EmailPort, StandinEmail>(EmailPort),
    storage: app.get<StoragePort, StandinStorage>(StoragePort),
    ai: app.get<AiWritingPort, StandinAiWriting>(AiWritingPort),
    screening: app.get<UploadScreeningPort, StandinScreening>(UploadScreeningPort),
    close: () => app.close(),
  };
}

let addressSeq = 0;
/**
 * AA6: a client address of its own for a test that counts per address (the API trusts one proxy in tests, so send it as
 * X-Forwarded-For). Each jest worker owns a block of 4096 addresses picked by its process id and walks it with a counter, so two
 * workers never hand out the same address in one run and per-address limits never leak between specs.
 */
export function uniqueAddress(): string {
  const n = (process.pid % 4096) * 4096 + (addressSeq++ % 4096);
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}
