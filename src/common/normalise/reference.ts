const REFERENCE_ANY_CASE = /^fw-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** API-BASE-12 case 5: a payment reference that a provider reports back (a webhook, a verify) is put in lower case when it is shaped like ours (fw-<id>), so any spelling of it settles the same payment. Any other text is left exactly as it came. */
export function normaliseReference(v: string): string {
  return REFERENCE_ANY_CASE.test(v) ? v.toLowerCase() : v;
}
