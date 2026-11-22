import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { AppError } from "../errors/app-error";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^fw-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The path parameters that are ids (a wish, a payment's reference, a file, a creator, ...), by the name the route gives them. */
const ID_PARAMS = new Set(["id", "wishId", "fileId", "voiceId", "creator"]);
const REFERENCE_PARAMS = new Set(["reference"]);

/** The routes whose `:id` is not an id: a style is named by its slug, a payout run by its month. */
export const NOT_AN_ID_ROUTES: readonly string[] = ["GET /v1/styles/:id", "POST /v1/admin/payout-runs/:id/approve"];

/**
 * IF2 (IE2): every route that takes an id in its path answers a spelling that is not an id with 422 in words (never a 500, never a
 * bare 404), and reads an id in any case as the same thing: the id is put in lower case here, before a handler or a service reads it.
 * An interceptor runs before the route's pipes, so the answer does not depend on where the id sits among a handler's parameters.
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
        if (ID_PARAMS.has(name)) {
          if (!UUID.test(value.trim())) throw AppError.validation({ [name]: "Not an id: it is made of letters and digits in groups, like 0192f5a0-1c2b-7000-8000-0123456789ab." });
          params[name] = value.trim().toLowerCase();
        } else if (REFERENCE_PARAMS.has(name)) {
          if (!REFERENCE.test(value.trim())) throw AppError.validation({ [name]: "Not a payment reference: it looks like fw- and an id." });
          params[name] = value.trim().toLowerCase();
        }
      }
    }
    return next.handle();
  }
}
