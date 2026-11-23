/**
 * IK1: an opening that holds a secret (a passcode, a question with its answer). The secret lives only as Wish.passcodeHash
 * (Q8, GG7); the document keeps the hint and the question's text (LL3) and never the `code` or the `answer`.
 */
export type SecretOpening = "passcode" | "question";

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** The opening's id is the slug the openings list gives; the def's own name is read the same. */
const KINDS: Record<string, SecretOpening> = { passcode: "passcode", "a passcode": "passcode", question: "question", "a question only they can answer": "question" };

/** Which secret the content's opening needs, or null when it needs none (or names no opening). */
export function secretOpening(content: unknown): SecretOpening | null {
  const o = plain(content) ? content.opening : null;
  return plain(o) && typeof o.id === "string" ? (KINDS[o.id.trim().toLowerCase()] ?? null) : null;
}

/** IK1c: the document without the secret fields (a copy; the input is not changed). */
export function withoutSecrets<T>(content: T): T {
  const same: unknown = content;
  if (!plain(same) || !plain(same.opening) || !plain(same.opening.values)) return content;
  const { code: _c, answer: _a, ...values } = same.opening.values;
  const out: unknown = { ...same, opening: { ...same.opening, values } };
  return out as T;
}

export const SECRET_WORDS: Record<SecretOpening, { field: string; words: string }> = {
  passcode: { field: "passcode", words: "Set the passcode before you seal it." },
  question: { field: "passcode", words: "Set the answer before you seal it." },
};

/** IK2: a question's answer without case or outer spaces. A passcode is never passed through this. */
export const normalAnswer = (a: string): string => a.trim().toLowerCase();
