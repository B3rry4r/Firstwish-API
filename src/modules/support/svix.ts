import { createHmac, timingSafeEqual } from "node:crypto";

/** Svix (Resend's webhook signer) allows a timestamp this far from now, either way. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixCheck = "ok" | "bad_signature" | "old_timestamp";

/**
 * Checks the three svix headers against the raw body. The signed text is `${id}.${timestamp}.${body}`, signed with HMAC-SHA256
 * under the base64 part of the secret ("whsec_<base64>"); the signature header holds one or more "v1,<base64>" entries.
 * `nowSeconds` comes from the clock port, never from Date.now().
 */
export function checkSvix(
  secret: string,
  raw: Buffer,
  h: { id?: string; timestamp?: string; signature?: string },
  nowSeconds: number,
): SvixCheck {
  if (!h.id || !h.timestamp || !h.signature || !/^\d{1,12}$/.test(h.timestamp)) return "bad_signature";
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.`).update(raw).digest();
  let match = false;
  for (const part of h.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) match = true;
  }
  if (!match) return "bad_signature";
  return Math.abs(nowSeconds - Number(h.timestamp)) > SVIX_TOLERANCE_SECONDS ? "old_timestamp" : "ok";
}

/** A signature header for a body (the tests, and the stand-in for Resend, sign with this). */
export function signSvix(secret: string, raw: Buffer | string, id: string, timestamp: number): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest("base64")}`;
}
