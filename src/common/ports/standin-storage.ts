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
    if (!hit) return none();
    res.status(200).setHeader("content-type", hit.contentType).setHeader("cache-control", "private, no-store").send(hit.bytes);
  };
}

/** HQ3: reads the body (never more than the size the upload was asked for, plus one byte) and hands it to the stand-in storage. */
function receivePut(storage: StandinStorage, req: Request, res: Response, key: string, expires: number, signature: string): void {
  const refuse = (status: number, message: string) => void res.status(status).json({ error: { code: status === 403 ? "forbidden" : "too_large", message } });
  const bound = storage.boundFor(key);
  if (!bound) return refuse(403, "This upload link is not valid.");
  const chunks: Buffer[] = [];
  let size = 0;
  let over = false;
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > bound.contentLength) over = true;
    else chunks.push(c);
  });
  req.on("end", () => {
    if (over) return refuse(403, "The file is not the size this upload was asked for.");
    const r = storage.receive(key, expires, signature, String(req.headers["content-type"] ?? ""), Buffer.concat(chunks));
    if (!r.ok) return refuse(r.status, r.message);
    res.status(200).end();
  });
  req.on("error", () => refuse(400, "The upload was cut off."));
}
