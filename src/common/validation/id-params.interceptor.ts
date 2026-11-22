import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^fw-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The path parameters that are ids (a wish, a payment's reference, a file, a creator, ...), by the name the route gives them. */
const ID_PARAMS = new Set(["id", "wishId", "fileId", "voiceId", "creator"]);
const REFERENCE_PARAMS = new Set(["reference"]);

/** The routes whose `:id` is not an id: a style is named by its slug, a payout run by its month. */
export const NOT_AN_ID_ROUTES: readonly string[] = ["GET /v1/styles/:id", "POST /v1/admin/payout-runs/:id/approve"];

/**
 * IF2a (IE2): an id or a payment reference in the path is read in any case as the same thing: when it is shaped like one it is put in lower case here,
 * before a handler or a service reads it. A path value that is not an id is left as it is and the route answers it as it always has (404, "no such
 * thing"); a non-id in a body or query field is 422 in words (the validation of that field). An interceptor runs before the route's pipes.
 */
@Injectable()
export class IdParamsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const params = req.params as Record<string, string> | undefined;
    const route = `${req.method} ${(req.route as { path?: string } | undefined)?.path ?? ""}`;
    if (params && !NOT_AN_ID_ROUTES.includes(route)) {
      for (const [name, value] of Object.entries(params)) {
        if (typeof value !== "string") continue;
        const v = value.trim();
        if ((ID_PARAMS.has(name) && UUID.test(v)) || (REFERENCE_PARAMS.has(name) && REFERENCE.test(v))) params[name] = v.toLowerCase();
      }
    }
    return next.handle();
  }
}
