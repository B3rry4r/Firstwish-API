import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { isTimeZone } from "../../common/time/time";
import { Injectable } from "@nestjs/common";
import { Account as AccountRow, DateRow as DateRowRecord, Prisma } from "@prisma/client";
import type { Account, PatchMeBody } from "../../contracts";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import { Clock } from "../../common/ports/clock.port";
import { HANDLE_TAKEN, isUniqueViolation, readContact, setHandle, sidesOf } from "./account-rules";
import { dateOnlyOf, normaliseDateOnly, toWireInstant } from "../../common/time/time";
import { SHOWN_TO_BUYER } from "../wishes/wish-shown";

/** A date row as /v1/me shows it. */
export interface MeDate {
  id: string;
  name: string | null;
  who: string | null;
  what: string | null;
  date: string | null;
}

/**
 * The signed-in person's own account (E-6, E-7). Fields an erase blanks, or that are not set yet, are null.
 * contact and email are the sign-in email (S-27); phone is a plain detail, never verified and never a key (R11).
 */
export type MeView = Pick<Account, "id" | "mode" | "timeZone" | "sides" | "creator" | "erased" | "joined" | "lastSide" | "wishCount"> & {
  name: string | null;
  email: string | null;
  contact: string | null;
  phone: string | null;
  bio: string | null;
  handle: string | null;
  business: string | null;
  space: Account["space"];
  dates: MeDate[];
  /** HR3: the business the person owns (role owner) and every business they hold a login on (role login, with the login's state), owner first */
  businesses: MeBusiness[];
  /** HW2: the creator's profile picture, read through a signed address */
  picture: { fileId: string; url: string; expiresAt: string } | null;
};

export interface MeBusiness {
  id: string;
  name: string;
  role: "owner" | "login";
  state: "owner" | "invited" | "active" | "removed";
}

type Db = Prisma.TransactionClient | PrismaService;
type Side = Account["sides"][number];

