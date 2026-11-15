/**
 * The five messages Firstwish sends (B11). Every one goes by email (R11). The wording lives in the MessageTemplate table
 * (seeded from the web app, edited by staff); this file holds what the wording may name and what the code needs from it.
 */
export type TemplateKey = "sealed" | "opens" | "opened" | "resting" | "code";

export interface TemplateSpec {
  key: TemplateKey;
  /** Plain label for staff. */
  label: string;
  /** When it goes, in words for staff. */
  when: string;
  /** Who gets it. */
  audience: string;
  /** The placeholders the code can fill. The wording may use only these. */
  allowed: readonly string[];
  /** The placeholders the message needs: wording that drops one is refused (422). */
  needs: readonly string[];
  /** The delivery log's purpose for this message. */
  purpose: "auth-code" | "wish-delivery" | "opened" | "term-notice";
  /** The in-app notice kind written for it (E-77), when it has one. */
  noticeKind: "opened" | "term-ends-soon" | null;
  /** A person may turn it off. The sign-in code never can. */
  mutable: boolean;
}

export const TEMPLATES: Readonly<Record<TemplateKey, TemplateSpec>> = {
  sealed: {
    key: "sealed", label: "Your wish is sealed", when: "When the sender seals a wish.", audience: "The sender",
    allowed: ["name", "for", "date"], needs: ["name", "for", "date"], purpose: "wish-delivery", noticeKind: null, mutable: true,
  },
  opens: {
    key: "opens", label: "Your wish opens today", when: "On the day the wish opens.", audience: "The sender",
    allowed: ["name", "for", "link"], needs: ["name", "for", "link"], purpose: "wish-delivery", noticeKind: null, mutable: true,
  },
  opened: {
    key: "opened", label: "Your wish was opened", when: "When the receiver opens the wish.", audience: "The sender",
    allowed: ["name", "for"], needs: ["name", "for"], purpose: "opened", noticeKind: "opened", mutable: true,
  },
  resting: {
    key: "resting", label: "Your wish is resting soon", when: "3 days before the term ends, at 09:00 in the wish's time zone.", audience: "The sender",
    allowed: ["name", "for", "date", "link"], needs: ["name", "for", "date", "link"], purpose: "term-notice", noticeKind: "term-ends-soon", mutable: true,
  },
  code: {
    key: "code", label: "Your sign-in code", when: "When someone asks for a sign-in code.", audience: "The person signing in",
    allowed: ["code"], needs: ["code"], purpose: "auth-code", noticeKind: null, mutable: false,
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
export const MUTABLE_KEYS = TEMPLATE_KEYS.filter((k) => TEMPLATES[k].mutable);

export const isTemplateKey = (k: unknown): k is TemplateKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, k);

/** A delivery gets 3 tries (the first counts), with these waits before try 2 and try 3 (declared, PROVISIONAL). */
export const DELIVERY_TRIES = 3;
export const RETRY_WAIT_MS: readonly number[] = [60_000, 5 * 60_000];

/** The hour a "resting soon" notice goes, in the wish's zone (PROVISIONAL: the owner has not named one). */
export const NOTICE_HOUR_LOCAL = 9;

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;

/** The placeholder names a text uses, in order, without repeats. */
export function placeholdersOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The names a text uses that have no value (missing, null or blank). */
export function missingValues(text: string, data: Record<string, unknown>): string[] {
  return placeholdersOf(text).filter((n) => {
    const v = data[n];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (typeof v !== "string" && typeof v !== "number");
  });
}

/** Fills the placeholders. Call missingValues first: this throws on a hole rather than send one. */
export function fill(text: string, data: Record<string, unknown>): string {
  const miss = missingValues(text, data);
  if (miss.length) throw new MissingValueError(miss);
  return text.replace(PLACEHOLDER, (_m, n: string) => String(data[n]));
}

/** A value that goes into a subject: line breaks (and other line separators) become one space, so a subject is one line. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029\u0085]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Fills a subject: the values are made one-line first. */
export function fillSubject(text: string, data: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) clean[k] = typeof v === "string" ? oneLine(v) : v;
  return oneLine(fill(text, clean));
}

export class MissingValueError extends Error {
  constructor(readonly names: string[]) {
    super(`No value for ${names.join(", ")}.`);
  }
}

/** The owner's words that never appear in customer copy (R8). */
export const BANNED_WORDS = ["forever", "launch", "coming soon", "abroad", "diaspora", "sideways"] as const;
const EMOJI = new RegExp("[\\p{Extended_Pictographic}\\p{Regional_Indicator}]|\\u200d|\\ufe0f", "u");

/** What is wrong with a piece of customer wording under the owner's rules, or null. */
export function wordingProblem(text: string): string | null {
  if (EMOJI.test(text)) return "Leave out emoji.";
  const lower = text.toLowerCase();
  const hit = BANNED_WORDS.find((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(lower));
  return hit ? `Do not use the word "${hit}".` : null;
}

export const SUBJECT_MAX = 150;
export const BODY_MAX = 4000;
const TAG = /<\/?[a-zA-Z!][^>]*>?/;
const ZERO_WIDTH = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u202a-\u202e\u2066-\u2069]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

/** Length, tags, zero-width and control characters in staff wording (emails are plain text). Null when fine. */
export function shapeProblem(text: string, max: number): string | null {
  if (text.length > max) return `Keep it to ${max} characters or fewer.`;
  if (TAG.test(text)) return "Plain text only: leave out tags.";
  if (ZERO_WIDTH.test(text) || CONTROL.test(text)) return "Leave out hidden and control characters.";
  return null;
}

/** Why edited wording is not allowed, as field messages (422), or null when it is fine. */
export function wordingProblems(key: TemplateKey, subject: string, body: string): Record<string, string> | null {
  const spec = TEMPLATES[key];
  const fields: Record<string, string> = {};
  const used = new Set([...placeholdersOf(subject), ...placeholdersOf(body)]);
  const unknown = [...used].filter((n) => !spec.allowed.includes(n));
  if (unknown.length) fields.body = `Cannot use ${unknown.map((n) => `{${n}}`).join(", ")} in this message.`;
  const dropped = spec.needs.filter((n) => !used.has(n));
  if (dropped.length) fields.body = `This message needs ${dropped.map((n) => `{${n}}`).join(", ")}.`;
  const sp = wordingProblem(subject);
  if (sp) fields.subject = sp;
  const bp = wordingProblem(body);
  if (bp) fields.body = bp;
  if (/[\r\n]/.test(subject)) fields.subject = "The subject is one line.";
  const sl = shapeProblem(subject, SUBJECT_MAX);
  if (sl) fields.subject = sl;
  const bl = shapeProblem(body, BODY_MAX);
  if (bl) fields.body = bl;
  return Object.keys(fields).length ? fields : null;
}

const EMAIL_LIKE = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g;
/** Any email address in a text becomes a masked one (no address is ever written to a log, an audit row or a reason). */
export function scrubEmails(text: string): string {
  return text.replace(EMAIL_LIKE, (m) => maskEmail(m));
}

/** Provider error text with addresses masked and any six-digit code (spaced or dashed too) removed. */
export function scrubReason(text: string): string {
  return scrubEmails(text).replace(/(?<![\d])\d{3}[ -]?\d{3}(?![\d])/g, "******");
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
