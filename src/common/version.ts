import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The API version from package.json, read once. */
export const API_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();
