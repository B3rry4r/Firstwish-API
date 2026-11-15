const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Email canon: trimmed and lowercased. Returns null when it is not an email address. */
export function normaliseEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  return v.length <= 254 && EMAIL.test(v) ? v : null;
}

/**
 * The canonical form per-email limits count on (V5): the email canon with a +tag dropped from the local part
 * ("Ada+x@Mail.com" -> "ada@mail.com"). The account's email stays as typed; only the limits use this.
 */
export function canonicalEmail(input: string): string | null {
  const v = normaliseEmail(input);
  if (!v) return null;
  const at = v.lastIndexOf("@");
  const local = v.slice(0, at).split("+")[0];
  return `${local || v.slice(0, at)}${v.slice(at)}`;
}
