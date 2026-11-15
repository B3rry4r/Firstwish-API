import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { Principal, Side, StaffRole, WebhookProvider } from "./principal";

/*
 * Access is decided per route by one of these. A route with none needs a signed-in user (any side).
 *   @Public()                  anyone, no token.
 *   @Roles("creator")          a signed-in user with one of these sides.
 *   @StaffRoles("ops")         staff with one of these roles (owner passes every staff check).
 *   @WebhookSignature("paystack")  no user; the provider's signature on the raw body must match.
 *   @Internal()                only from this machine (job runner, ops scripts), never through a proxy.
 */
export const ACCESS = "fw:access";
export type Access =
  | { kind: "public" }
  | { kind: "user"; sides?: Side[] }
  | { kind: "staff"; roles: StaffRole[] }
  | { kind: "webhook"; provider: WebhookProvider }
  | { kind: "internal" };

export const Public = () => SetMetadata(ACCESS, { kind: "public" } satisfies Access);
export const Roles = (...sides: Side[]) => SetMetadata(ACCESS, { kind: "user", sides } satisfies Access);
export const StaffRoles = (...roles: StaffRole[]) => SetMetadata(ACCESS, { kind: "staff", roles } satisfies Access);
export const WebhookSignature = (provider: WebhookProvider) => SetMetadata(ACCESS, { kind: "webhook", provider } satisfies Access);
export const Internal = () => SetMetadata(ACCESS, { kind: "internal" } satisfies Access);

/** The caller, as set by the access guard. Undefined on public, webhook and internal routes. */
export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal | undefined => {
  return (ctx.switchToHttp().getRequest<Request & { principal?: Principal }>()).principal;
});
