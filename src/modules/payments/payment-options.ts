import type { Prisma } from "@prisma/client";
import type { PaymentRequestInfo } from "./fulfilment.registry";

/**
 * What payment.options holds: `request` is the buyer's own detail (never money), `server` is ours: the checkout address, the
 * fingerprint of the request (a repeat under one Idempotency-Key must match it) and the flags staff look at.
 */
export interface PaymentOptions {
  request: PaymentRequestInfo;
  server: { authorizationUrl?: string; fingerprint: string; flags: string[] };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function readOptions(json: Prisma.JsonValue | null): PaymentOptions {
  const o = obj(json);
  const s = obj(o.server);
  return {
    request: obj(o.request) as unknown as PaymentRequestInfo,
    server: {
      authorizationUrl: typeof s.authorizationUrl === "string" ? s.authorizationUrl : undefined,
      fingerprint: typeof s.fingerprint === "string" ? s.fingerprint : "",
      flags: Array.isArray(s.flags) ? s.flags.filter((f): f is string => typeof f === "string") : [],
    },
  };
}

export function writeOptions(o: PaymentOptions): Prisma.InputJsonObject {
  const server: Record<string, Prisma.InputJsonValue> = { fingerprint: o.server.fingerprint, flags: o.server.flags };
  if (o.server.authorizationUrl) server.authorizationUrl = o.server.authorizationUrl;
  return { request: o.request as unknown as Prisma.InputJsonObject, server };
}

/** Adds a flag once. */
export function withFlag(o: PaymentOptions, flag: string): PaymentOptions {
  return o.server.flags.includes(flag) ? o : { ...o, server: { ...o.server, flags: [...o.server.flags, flag] } };
}
