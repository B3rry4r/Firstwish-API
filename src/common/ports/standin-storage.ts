import type { Request, RequestHandler, Response } from "express";
import type { StandinStorage } from "./adapters/standins";

export const STANDIN_STORAGE = Symbol("STANDIN_STORAGE");

/**
 * HP3: on a stand-in stack the signed read url the API gives points at /v1/standin-storage, which serves the bytes of a stored object
 * for a valid, unexpired signature (the stand-in host never resolves). It is plain middleware, not a route of the API: it is not in
 * the registry. With real providers there is no stand-in storage and the path answers 404.
 */
export function standinStorageMiddleware(storage: StandinStorage | null): RequestHandler {
  return (req: Request, res: Response): void => {
    const none = () => void res.status(404).json({ error: { code: "not_found", message: "Not found." } });
    if (!storage || !["GET", "HEAD", "PUT"].includes(req.method)) return none();
    const path = req.path.replace(/^\/+/, "");
    const slash = path.indexOf("/");
    if (slash < 1) return none();
    let key: string;
    try {
      key = decodeURI(path.slice(slash + 1));
    } catch {
      return none();
    }
    const q = req.query as Record<string, unknown>;
    const sig = typeof q.signature === "string" ? q.signature : "";
    if (path.slice(0, slash) !== storage.bucket) return none();
    if (req.method === "PUT") return void receivePut(storage, req, res, key, Number(q.expires), sig);
    const hit = storage.serve(key, Number(q.expires), sig);
    if (!hit) {
      // M2: the signature is good but the cap dropped the bytes: say so, not "not found"
      if (storage.wasDropped(key) && storage.signedRead(key, Number(q.expires), sig)) {
        return void res.status(410).json({ error: { code: "gone", message: "This file was dropped: the stand-in storage keeps only the newest files." } });
      }
      return none();
    }
    res.status(200).setHeader("content-type", hit.contentType).setHeader("cache-control", "private, no-store").send(hit.bytes);
  };
}

/**
 * HQ3: reads the body and hands it to the stand-in storage. M2: the body is cut off the moment it passes the size the upload was asked
 * for (refused 403 at once, the connection closed), not read to the end. L1: a second put to a ticket that has its file is refused 409.
 */
function receivePut(storage: StandinStorage, req: Request, res: Response, key: string, expires: number, signature: string): void {
  let settled = false;
  const refuse = (status: number, message: string, close = false) => {
    if (settled) return;
    settled = true;
    if (close) {
      res.setHeader("connection", "close");
      res.once("finish", () => req.destroy());
    }
    res.status(status).json({ error: { code: status === 403 ? "forbidden" : status === 409 ? "conflict" : "too_large", message } });
  };
  const bound = storage.boundFor(key);
  if (!bound) return refuse(403, "This upload link is not valid.");
  if (storage.hasLanded(key)) return refuse(409, "This upload already has its file. Ask for a new upload link.");
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (c: Buffer) => {
    if (settled) return;
    size += c.length;
    if (size > bound.contentLength) {
      chunks.length = 0;
      return refuse(403, "The file is not the size this upload was asked for.", true);
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (settled) return;
    const r = storage.receive(key, expires, signature, String(req.headers["content-type"] ?? ""), Buffer.concat(chunks));
    if (!r.ok) return refuse(r.status, r.message);
    settled = true;
    res.status(200).end();
  });
  req.on("error", () => refuse(400, "The upload was cut off."));
}
