import { HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { AppError } from "./app-error";

/** 429 in the error envelope; withRetryAfter copies retryAfter into the Retry-After header. */
export class RateLimited extends AppError {
  constructor(
    readonly retryAfter: number,
    message = `Too many codes asked for. Try again in ${retryAfter} seconds.`,
  ) {
    super(HttpStatus.TOO_MANY_REQUESTS, "too_many_requests", message);
  }
}

/** Sets Retry-After when the error is a rate limit, then lets the error go on to the envelope filter. */
export function withRetryAfter(res: Response, e: unknown): never {
  if (e instanceof RateLimited) res.setHeader("Retry-After", String(e.retryAfter));
  throw e;
}
