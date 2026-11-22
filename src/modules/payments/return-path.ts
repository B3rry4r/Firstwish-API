import { AppError } from "../../common/errors/app-error";

/** IF1: the longest return path taken. The paths the web serves are far shorter; a longer one is refused before anything else is read. */
export const RETURN_PATH_MAX = 1000;

const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const SLUG = /^[A-Za-z0-9-]{1,32}$/;

/** What a payment is for, as far as the web's pages go: the paths the web serves for it. */
export interface ReturnScope {
  /** the wire purpose of the start (ticket, extra, keep, pro-plan, ...) */
  purpose: string;
  /** the wish or order the payment is for, in one spelling */
  subjectId?: string;
  /** the link slugs of that wish that really exist (only asked for when the path is /w/<slug>) */
  linkSlugs?: (slug: string) => Promise<boolean>;
  /** a link holder pays with no account: the only page they have is the link they came by */
  holderSlug?: string;
}

const fail = (why: string): never => {
  throw AppError.validation({ returnPath: why });
};

/**
 * IF1: a payment start may name where the payer comes back to. The path is checked here, in words, and nothing else of it is ever
 * used: the provider is given the site's own address, this path and the payment's reference. Returns the path as it will be used.
 * Refused: not text, 1,000 characters or more, control characters, a backslash, an outside address, a scheme, "//host", a query or "#"
 * (the server adds ?reference= itself), and any path the web does not serve for what is being paid for.
 */
export async function checkReturnPath(raw: unknown, scope: ReturnScope): Promise<string> {
  if (typeof raw !== "string") return fail("Must be a path on our site, such as /app/wishes/return.");
  if (raw.length >= RETURN_PATH_MAX) return fail(`Must be shorter than ${RETURN_PATH_MAX} characters.`);
  if (CONTROL.test(raw)) return fail("Must not hold control characters.");
  if (raw.includes("\\")) return fail("Must not hold a backslash.");
  if (!raw.startsWith("/")) return fail("Must be a path on our own site that starts with one /, not an address.");
  if (raw.startsWith("//")) return fail("Must not start with //: that names another site.");
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return fail("Must be a path on our own site, not an address with a scheme.");
  if (raw.includes("?") || raw.includes("#")) return fail("Must be the path only: leave out ? and #, the reference is added for you.");
  if (/%2f|%5c|%00|\.\./i.test(raw)) return fail("Must be a plain path the site serves for this payment.");

  const served = (): boolean => {
    if (scope.holderSlug !== undefined) return false;
    return servedFor(scope).includes(raw);
  };
  if (served()) return raw;
  const slug = /^\/w\/([^/]+)$/.exec(raw)?.[1];
  if (slug && SLUG.test(slug) && scope.purpose === "keep") {
    if (scope.holderSlug !== undefined ? slug.toLowerCase() === scope.holderSlug.toLowerCase() : await (scope.linkSlugs?.(slug) ?? false)) return raw;
  }
  return fail("The site has no page at that path for this payment.");
}

/** The pages the web serves for a payment of this kind (exact paths). /app/wishes/return reads any payment by its reference and sends the payer on. */
function servedFor(scope: ReturnScope): string[] {
  const base = ["/app/wishes/return"];
  const id = scope.subjectId;
  switch (scope.purpose) {
    case "ticket":
    case "extra":
    case "keep":
      return id ? [...base, "/app/wishes", `/app/wishes/${id}`] : [...base, "/app/wishes"];
    case "concierge":
      return [...base, "/app/wishes"];
    case "pro-plan":
    case "wish-pack":
      return [...base, "/app/pro/plan", "/app/pro"];
    case "vault-space":
      return [...base, "/app/pro/vault", "/app/pro"];
    case "pass":
      return [...base, "/app/pass"];
    case "creator-plan":
    case "signed":
    case "credit-pack":
    case "extra-review":
      return id ? [...base, "/app/creator", "/app/creator/studio", `/app/creator/studio/${id}`] : [...base, "/app/creator", "/app/creator/studio"];
    default:
      return base;
  }
}

/** The address the provider is given: the site's own address, the path and the reference. */
export function returnAddress(siteUrl: string, path: string, reference: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${path}?reference=${encodeURIComponent(reference)}`;
}
