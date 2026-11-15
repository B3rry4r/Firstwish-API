import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError, ErrorFields } from "./app-error";
import { requestIdOf } from "../http/request-id";

export interface ErrorEnvelope {
  error: { code: string; message: string; fields?: ErrorFields; requestId: string };
}

const CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  406: "not_acceptable",
  408: "request_timeout",
  409: "conflict",
  410: "gone",
  413: "payload_too_large",
  415: "unsupported_media_type",
  422: "validation_failed",
  429: "too_many_requests",
  500: "internal_error",
  502: "bad_gateway",
  503: "service_unavailable",
};

const MESSAGES: Record<number, string> = {
  400: "The request could not be read.",
  401: "Sign in to continue.",
  403: "You cannot do that.",
  404: "Not found.",
  413: "The request is too large.",
  429: "Too many requests. Try again shortly.",
  500: "Something went wrong on our side.",
  503: "The service is not available right now.",
};

/**
 * Every error leaves the API through here, as { error: { code, message, fields?, requestId } }.
 * Unknown errors become 500 with a plain message; the stack is logged, never sent.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly log = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = requestIdOf(req, res);
    const { status, body } = this.toEnvelope(exception, req, requestId);
    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.log.error(`${req.method} ${req.originalUrl} ${status} requestId=${requestId}: ${err.message}`, err.stack);
    }
    if (res.headersSent) return;
    res.setHeader("x-request-id", requestId);
    res.status(status).json(body);
  }

  toEnvelope(exception: unknown, req: Request, requestId: string): { status: number; body: ErrorEnvelope } {
    if (exception instanceof AppError) {
      const status = exception.getStatus();
      return { status, body: envelope(exception.code, exception.message, requestId, exception.fields) };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODES[status] ?? `http_${status}`;
      let message = MESSAGES[status] ?? exception.message;
      if (status === 404) message = `No route ${req.method} ${req.path}.`;
      return { status, body: envelope(code, message, requestId) };
    }
    // body-parser and other express middleware errors carry a status and an expose flag
    const e = exception as { status?: unknown; statusCode?: unknown; expose?: unknown; type?: unknown } | null;
    const raw = e && typeof e === "object" ? (e.status ?? e.statusCode) : undefined;
    if (typeof raw === "number" && raw >= 400 && raw < 500 && e?.expose === true) {
      const code = e.type === "entity.parse.failed" ? "bad_json" : (CODES[raw] ?? `http_${raw}`);
      const message = e.type === "entity.parse.failed" ? "The request body is not valid JSON." : (MESSAGES[raw] ?? "The request could not be read.");
      return { status: raw, body: envelope(code, message, requestId) };
    }
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return { status, body: envelope(CODES[status], MESSAGES[status], requestId) };
  }
}

function envelope(code: string, message: string, requestId: string, fields?: ErrorFields): ErrorEnvelope {
  return { error: fields && Object.keys(fields).length ? { code, message, fields, requestId } : { code, message, requestId } };
}
