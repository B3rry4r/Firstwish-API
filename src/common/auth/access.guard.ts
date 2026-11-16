import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";
import { PrismaService } from "../db/prisma.service";
import { AppError } from "../errors/app-error";
import { loginRemoved, loginWasRemoved } from "./login-removed";
import { PaymentsPort } from "../ports/payments.port";
import { assertCookieOrigin, COOKIE_ORIGIN } from "./cookie-origin";
import { checkSvix } from "./svix";
import { Clock } from "../ports/clock.port";
import { ACCESS, Access } from "./decorators";
import { AccessTokenVerifier, Principal, WebhookProvider } from "./principal";

type Req = Request & { principal?: Principal; rawBody?: Buffer };

const PROXY_HEADERS = ["x-forwarded-for", "forwarded", "x-real-ip"];

function sameSecret(given: string | undefined, want: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The one global guard. It reads the route's access decorator and lets the request through or refuses it. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenVerifier,
    private readonly payments: PaymentsPort,
    private readonly clock: Clock,
    private readonly db: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true;
    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS, [ctx.getHandler(), ctx.getClass()]) ?? { kind: "user" };
    const req = ctx.switchToHttp().getRequest<Req>();
    if (this.reflector.getAllAndOverride<boolean | undefined>(COOKIE_ORIGIN, [ctx.getHandler(), ctx.getClass()])) assertCookieOrigin(req, this.env);

    switch (access.kind) {
      case "public":
      case "cookie": // the refresh routes check their cookie themselves (T3)
        return true;
      case "internal":
        // Default (lead), owner may override: a shared secret, and never through a proxy.
        {
          const token = req.headers["x-internal-token"];
          const viaProxy = PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
          if (!viaProxy && sameSecret(typeof token === "string" ? token : undefined, this.env.INTERNAL_TOKEN)) return true;
        }
        throw AppError.forbidden("Only reachable from the server itself.");
      case "webhook":
        return this.checkWebhook(access.provider, req);
      case "user": {
        const p = await this.principal(req);
        if (p.kind !== "user") throw AppError.forbidden();
        if (access.sides?.length && !access.sides.some((s) => p.sides.includes(s))) throw await this.refusedSides(access, p);
        return true;
      }
      case "userOrStaff": {
        const p = await this.principal(req);
        if (p.kind === "user") {
          if (access.sides?.length && !access.sides.some((s) => p.sides.includes(s))) throw await this.refusedSides(access, p);
          return true;
        }
        if (!p.roles.includes("owner") && !access.roles.some((r) => p.roles.includes(r))) throw AppError.forbidden();
        return true;
      }
      case "staff": {
        const p = await this.principal(req);
        if (p.kind !== "staff") throw AppError.forbidden();
        if (!p.roles.includes("owner") && !access.roles.some((r) => p.roles.includes(r))) throw AppError.forbidden();
        return true;
      }
    }
  }

  /** HU5: the one place a business read is refused for want of the business side: a person whose login was removed is told so, with words. */
  private async refusedSides(access: { sides?: readonly string[] }, p: Principal): Promise<AppError> {
    if (p.kind === "user" && access.sides?.includes("business") && (await loginWasRemoved(this.db, p.accountId))) return loginRemoved();
    return AppError.forbidden();
  }

  private async principal(req: Req): Promise<Principal> {
    const header = req.headers.authorization ?? "";
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    if (!m) throw AppError.unauthorized();
    const p = await this.tokens.verify(m[1]);
    if (!p) throw AppError.unauthorized("Your session has ended. Sign in again.");
    req.principal = p;
    return p;
  }

  private checkWebhook(provider: WebhookProvider, req: Req): boolean {
    const raw = req.rawBody;
    if (provider === "resend") {
      // YY3: Resend signs with svix. No secret (or the bare "whsec_" prefix) is 503, never "let through"; then the signature over the
      // raw body and the timestamp (5 minutes either way, read from the clock port).
      const secret = (this.env.RESEND_WEBHOOK_SECRET ?? "").trim();
      if (!secret || secret === "whsec_") throw new AppError(503, "webhook_not_configured", "The email webhook has no signing secret.");
      if (!raw) throw AppError.unauthorized("The signature does not match.");
      const h = (name: string): string | undefined => {
        const v = req.headers[name];
        return typeof v === "string" ? v : undefined;
      };
      const check = checkSvix(secret, raw, { id: h("svix-id"), timestamp: h("svix-timestamp"), signature: h("svix-signature") }, Math.floor(this.clock.now().getTime() / 1000));
      if (check === "ok") return true;
      throw AppError.unauthorized(check === "old_timestamp" ? "The event is too old." : "The signature does not match.");
    }
    if (provider === "paystack") {
      const sig = req.headers["x-paystack-signature"];
      if (raw && this.payments.verifySignature(raw, typeof sig === "string" ? sig : undefined)) return true;
    }
    throw AppError.unauthorized("The signature does not match.");
  }
}
