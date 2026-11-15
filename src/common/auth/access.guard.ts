import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../errors/app-error";
import { PaymentsPort } from "../ports/payments.port";
import { ACCESS, Access } from "./decorators";
import { AccessTokenVerifier, Principal } from "./principal";

type Req = Request & { principal?: Principal; rawBody?: Buffer };

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** The one global guard. It reads the route's access decorator and lets the request through or refuses it. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenVerifier,
    private readonly payments: PaymentsPort,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== "http") return true;
    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS, [ctx.getHandler(), ctx.getClass()]) ?? { kind: "user" };
    const req = ctx.switchToHttp().getRequest<Req>();

    switch (access.kind) {
      case "public":
        return true;
      case "internal":
        if (LOOPBACK.has(req.socket.remoteAddress ?? "") && !req.headers["x-forwarded-for"]) return true;
        throw AppError.forbidden("Only reachable from the server itself.");
      case "webhook":
        return this.checkWebhook(access.provider, req);
      case "user": {
        const p = await this.principal(req);
        if (p.kind !== "user") throw AppError.forbidden();
        if (access.sides?.length && !access.sides.some((s) => p.sides.includes(s))) throw AppError.forbidden();
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

  private async principal(req: Req): Promise<Principal> {
    const header = req.headers.authorization ?? "";
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    if (!m) throw AppError.unauthorized();
    const p = await this.tokens.verify(m[1]);
    if (!p) throw AppError.unauthorized("Your session has ended. Sign in again.");
    req.principal = p;
    return p;
  }

  private checkWebhook(provider: "paystack", req: Req): boolean {
    const raw = req.rawBody;
    if (provider === "paystack") {
      const sig = req.headers["x-paystack-signature"];
      if (raw && this.payments.verifySignature(raw, typeof sig === "string" ? sig : undefined)) return true;
    }
    throw AppError.unauthorized("The signature does not match.");
  }
}
