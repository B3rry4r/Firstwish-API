import type { Prisma } from "@prisma/client";
import type { PaymentRequestInfo } from "./fulfilment.registry";

/**
 * What payment.options holds: `request` is the buyer's own detail (never money), `server` is ours: the checkout address, the
 * fingerprint of the request (a repeat under one Idempotency-Key must match it). The flags staff look at are the payment's own
 * `flags` column (DD3), never in here.
 */
export interface PaymentOptions {
  request: PaymentRequestInfo;
  server: { authorizationUrl?: string; fingerprint: string; reason?: string };
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
      reason: typeof s.reason === "string" ? s.reason : undefined,
    },
  };
}

export function writeOptions(o: PaymentOptions): Prisma.InputJsonObject {
  const server: Record<string, Prisma.InputJsonValue> = { fingerprint: o.server.fingerprint };
  if (o.server.authorizationUrl) server.authorizationUrl = o.server.authorizationUrl;
  if (o.server.reason) server.reason = o.server.reason;
  return { request: o.request as unknown as Prisma.InputJsonObject, server };
}

/** The flags with one more, once (the payment's `flags` column, DD3). */
export const withFlag = (flags: readonly string[], flag: string): string[] => (flags.includes(flag) ? [...flags] : [...flags, flag]);
