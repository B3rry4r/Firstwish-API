import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { StaffRoles } from "../../common/auth/decorators";
import type { Principal, StaffRole } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { requestIdOf } from "../../common/http/request-id";
import type { AuditActor } from "../audit/audit.service";
import { RoleAccessService } from "./role-access.service";

export const STAFF_SECTION = "fw:staff-section";

/**
 * The staff-role guard. It runs after the kernel's access guard (which has checked the registry's roles and set the principal)
 * and also asks the role table whether one of the caller's roles opens the route's section. The owner passes every check.
 */
@Injectable()
export class StaffSectionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: RoleAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const section = this.reflector.getAllAndOverride<string | undefined>(STAFF_SECTION, [ctx.getHandler(), ctx.getClass()]);
    const p = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>().principal;
    if (!p) throw AppError.unauthorized();
    if (p.kind !== "staff") throw AppError.forbidden();
    if (section === undefined) return true;
    if (await this.access.opens(p.roles, section)) return true;
    throw AppError.forbidden("Your role does not open this section.");
  }
}

/**
 * Every /v1/admin route says its access with this: the roles the registry lists for it and the section of the role table it
 * sits in. A role must pass both; the owner passes every check.
 *   @AdminRoute("/admin/team", "owner")
 */
export const AdminRoute = (section: string, ...roles: StaffRole[]) =>
  applyDecorators(StaffRoles(...roles), SetMetadata(STAFF_SECTION, section), UseGuards(StaffSectionGuard));

/** The caller as an audit actor: staff id, address (cut to its network when stored) and request id. */
export const StaffActor = createParamDecorator((_: unknown, ctx: ExecutionContext): AuditActor => {
  const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
  const p = req.principal;
  if (!p || p.kind !== "staff") throw AppError.unauthorized();
  return { type: "staff", id: p.staffId, ip: req.ip ?? null, requestId: requestIdOf(req) };
});
