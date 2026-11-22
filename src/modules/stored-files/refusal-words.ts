import type { PrismaService } from "../../common/db/prisma.service";
import { type RefusalLabel } from "../../common/ports/screening.port";

/**
 * II2: the words a refused file carries. The screening result's own kind (the first label the screening gave, what it found) picks a line from this
 * fixed list; a result with no kind in the list reads "This file was not accepted." Nothing the customer sent (a file name, a word in a
 * picture) and nothing a provider wrote (its reason text) is ever passed through.
 */
export const NOT_ACCEPTED = "This file was not accepted.";
export const REFUSAL_WORDS: Readonly<Record<RefusalLabel, string>> = {
  "type not taken": "This kind of file is not accepted here.",
  empty: "This file is empty.",
  "too large": "This file is too large.",
  "type mismatch": "This file is not the kind of file it says it is.",
};
export function refusalWords(labels: unknown): string {
  const list = Array.isArray(labels) ? labels.filter((l): l is string => typeof l === "string") : [];
  const kind = list.find((l) => Object.prototype.hasOwnProperty.call(REFUSAL_WORDS, l));
  return kind ? REFUSAL_WORDS[kind as RefusalLabel] : NOT_ACCEPTED;
}

/** The words for each of these files that is refused (status rejected), from its latest screening result. Files in any other state have none. */
export async function refusalsOf(db: Pick<PrismaService, "storedFile">, files: readonly { id: string; status: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const refused = files.filter((f) => f.status === "rejected").map((f) => f.id);
  if (!refused.length) return out;
  const rows = await db.storedFile.findMany({
    where: { id: { in: refused } },
    select: { id: true, screeningResultByFile: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { labels: true } } },
  });
  for (const r of rows) out.set(r.id, refusalWords(r.screeningResultByFile[0]?.labels));
  for (const id of refused) if (!out.has(id)) out.set(id, NOT_ACCEPTED);
  return out;
}
