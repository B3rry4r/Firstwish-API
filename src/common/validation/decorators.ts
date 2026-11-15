import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsInt, Max, Min, ValidateBy, ValidationOptions } from "class-validator";
import { normaliseEmail } from "../normalise/email";
import { normalisePhone } from "../normalise/phone";
import { canonicalHandle, handleProblem } from "../normalise/handle";
import { normaliseDateOnly, normaliseInstant, isTimeZone } from "../time/time";
import { isUuidV7 } from "../ids/uuidv7";

/*
 * DTO decorators for the identity and format canon in conventions.md. Each one rewrites a non-canonical
 * spelling to the canon before validation, then checks it; a value it cannot normalise fails with a plain reason.
 */

function canon(fn: (v: string) => string | null) {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const out = fn(value);
    return out ?? value;
  });
}

function check(name: string, ok: (v: unknown) => boolean, message: string | ((v: unknown) => string), opts?: ValidationOptions) {
  return ValidateBy(
    {
      name,
      validator: {
        validate: (v: unknown) => ok(v),
        defaultMessage: (args) => (typeof message === "string" ? message : message(args?.value)),
      },
    },
    opts,
  );
}

/** Email: trimmed, lowercased. */
export const IsCanonEmail = (opts?: ValidationOptions) =>
  applyDecorators(canon(normaliseEmail), check("isCanonEmail", (v) => typeof v === "string" && normaliseEmail(v) === v, "Must be an email address.", opts));

/** Phone: E.164, default country Nigeria. */
export const IsCanonPhone = (opts?: ValidationOptions) =>
  applyDecorators(canon((v) => normalisePhone(v)), check("isCanonPhone", (v) => typeof v === "string" && /^\+\d{8,15}$/.test(v) && normalisePhone(v) === v, "Must be a phone number.", opts));

/** Handle: lowercased, leading @ dropped, then the R5 rules. */
export const IsCanonHandle = (opts?: ValidationOptions) =>
  applyDecorators(
    canon(canonicalHandle),
    check(
      "isCanonHandle",
      (v) => typeof v === "string" && handleProblem(v) === null,
      (v) => (typeof v === "string" ? (handleProblem(v) ?? "") : "Must be a handle."),
      opts,
    ),
  );

/** Instant: any ISO-8601 time with a zone, rewritten to UTC "...Z". */
export const IsInstant = (opts?: ValidationOptions) =>
  applyDecorators(canon(normaliseInstant), check("isInstant", (v) => typeof v === "string" && normaliseInstant(v) === v, "Must be an ISO-8601 time with a zone.", opts));

/** Calendar date: "YYYY-MM-DD". */
export const IsDateOnly = (opts?: ValidationOptions) =>
  applyDecorators(canon(normaliseDateOnly), check("isDateOnly", (v) => typeof v === "string" && normaliseDateOnly(v) === v, "Must be a date as YYYY-MM-DD.", opts));

/** IANA time zone name. */
export const IsTimeZone = (opts?: ValidationOptions) =>
  check("isTimeZone", (v) => typeof v === "string" && isTimeZone(v), "Must be a time zone such as Africa/Lagos.", opts);

/** UUIDv7 id. */
export const IsId = (opts?: ValidationOptions) => check("isId", (v) => isUuidV7(v), "Must be an id.", opts);

/** Money amount in kobo: a whole number from 0 up. A float or a formatted string is refused. */
export const IsKobo = (opts?: ValidationOptions) =>
  applyDecorators(IsInt({ message: "Must be a whole number of kobo.", ...opts }), Min(0, { message: "Must not be negative.", ...opts }), Max(Number.MAX_SAFE_INTEGER, opts));
