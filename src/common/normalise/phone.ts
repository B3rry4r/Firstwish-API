import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "NG";

/**
 * Phone canon: E.164 ("+2348031472093"), default country Nigeria. "08031472093", "0803 147 2093" and
 * "+234 803 147 2093" all give the same value. Returns null when it is not a valid number.
 */
export function normalisePhone(input: string, country: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const v = input.trim();
  if (!v) return null;
  const parsed = parsePhoneNumberFromString(v, country);
  return parsed && parsed.isValid() ? parsed.number : null;
}
