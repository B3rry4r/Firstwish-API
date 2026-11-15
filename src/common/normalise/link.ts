/** AA4: the longest link stored. */
export const MAX_LINK_LENGTH = 2048;

/** What is wrong with a link, in a few words; null when it is good. */
export function linkProblem(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return "Must be a full link, such as https://example.com.";
  }
  if (u.protocol !== "https:") return "Must start with https://.";
  if (!u.hostname) return "Must name a site.";
  if (u.username || u.password) return "Must not carry a name or password.";
  if (u.href.length > MAX_LINK_LENGTH) return `${MAX_LINK_LENGTH} characters at most.`;
  return null;
}

/**
 * AA4: a link is stored as the parsed URL's own text (new URL(v).href): https only, at most 2048 characters, no name or
 * password in it. Answers null when the link breaks a rule (linkProblem says why).
 */
export function normaliseLink(input: string): string | null {
  if (linkProblem(input)) return null;
  return new URL(input.trim()).href;
}
