import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";

/*
 * Money on the wire is a JSON integer of kobo (ruling Q2). Prisma reads BigInt columns as bigint, which JSON.stringify
 * refuses, so every response passes through toWire: each bigint becomes a number, and a value past the safe integer range
 * is refused (the request answers 500 and the error is logged by the error envelope filter). No route returns a raw BigInt.
 */

export class UnsafeIntegerError extends Error {
  constructor(readonly path: string, readonly value: bigint) {
    super(`A response integer at ${path || "(root)"} is past the safe integer range (${value}); refused rather than rounded.`);
    this.name = "UnsafeIntegerError";
  }
}

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const MIN = BigInt(Number.MIN_SAFE_INTEGER);

export function bigintToNumber(v: bigint, path = ""): number {
  if (v > MAX || v < MIN) throw new UnsafeIntegerError(path, v);
  return Number(v);
}

/** A copy of `value` that JSON.stringify accepts: every bigint a safe number, everything else as it serialises. */
export function toWire(value: unknown, path = ""): unknown {
  if (typeof value === "bigint") return bigintToNumber(value, path);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v, i) => toWire(v, `${path}[${i}]`));
  // Only plain objects and arrays are walked. Buffer, typed arrays, Date, Map, Set, StreamableFile, Readable and class
  // instances (with or without their own toJSON) come back as the same reference and serialise as they always did.
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = toWire(v, path ? `${path}.${k}` : k);
  return out;
}

/** Express "json replacer": the last guard for a body written without the interceptor (res.json in a filter). */
export function wireReplacer(this: unknown, key: string, value: unknown): unknown {
  return typeof value === "bigint" ? bigintToNumber(value, key) : value;
}

/** Applied to every route by setupApp. */
@Injectable()
export class WireJsonInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body: unknown) => toWire(body)));
  }
}
