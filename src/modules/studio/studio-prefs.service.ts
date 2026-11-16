import { Injectable } from "@nestjs/common";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, type ErrorFields } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import type { StudioPrefs } from "../../contracts";
import { isObj, json, obj, type Obj } from "./studio-doc";

const LISTS = ["looks", "recent", "fav"] as const;
const WORDS = ["bottom", "span", "addTab"] as const;
const MAX_LIST = 200;
const MAX_LIST_BYTES = 64_000;
export const PREF_KEYS = ["coached", ...WORDS, ...LISTS] as const;

/**
 * The Studio editor's own settings, kept on the server per account (R10: nothing in the browser). A patch is merged over what is
 * stored; a key sent as null is cleared. Only the keys the registry names are kept: anything else is 422 with the key named.
 */
@Injectable()
export class StudioPrefsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  async read(accountId: string): Promise<StudioPrefs> {
    const row = await this.db.studioPrefs.findUnique({ where: { accountId } });
    return obj(row?.document);
  }

  /** Checks a patch and answers the keys to set (null clears one). */
  clean(body: unknown): Obj {
    if (!isObj(body)) throw AppError.validation({ body: "Send the settings as an object." });
    const fields: ErrorFields = {};
    const out: Obj = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (!(PREF_KEYS as readonly string[]).includes(k)) fields[k] = "This is not a Studio setting.";
      else if (v === null) out[k] = null;
      else if (k === "coached") {
        if (typeof v !== "boolean") fields[k] = "Must be true or false.";
        else out[k] = v;
      } else if ((WORDS as readonly string[]).includes(k)) {
        if (typeof v !== "string" || v.length > 40) fields[k] = "Must be a short word.";
        else out[k] = v;
      } else if (!Array.isArray(v) || v.length > MAX_LIST || Buffer.byteLength(JSON.stringify(v)) > MAX_LIST_BYTES) fields[k] = `Must be a list of at most ${MAX_LIST} items.`;
      else out[k] = v;
    }
    if (Object.keys(fields).length) throw AppError.validation(fields);
    if (!Object.keys(out).length) throw AppError.validation({ body: "Send at least one setting." });
    return out;
  }

  async patch(accountId: string, body: unknown): Promise<StudioPrefs> {
    const set = this.clean(body);
    return this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const row = await tx.studioPrefs.findUnique({ where: { accountId } });
      const merged: Obj = { ...obj(row?.document), ...set };
      for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
      if (row) await tx.studioPrefs.update({ where: { id: row.id }, data: { document: json(merged) } });
      else await tx.studioPrefs.create({ data: { id: this.ids.id(), accountId, document: json(merged) } });
      return merged;
    });
  }
}
