/*
 * Sign-in code figures. Codes: 6 digits, 10 minutes, 5 tries (conventions.md, Signing in; src/common/auth/sign-in-codes.ts).
 * The three limits are PROVISIONAL in .pipeline/decisions.json (DEC-26, DEC-27, DEC-28), owner may change them.
 */
import type { AskLimits } from "../../common/auth/sign-in-codes";

/** DEC-26: seconds before another code may go to the same email. */
export const RESEND_AFTER_SECONDS = 60;
/** DEC-27: codes per email per hour (counted on the canonical email, V5). */
export const CODES_PER_EMAIL_PER_HOUR = 5;
/** DEC-28: codes per IP per hour. */
export const CODES_PER_IP_PER_HOUR = 20;

export const USER_CODE_LIMITS: AskLimits = {
  resendAfterSeconds: RESEND_AFTER_SECONDS,
  perEmail: { count: CODES_PER_EMAIL_PER_HOUR, seconds: 3600 },
  perAddress: { count: CODES_PER_IP_PER_HOUR, seconds: 3600 },
};
