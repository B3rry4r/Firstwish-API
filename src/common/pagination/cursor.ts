import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AppError } from "../errors/app-error";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

/** ?cursor=&limit= (limit 1 to 50, default 20). Extend it in a list DTO. */
export class CursorQueryDto {
  @IsOptional()
  @IsString({ message: "Must be a cursor from a previous page." })
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: `Must be a whole number from 1 to ${MAX_LIMIT}.` })
  @Min(1, { message: `Must be a whole number from 1 to ${MAX_LIMIT}.` })
  @Max(MAX_LIMIT, { message: `Must be a whole number from 1 to ${MAX_LIMIT}.` })
  limit: number = DEFAULT_LIMIT;
}

/** A page of a list: { items, nextCursor }. nextCursor is null on the last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** A cursor position: the sort key of the last item and its id (ids break ties). */
export interface CursorPosition {
  key: string | number;
  id: string;
}

export function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(JSON.stringify([pos.key, pos.id]), "utf8").toString("base64url");
}

/** Decodes a cursor; a cursor the server did not make is 422 on the cursor field. */
export function decodeCursor(cursor: string): CursorPosition {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "string") {
      return { key: v[0], id: v[1] };
    }
  } catch {
    /* falls through to the error below */
  }
  throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
}

/**
 * Builds a page from rows fetched with `take: limit + 1`. The extra row, when present, says there is a next page.
 */
export function toPage<T>(rows: T[], limit: number, positionOf: (row: T) => CursorPosition): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last !== undefined ? encodeCursor(positionOf(last)) : null };
}
