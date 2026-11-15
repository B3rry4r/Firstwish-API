import type { NextFunction, Request, Response } from "express";
import { UuidV7Maker } from "../ids/uuidv7";

const SAFE = /^[A-Za-z0-9._-]{8,64}$/;
const maker = new UuidV7Maker();

type WithId = Request & { requestId?: string };

/**
 * Gives every request an id: a caller's own x-request-id when it is a plain token of 8 to 64 characters, else a new UUIDv7.
 * The id goes back on every response as x-request-id and appears in every error body.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const given = req.header("x-request-id");
  const id = given && SAFE.test(given) ? given : maker.next();
  (req as WithId).requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

export function requestIdOf(req: Request, res?: Response): string {
  const id = (req as WithId).requestId;
  if (id) return id;
  const made = maker.next();
  (req as WithId).requestId = made;
  res?.setHeader("x-request-id", made);
  return made;
}
