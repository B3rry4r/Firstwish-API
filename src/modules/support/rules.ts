import { maskEmail } from "../../common/normalise/mask-email";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CONTROL_CHARS, LONE_SURROGATE } from "../../common/validation/control-chars.pipe";
import { canonicalEmail, normaliseEmail } from "../../common/normalise/email";

export const SUBJECT_MAX = 150;
/** A message's size limit, in characters (a customer's or staff's text). */
export const MESSAGE_MAX = 5000;
/** Threads one address (network) and one email may open in one UTC day from the contact page. */
export const THREADS_PER_DAY = 5;
export const REPLY_LOCAL = "reply";
export const FALLBACK_REPLY_DOMAIN = "reply.firstwish.test";

const ZERO_WIDTH = new RegExp("[\\u200b-\\u200f\\u2060-\\u2064\\ufeff\\u00ad\\u202a-\\u202e\\u2066-\\u2069]");

/** What is wrong with a piece of text a person or staff typed, as a plain message, or null. Plain text only: no tags. */
export function textProblem(text: string, max: number, label: string): string | null {
  const t = text.trim();
  if (!t) return `Write the ${label}.`;
  if (t.length > max) return `Keep the ${label} to ${max} characters or fewer.`;
  if (CONTROL_CHARS.test(t) || ZERO_WIDTH.test(t) || LONE_SURROGATE.test(t)) return "Leave out hidden and control characters.";
  if (/<\/?[a-zA-Z!][^>]*>?/.test(t)) return "Plain text only: leave out tags.";
  return null;
}

/** Text that came in by email: made safe rather than refused (control characters out, cut to the limit). */
export function cleanInbound(text: string, max: number): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(new RegExp(LONE_SURROGATE.source, "g"), "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);
}

/** An email with its address part shown in part: "a***@mail.com". */
export function maskContact(email: string): string {
  return email ? maskEmail(email) : "";
}

const compact = (id: string): string => id.replace(/-/g, "").toLowerCase();
const expand = (c: string): string => `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;

const mac = (secret: string, threadId: string, contact: string): string =>
  createHmac("sha256", secret).update(`support-reply|${threadId.toLowerCase()}|${contact}`).digest("hex").slice(0, 20);

/**
 * The reply token of a thread: its id and a keyed mark over the id and the person's address, 52 hex characters. Firstwish puts
 * it in the Reply-To address (reply+<token>@<domain>), so an answer by email is matched by it and never by the subject.
 */
export function replyToken(secret: string, threadId: string, contact: string): string {
  return compact(threadId) + mac(secret, threadId, contact);
}

/** The thread id a token names, or null when it is not a token. */
export function threadOfToken(token: string): string | null {
  return /^[0-9a-f]{52}$/.test(token) ? expand(token.slice(0, 32)) : null;
}

/** Whether the token's mark holds for this thread and the contact the thread was opened with. */
export function tokenHolds(secret: string, token: string, threadId: string, contact: string): boolean {
  if (!contact || threadOfToken(token) !== threadId.toLowerCase()) return false;
  const want = Buffer.from(mac(secret, threadId, contact));
  const got = Buffer.from(token.slice(32));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The token a `to` address carries: reply+<token>@anything, in any letter case. */
export function tokenFromAddress(address: string): string | null {
  const m = /^reply\+([0-9a-f]{52})@[^@\s]+$/i.exec(address.trim().replace(/^.*<([^>]+)>\s*$/, "$1"));
  return m ? m[1].toLowerCase() : null;
}

export function replyDomain(mailFrom: string | undefined): string {
  const e = mailFrom ? normaliseEmail(mailFrom.replace(/^.*<([^>]+)>\s*$/, "$1")) : null;
  return e ? e.slice(e.lastIndexOf("@") + 1) : FALLBACK_REPLY_DOMAIN;
}

/** The system senders of a mail domain: a bounce or a no-reply box is never a person. */
const SYSTEM_LOCALS = new Set(["mailer-daemon", "postmaster", "noreply", "no-reply", "do-not-reply", "donotreply", "bounce", "bounces"]);

/**
 * DA1: whether an address is one of ours or a machine's: empty, the sending address (MAIL_FROM), any reply or reply+ address on the mail domain, or a system
 * box (mailer-daemon, postmaster, no-reply) on any domain. A person on the mail domain itself is not excluded by the domain alone.
 */
export function isOwnAddress(mailFrom: string | undefined, address: string | null | undefined): boolean {
  const a = address ? normaliseEmail(address) : null;
  if (!a) return true;
  const at = a.lastIndexOf("@");
  const local = a.slice(0, at);
  const base = local.split("+")[0];
  if (SYSTEM_LOCALS.has(base)) return true;
  const from = mailFrom ? normaliseEmail(mailFrom.replace(/^.*<([^>]+)>\s*$/, "$1")) : null;
  if (from && (from === a || canonicalEmail(from) === canonicalEmail(a))) return true;
  // B20: the reply box is ours only on the mail domain: a person whose address is reply@ some other domain is a person.
  return a.slice(at + 1) === replyDomain(mailFrom) && (base === REPLY_LOCAL || local.startsWith(`${REPLY_LOCAL}+`));
}

/** DA1: a delivery report by its content type, whatever other headers it has. */
export function isDeliveryReport(contentType: string | undefined): boolean {
  return /multipart\/report|message\/delivery-status|message\/disposition-notification/i.test(contentType ?? "");
}

/** DA3: a reply token may add this many messages to its thread in one UTC day. */
export const TOKEN_MESSAGES_PER_DAY = 30;
