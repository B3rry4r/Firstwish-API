import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { ErrorEnvelopeFilter } from "../../common/errors/error-envelope.filter";
import { requestIdOf } from "../../common/http/request-id";

const ON_LINK = /^\/v1\/w\/[^/?#]*/;
const kernel = new ErrorEnvelopeFilter();

/**
 * NN3, part one: a path the router cannot decode (%, %ZZ, a broken escape) fails before any route runs, as a 400 from the kernel.
 * On /v1/w/:slug that is "no wish here": 404 in the same envelope. An express error handler (registered once the router is up) so
 * it sees that failure; every other error is passed on untouched.
 */
export function undecodableSlug(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status ?? (err as { statusCode?: unknown } | null)?.statusCode;
  if (!ON_LINK.test(req.originalUrl) || (!(err instanceof URIError) && status !== 400) || res.headersSent) return next(err);
  const requestId = requestIdOf(req, res);
  const { status: code, body } = kernel.toEnvelope(AppError.notFound("No wish is at this link."), req, requestId);
  res.setHeader("x-request-id", requestId);
  res.status(code).json(body);
}

/** NN3, part two: %00 or another control character in the slug reaches the kernel's pipe as a 422 on the slug field: 404 instead. */
@Catch(AppError)
export class SlugControlFilter implements ExceptionFilter {
  catch(exception: AppError, host: ArgumentsHost): void {
    const slugField = exception.getStatus() === 422 && !!exception.fields && "slug" in exception.fields;
    kernel.catch(slugField ? AppError.notFound("No wish is at this link.") : exception, host);
  }
}
