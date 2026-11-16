import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UseGuards } from "@nestjs/common";
import { METHOD_METADATA } from "@nestjs/common/constants";
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

/** The routes that took AdminRoute: where the staff session read draws what each role may do (HX5). */
const ADMIN_ROUTES: { target: object; key: string | symbol; section: string; roles: readonly StaffRole[] }[] = [];

/** On a route that does several things by a body `action`: the table of those actions and the roles of each (the service checks the same table). */
export const STAFF_ACTIONS = "fw:staff-actions";
export const StaffActions = (table: Record<string, readonly string[]>) => SetMetadata(STAFF_ACTIONS, table);

/** One staff write: the section it sits in, the roles its route lists, and what it is called on the session read (the handler's name, snake_case). */
export interface StaffWrite {
  section: string;
  action: string;
  roles: readonly StaffRole[];
  /** the actions a body `action` names, with their roles; null for a route that does one thing */
  table: Record<string, readonly string[]> | null;
}

const WRITE_METHODS = new Set([1, 2, 3, 4, 5]); // RequestMethod POST, PUT, DELETE, PATCH, ALL
const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Every staff write (a route that changes something) with its section and roles: the one table the guard checks and the session read reads. */
export function staffWrites(): StaffWrite[] {
  const out: StaffWrite[] = [];
  for (const r of ADMIN_ROUTES) {
    const fn = (r.target as Record<string | symbol, unknown>)[r.key];
    if (typeof fn !== "function") continue;
    const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
    if (method === undefined || !WRITE_METHODS.has(method)) continue;
    const table = (Reflect.getMetadata(STAFF_ACTIONS, fn) as Record<string, readonly string[]> | undefined) ?? null;
    out.push({ section: r.section, action: snake(String(r.key)), roles: r.roles, table });
  }
  return out;
}

/**
 * Every /v1/admin route says its access with this: the roles the registry lists for it and the section of the role table it
 * sits in. A role must pass both; the owner passes every check.
 *   @AdminRoute("/admin/team", "owner")
 */
export const AdminRoute = (section: string, ...roles: StaffRole[]): MethodDecorator & ClassDecorator => {
  const base = applyDecorators(StaffRoles(...roles), SetMetadata(STAFF_SECTION, section), UseGuards(StaffSectionGuard));
  return ((target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (key !== undefined) ADMIN_ROUTES.push({ target, key, section, roles });
    return base(target, key, descriptor);
  });
};

/** The caller as an audit actor: staff id, address (cut to its network when stored) and request id. */
export const StaffActor = createParamDecorator((_: unknown, ctx: ExecutionContext): AuditActor => {
  const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
  const p = req.principal;
  if (!p || p.kind !== "staff") throw AppError.unauthorized();
  return { type: "staff", id: p.staffId, ip: req.ip ?? null, requestId: requestIdOf(req) };
});
