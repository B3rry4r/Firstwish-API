/**
 * Handle canon (R5, the app's rule in components/app/feed/spaces.ts): lowercased, a leading @ dropped,
 * [a-z0-9._]{3,20}, starts and ends with a letter or number, no two dots or underscores together, reserved words refused.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "firstwish", "admin", "support", "help", "app", "wishes", "styles", "showing",
  "creator", "creators", "pro", "business", "concierge", "team", "official",
  // V8: routes and words a handle must never take
  "api", "root", "settings", "staff", "moderator", "wish", "w", "v1", "me", "sign-in", "sign-up", "pricing", "terms", "privacy",
  "contact",
]);

/** Lowercases, trims and drops one leading @. Does not remove other characters: a bad character is a problem to report. */
export function canonicalHandle(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, "");
}

/** What is wrong with a canonical handle, in a few words; null when it is good. */
export function handleProblem(h: string): string | null {
  if (h.length < 3) return "Three or more characters.";
  if (h.length > 20) return "Twenty characters at most.";
  if (!/^[a-z0-9._]+$/.test(h)) return "Only letters, numbers, dots and underscores.";
  if (/^[._]|[._]$/.test(h)) return "Start and end with a letter or a number.";
  if (/[._]{2}/.test(h)) return "No two dots or underscores together.";
  if (RESERVED_HANDLES.has(h)) return `@${h} is taken.`;
  return null;
}

/** The canonical handle, or null when it breaks a rule. */
export function normaliseHandle(input: string): string | null {
  const h = canonicalHandle(input);
  return handleProblem(h) ? null : h;
}
