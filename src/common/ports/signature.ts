import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha512Hex(secret: string, body: Buffer | string): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

/** Constant-time compare of a hex signature header against the expected HMAC-SHA512 of the raw body. */
export function signatureMatches(secret: string, rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !/^[0-9a-f]+$/i.test(signature)) return false;
  const expected = Buffer.from(hmacSha512Hex(secret, rawBody), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
