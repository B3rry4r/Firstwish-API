import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { AppError } from "../errors/app-error";

/** C0 control characters and DEL, except tab, newline and carriage return (AA3). */
// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** A half of a surrogate pair with no other half: text that is not well formed (EE2). A pair (an emoji) is fine. */
export const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** The path of the first string (or key) that `bad` refuses, or null. Walks objects and arrays (not Buffers). */
function badTextPath(value: unknown, path: string, bad: RegExp, seen: Set<unknown>): string | null {
  if (typeof value === "string") return bad.test(value) ? path : null;
  if (value === null || typeof value !== "object" || Buffer.isBuffer(value) || seen.has(value)) return null;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (bad.test(k)) return path ? `${path}.${k}` : k;
    const hit = badTextPath(v, path ? `${path}.${k}` : k, bad, seen);
    if (hit !== null) return hit;
  }
  return null;
}

/** The path of the first string holding a control character, or null. Walks objects and arrays (not Buffers). */
export function controlCharPath(value: unknown, path: string, seen = new Set<unknown>()): string | null {
  return badTextPath(value, path, CONTROL_CHARS, seen);
}

/** The path of the first string holding a lone surrogate, or null (EE2). */
export function illFormedTextPath(value: unknown, path: string, seen = new Set<unknown>()): string | null {
  return badTextPath(value, path, LONE_SURROGATE, seen);
}

/**
 * AA3 and EE2: one global check, before validation. Text with a NUL byte or another control character (tab and newline aside), or
 * ill-formed text (a lone surrogate), in a body, query or path value is refused with 422 and the field named, never passed on
 * to the database (where each is a 500).
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
    const bad = illFormedTextPath(value, meta.data ?? "");
    if (bad !== null)
      throw AppError.validation({
        [bad || meta.type]: "Must be well-formed text.",
      });
    return value;
  }
}
