import type { Response } from "express";
import { createHash } from "node:crypto";

/**
 * How a public read that anyone gets the same answer to is cached (as GET /v1/styles/levels is): the ETag is the answer's own hash and a client
 * revalidates every time (max-age=0), so a change shows at once and an answer that has not moved is a 304. `shared: false` is for a read that also
 * marks what a signed-in viewer did: a shared cache must not keep it (private) and it varies by the bearer token.
 */
export function publicRead<T>(res: Response, body: T, shared = true): T {
  res.setHeader("Cache-Control", `${shared ? "public" : "private"}, max-age=0, must-revalidate`);
  if (!shared) res.setHeader("Vary", "Authorization");
  res.setHeader("ETag", `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 32)}"`);
  return body;
}
