import { readFileSync } from "node:fs";
import { procStart } from "./chromium-video-renderer";

export { procStart };
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RENDER_TEMP_PREFIX } from "./video-renderer";

export const alive = (pid: number, start: number): boolean => start > 0 && procStart(pid) === start;

export interface SweepResult {
  stopped: number;
  removed: number;
}

/**
 * R6: what a dead worker leaves. For every `fw-render-*` entry in the temp folder: a work folder whose owner (the worker process that wrote it) is no longer that same
 * process has its browser and encoder stopped, but ONLY a pid that is still the very process written down (same start time); then it is removed. A result file
 * older than `olderThanMs` is removed, and so is a work folder with no live owner. A work folder of a live owner is never touched, nor are its children, however old.
 */
export async function sweepRenderLeftovers(olderThanMs: number, nowMs: number, root: string = tmpdir()): Promise<SweepResult> {
  const out: SweepResult = { stopped: 0, removed: 0 };
  let names: string[];
  try {
    names = (await readdir(root)).filter((n) => n.startsWith(RENDER_TEMP_PREFIX));
  } catch {
    return out;
  }
  for (const n of names) {
    const path = join(root, n);
    let age: number;
    try {
      age = nowMs - (await stat(path)).mtimeMs;
    } catch {
      continue;
    }
    let remove = age > olderThanMs;
    if (n.endsWith("-work")) {
      let record = false;
      let owned = false;
      try {
        const k = JSON.parse(readFileSync(join(path, "children.json"), "utf8")) as { owner?: { pid: number; start: number }; children?: { kind: string; pid: number; start: number }[] };
        record = true;
        owned = !!k.owner && alive(k.owner.pid, k.owner.start);
        if (!owned) {
          for (const c of k.children ?? []) {
            if (!alive(c.pid, c.start)) continue;
            try {
              process.kill(c.kind === "chromium" ? -c.pid : c.pid, "SIGKILL"); // the browser leads its own group
              out.stopped++;
            } catch {
              /* gone */
            }
          }
        }
      } catch {
        /* no record yet (a render writes it right after it makes the folder): only age decides */
      }
      remove = !owned && (age > olderThanMs || record || age > 60_000);
    }
    if (!remove) continue;
    await rm(path, { recursive: true, force: true });
    out.removed++;
  }
  return out;
}
