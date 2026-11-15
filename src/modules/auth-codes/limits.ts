/*
 * Sign-in code figures. Codes: 6 digits, 10 minutes, 5 tries (conventions.md, Signing in; auth-codes declaration).
 * The three limits are PROVISIONAL in .pipeline/decisions.json (DEC-26, DEC-27, DEC-28), owner may change them.
 */
export const CODE_DIGITS = 6;
export const CODE_LIFE_SECONDS = 10 * 60;
export const CODE_TRIES = 5;
/** DEC-26: seconds before another code may go to the same email. */
export const RESEND_AFTER_SECONDS = 60;
/** DEC-27: codes per email per hour. */
export const CODES_PER_EMAIL_PER_HOUR = 5;
/** DEC-28: codes per IP per hour. */
export const CODES_PER_IP_PER_HOUR = 20;
export const HOUR_MS = 60 * 60 * 1000;
