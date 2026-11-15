const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Email canon: trimmed and lowercased. Returns null when it is not an email address. */
export function normaliseEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  return v.length <= 254 && EMAIL.test(v) ? v : null;
}
