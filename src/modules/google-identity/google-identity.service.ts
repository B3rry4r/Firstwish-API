import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ExternalIdentity as ExternalIdentityRow } from "@prisma/client";
import { createHash } from "node:crypto";
import type { ExternalIdentity } from "../../contracts";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { PrismaService } from "../../common/db/prisma.service";
import { RedisService } from "../../common/queue/redis.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { normaliseEmail } from "../../common/normalise/email";
import { toWireInstant } from "../../common/time/time";
import { AccountsService } from "../accounts/accounts.service";
import { ClientMeta, SessionsService, StartedSession } from "../sessions/sessions.service";
import { GOOGLE_ISSUERS } from "./google.adapters";
import { GoogleIdentityPort } from "./google.port";

/** The client id the stand-in expects when GOOGLE_CLIENT_ID is not set (PROVIDERS=standin only). */
export const STANDIN_GOOGLE_CLIENT_ID = "standin-google-client";
/** How long a started Google sign-in may take before its state is gone. */
const STATE_SECONDS = 10 * 60;

export interface GoogleStart {
  /** Where the browser goes next: Google's sign-in page. */
  url: string;
}

export type ExternalIdentityView = Pick<ExternalIdentity, "id" | "accountId" | "provider" | "subject" | "email" | "emailVerified" | "createdAt"> & {
  returnTo: string | null;
};

interface ProvedGoogle {
  subject: string;
  email: string;
}

const refused = (message: string) => new AppError(HttpStatus.BAD_REQUEST, "google_refused", message);

@Injectable()
export class GoogleIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly google: GoogleIdentityPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E-54: starts the code flow with PKCE. The state and the verifier stay on the server for 10 minutes, used once. */
  async start(returnTo: string | undefined): Promise<GoogleStart> {
    const back = returnTo ?? "/app";
    if (!/^\/(?![/\\])[^\s]*$/.test(back) || back.length > 500) {
      throw AppError.validation({ returnTo: "Must be a path on this site, such as /app." });
    }
    const state = this.codes.token(24);
    const verifier = this.codes.token(48);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    await this.store().then((c) => c.set(this.stateKey(state), JSON.stringify({ verifier, returnTo: back }), "EX", STATE_SECONDS));
    return { url: this.google.authorizationUrl({ clientId: this.clientId(), redirectUri: this.redirectUri(), state, codeChallenge: challenge }) };
  }

  /** E-53: Google sent the browser back. One account per email: a Google email that has an account signs into it. */
  async callback(code: string, state: string, meta: ClientMeta): Promise<{ started: StartedSession; email: string; isNew: boolean; returnTo: string }> {
    const { proved, returnTo } = await this.prove(code, state);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`google:${proved.subject}`}))`;
      const linked = await tx.externalIdentity.findFirst({ where: { provider: "google", subject: proved.subject }, include: { account: true } });
      let accountId: string;
      let email: string;
      let isNew = false;
      if (linked) {
        if (linked.account.erasedAt) return null;
        accountId = linked.accountId;
        email = linked.account.contact ?? proved.email;
        if (linked.email !== proved.email) await tx.externalIdentity.update({ where: { id: linked.id }, data: { email: proved.email } });
      } else {
        const found = await this.accounts.findOrCreateByEmail(tx, proved.email);
        if (found.account.erasedAt) return null;
        accountId = found.account.id;
        email = proved.email;
        isNew = found.isNew;
        await tx.externalIdentity.create({
          data: { id: this.ids.id(), accountId, provider: "google", subject: proved.subject, email: proved.email, emailVerified: true, returnTo, createdAt: this.clock.now() },
        });
      }
      const started = await this.sessions.start(tx, accountId, meta);
      return { started, email, isNew };
    });
    if (!result) throw refused("This account cannot sign in.");
    return { ...result, returnTo };
  }

  /** E-56: links a Google account to the signed-in account. */
  async link(accountId: string, code: string, state: string): Promise<ExternalIdentityView> {
    const { proved, returnTo } = await this.prove(code, state);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`google:${proved.subject}`}))`;
      const linked = await tx.externalIdentity.findFirst({ where: { provider: "google", subject: proved.subject } });
      if (linked && linked.accountId !== accountId) {
        throw AppError.conflict("google_linked_elsewhere", "That Google account signs in to another Firstwish account.");
      }
      const row =
        linked ??
        (await tx.externalIdentity.create({
          data: { id: this.ids.id(), accountId, provider: "google", subject: proved.subject, email: proved.email, emailVerified: true, returnTo, createdAt: this.clock.now() },
        }));
      return this.view(row);
    });
  }

  /** E-55: unlinks one Google account. The email code always remains a way in, so this is never the last way. */
  async unlink(accountId: string, id: string): Promise<void> {
    const { count } = await this.prisma.externalIdentity.deleteMany({ where: { id, accountId } });
    if (count === 0) throw AppError.notFound("No such linked Google account.");
  }

  view(r: ExternalIdentityRow): ExternalIdentityView {
    return {
      id: r.id,
      accountId: r.accountId,
      provider: r.provider,
      subject: r.subject,
      email: r.email,
      emailVerified: r.emailVerified,
      createdAt: toWireInstant(r.createdAt),
      returnTo: r.returnTo,
    };
  }

  /** Uses the state once, trades the code, and checks the ID token: signature, issuer, audience, expiry, verified email. */
  private async prove(code: string, state: string): Promise<{ proved: ProvedGoogle; returnTo: string }> {
    const raw = await this.store().then((c) => c.getdel(this.stateKey(state)));
    if (!raw) throw refused("This Google sign-in has run out or was already used. Start again.");
    const saved = JSON.parse(raw) as { verifier: string; returnTo: string };
    let idToken: string;
    try {
      ({ idToken } = await this.google.exchangeCode({ code, codeVerifier: saved.verifier, redirectUri: this.redirectUri() }));
    } catch {
      throw refused("Google did not accept this sign-in. Start again.");
    }
    const c = await this.google.verifySignature(idToken);
    if (!c) throw refused("Google's answer could not be checked.");
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (typeof c.iss !== "string" || !GOOGLE_ISSUERS.includes(c.iss)) throw refused("Google's answer could not be checked.");
    if (!aud.includes(this.clientId())) throw refused("Google's answer was not meant for Firstwish.");
    if (typeof c.exp !== "number" || c.exp * 1000 <= this.clock.now().getTime()) throw refused("Google's answer has run out. Start again.");
    if (typeof c.sub !== "string" || !c.sub) throw refused("Google's answer could not be checked.");
    const email = typeof c.email === "string" ? normaliseEmail(c.email) : null;
    if (!email || (c.email_verified !== true && c.email_verified !== "true")) {
      throw refused("Google has not confirmed this email. Use a code to your email instead.");
    }
    return { proved: { subject: c.sub, email }, returnTo: saved.returnTo };
  }

  private clientId(): string {
    return this.env.GOOGLE_CLIENT_ID ?? STANDIN_GOOGLE_CLIENT_ID;
  }

  private redirectUri(): string {
    return this.env.GOOGLE_REDIRECT_URI ?? `${this.env.PUBLIC_SITE_URL}/auth/google`;
  }

  private stateKey(state: string): string {
    return `${this.redis.prefix}:google-state:${createHash("sha256").update(state).digest("hex")}`;
  }

  private async store() {
    const c = this.redis.client;
    if (c.status === "wait" || c.status === "end") await c.connect();
    return c;
  }
}
