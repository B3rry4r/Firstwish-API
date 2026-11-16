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
    if (!storage || (req.method !== "GET" && req.method !== "HEAD")) return none();
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
    const hit = path.slice(0, slash) === storage.bucket ? storage.serve(key, Number(q.expires), typeof q.signature === "string" ? q.signature : "") : null;
    if (!hit) return none();
    res.status(200).setHeader("content-type", hit.contentType).setHeader("cache-control", "private, no-store").send(hit.bytes);
  };
}
