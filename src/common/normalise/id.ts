const UUID_ANY_CASE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IE2: an id that arrives in a request is trimmed and, when it is a UUID, put in lower case before it is compared, stored or used as a key. Any other text is only trimmed. */
export function normaliseId(v: string): string {
  const t = v.trim();
  return UUID_ANY_CASE.test(t) ? t.toLowerCase() : t;
}