const NAME_MAX = 80;
const DATE_TEXT_MAX = 80;
const DATES_PER_PATCH = 10;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly signed: SignedUrlsService,
  ) {}

  /**
   * The account for a proved email, made on first sign-in (one account per email). Safe when two sign-ins race:
   * the insert relies on the unique email and the loser reads the winner's row.
   */
  async findOrCreateByEmail(db: Db, email: string): Promise<{ account: AccountRow; isNew: boolean }> {
    const found = await db.account.findUnique({ where: { contact: email } });
    if (found) return { account: found, isNew: false };
    const id = this.ids.id();
    const inserted = await db.$executeRaw`
      INSERT INTO account (id, contact, sides, "lastSide", mode, "createdAt")
      VALUES (${id}::uuid, ${email}, ARRAY['person']::"AccountSides"[], 'person', 'system', ${this.clock.now()})
      ON CONFLICT (contact) DO NOTHING`;
    const account = await db.account.findUniqueOrThrow({ where: { contact: email } });
    return { account, isNew: inserted === 1 };
  }

  async me(accountId: string): Promise<MeView> {
    const row = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!row || row.erasedAt) throw AppError.unauthorized("Your session has ended. Sign in again.");
    return this.view(row);
  }

  async patch(accountId: string, body: PatchMeBody): Promise<MeView> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // AA1: the account lock first; an erased account refuses the whole write (401 account_erased).
        await lockAccount(tx, accountId);
        const current = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
        const data: Prisma.AccountUpdateInput = {};
        const fields: ErrorFields = {};

        if (body.name !== undefined) {
          const name = body.name.trim();
          if (name.length > NAME_MAX) fields.name = `Must be ${NAME_MAX} characters or fewer.`;
          else data.name = name;
        }
        if (body.mode !== undefined) data.mode = body.mode;
        if (body.timeZone !== undefined) {
          if (!isTimeZone(body.timeZone)) fields.timeZone = "Not a time zone, for example Africa/Lagos.";
          else data.timeZone = body.timeZone;
        }
        if (body.bio !== undefined) {
          const bio = body.bio.trim();
          data.bio = bio === "" ? null : bio;
        }
        if (body.contact !== undefined) {
          const phone = readContact(body.contact, current.contact, fields);
          if (phone !== undefined) data.phone = phone;
        }
        if (body.space !== undefined) {
          const side: Side = body.space === "me" ? "person" : body.space;
          if (!this.sidesOf(current).includes(side)) fields.space = "You do not have that side.";
          else {
            data.space = body.space;
            data.lastSide = side;
          }
        }
        const newDates = body.dates !== undefined ? this.readDates(body.dates, fields) : [];
        if (Object.keys(fields).length) throw AppError.validation(fields);

        if (Object.keys(data).length) await tx.account.update({ where: { id: accountId }, data });
        if (body.handle !== undefined) await setHandle(tx, accountId, current.handle, body.handle);
        if (newDates.length) {
          await tx.dateRow.createMany({
            data: newDates.map((d) => ({ id: this.ids.id(), accountId, name: d.name, who: d.who, what: d.what, date: new Date(`${d.date}T00:00:00.000Z`) })),
          });
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw HANDLE_TAKEN();
      throw e;
    }
    return this.me(accountId);
  }

  async view(row: AccountRow): Promise<MeView> {
    const [dates, wishCount] = await Promise.all([
      this.prisma.dateRow.findMany({ where: { accountId: row.id }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
      this.prisma.wish.count({ where: { AND: [{ accountId: row.id }, SHOWN_TO_BUYER] } }),
    ]);
    const sides = this.sidesOf(row);
    return {
      businesses: await this.businessesOf(row),
      id: row.id,
      name: row.name,
      email: row.contact,
      contact: row.contact,
      phone: row.phone,
      bio: row.bio,
      handle: row.handle,
      business: row.business,
      mode: row.mode,
      timeZone: row.timeZone,
      sides,
      space: row.space,
      lastSide: row.lastSide,
      creator: sides.includes("creator"),
      erased: row.erasedAt !== null,
      joined: toWireInstant(row.createdAt),
      wishCount,
      picture: await this.pictureOf(row),
      dates: dates.map((d: DateRowRecord) => ({ id: d.id, name: d.name, who: d.who, what: d.what, date: d.date ? dateOnlyOf(d.date) : null })),
    };
  }

  /** HW2: the creator's profile picture as a signed read (the creator's own, so a picture still in screening reads too); null when there is none. */
  private async pictureOf(row: AccountRow): Promise<MeView["picture"]> {
    if (row.erasedAt) return null;
    const c = await this.prisma.creator.findUnique({ where: { accountId: row.id }, select: { img: true } });
    if (!c?.img || !/^[0-9a-f-]{36}$/i.test(c.img)) return null;
    const s = await this.signed.signedPhoto({ fileId: c.img }, { type: "owner", accountId: row.id }).catch(() => null);
    return s ? { fileId: s.read.fileId, url: s.read.url, expiresAt: s.read.expiresAt, ...(s.variants ? { variants: s.variants } : {}) } : null; // IM4
  }

  /** HR3: the owned business first, then each business the person's sign-in email is a login of (the login's state is the server's: invited, active or removed). */
  private async businessesOf(row: AccountRow): Promise<MeBusiness[]> {
    const own = await this.prisma.business.findMany({ where: { accountId: row.id }, select: { id: true, name: true, business: true }, orderBy: { id: "asc" } });
    const mine = own.map((b): MeBusiness => ({ id: b.id, name: b.name ?? b.business ?? "", role: "owner", state: "owner" }));
    if (!row.contact || row.erasedAt) return mine;
    const logins = await this.prisma.$queryRaw<{ id: string; name: string | null; business: string | null; status: string | null }[]>`
      SELECT b.id::text AS id, b.name, b.business, l.status
        FROM login l JOIN business b ON b.id = l."businessId"
       WHERE lower(trim(l.contact)) = lower(${row.contact}) AND b."accountId" <> ${row.id}::uuid AND coalesce(l.status, '') <> 'removed'
       ORDER BY l.id`;
    // HU5: a business the person was removed from is not listed
    return [...mine, ...logins.map((l): MeBusiness => ({ id: l.id, name: l.name ?? l.business ?? "", role: "login", state: l.status === "active" ? "active" : "invited" }))];
  }

  private sidesOf(row: AccountRow): Side[] {
    return sidesOf(row.sides);
  }

  private readDates(raw: unknown[], fields: ErrorFields): { name: string; who: string | null; what: string | null; date: string }[] {
    if (raw.length > DATES_PER_PATCH) {
      fields.dates = `Send at most ${DATES_PER_PATCH} dates at once.`;
      return [];
    }
    const out: { name: string; who: string | null; what: string | null; date: string }[] = [];
    raw.forEach((item, i) => {
      const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const text = (k: string): string | null | undefined => {
        const v = r[k];
        if (v === undefined || v === null) return null;
        if (typeof v !== "string" || v.trim().length > DATE_TEXT_MAX) {
          fields[`dates[${i}].${k}`] = `Must be text of ${DATE_TEXT_MAX} characters or fewer.`;
          return undefined;
        }
        return v.trim() || null;
      };
      const unknown = Object.keys(r).filter((k) => !["name", "who", "what", "date"].includes(k));
      for (const k of unknown) fields[`dates[${i}].${k}`] = "Not a known field.";
      const name = text("name");
      if (!name) fields[`dates[${i}].name`] ??= "Must be a name.";
      const date = typeof r.date === "string" ? normaliseDateOnly(r.date) : null;
      if (!date) fields[`dates[${i}].date`] = "Must be a date as YYYY-MM-DD.";
      const who = text("who");
      const what = text("what");
      if (name && date && who !== undefined && what !== undefined) out.push({ name, who, what, date });
    });
    return out;
  }
}
