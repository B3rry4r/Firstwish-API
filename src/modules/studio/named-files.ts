import type { Prisma } from "@prisma/client";
import type { ErrorFields } from "../../common/errors/app-error";
import type { PrismaService } from "../../common/db/prisma.service";
import { fileRefsOf } from "./submission-checks";
import type { Obj } from "./studio-doc";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * II5: a Studio style names only files of THIS style that belong to its creator and have passed screening. Every place a document names a
 * file (fileRefsOf) is read: the answer is an error field per place, in words that name the place; nothing says whether another
 * creator's file exists (it reads like an id that is no file). A file kept for an approved version (II4, keptAt) is not named anew.
 * II5a: the art list is the shelf: it may hold the style's own files in any state, a use needs a ready file, and the send-in (`sendIn`) needs
 * every file, shelf included, to have passed checking.
 * Call inside the transaction that holds the account's lock, so a file removed at that moment is seen as removed.
 */
export async function namedFileProblems(db: Pick<PrismaService | Prisma.TransactionClient, "storedFile">, accountId: string, styleId: string, doc: Obj, sendIn = false): Promise<ErrorFields> {
  const refs = fileRefsOf(doc);
  const out: ErrorFields = {};
  if (!refs.length) return out;
  const rows = await db.storedFile.findMany({
    where: { id: { in: [...new Set(refs.filter((r) => ID.test(r.value)).map((r) => r.value.toLowerCase()))] } },
    select: { id: true, ownerAccountId: true, styleId: true, status: true, keptAt: true },
  });
  const byId = new Map(rows.map((r) => [r.id.toLowerCase(), r]));
  for (const r of refs) {
    const f = ID.test(r.value) ? byId.get(r.value.toLowerCase()) : undefined;
    let why: string | null = null;
    if (!f || f.ownerAccountId !== accountId || f.styleId !== styleId) why = "is not one of this style's files. Upload it to this style first.";
    else if (f.keptAt) why = "was deleted and cannot be used again. Upload it again.";
    else if (f.status === "deleted") why = "was removed. Take it out of the style.";
    else if (!r.use && !sendIn) why = null;
    else if (f.status === "rejected") why = "was refused when it was checked. Remove it.";
    else if (f.status !== "ready") why = "is still being checked. Wait until it is ready.";
    if (why && !out[r.path]) out[r.path] = `${r.place} names a file that ${why}`;
  }
  return out;
}
