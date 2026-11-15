import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { AppError } from "../errors/app-error";

/** C0 control characters and DEL, except tab, newline and carriage return (AA3). */
// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** The path of the first string holding a control character, or null. Walks objects and arrays (not Buffers). */
export function controlCharPath(value: unknown, path: string, seen = new Set<unknown>()): string | null {
  if (typeof value === "string") return CONTROL_CHARS.test(value) ? path : null;
  if (value === null || typeof value !== "object" || Buffer.isBuffer(value) || seen.has(value)) return null;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (CONTROL_CHARS.test(k)) return path ? `${path}.${k}` : k;
    const hit = controlCharPath(v, path ? `${path}.${k}` : k, seen);
    if (hit !== null) return hit;
  }
  return null;
}

/**
 * AA3: one global check, before validation. Text with a NUL byte or another control character (tab and newline aside) in a
 * body, query or path value is refused with 422 and the field named, never passed on to the database (where NUL is a 500).
 */
@Injectable()
export class ControlCharsPipe implements PipeTransform {
  transform(value: unknown, meta: ArgumentMetadata): unknown {
    if (meta.type !== "body" && meta.type !== "query" && meta.type !== "param") return value;
    const hit = controlCharPath(value, meta.data ?? "");
    if (hit !== null)
      throw AppError.validation({
        [hit || meta.type]: "Must not hold control characters.",
      });
    return value;
  }
}
