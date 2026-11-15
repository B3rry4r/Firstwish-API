import { Injectable } from "@nestjs/common";
import { DateRow as DateRecord, Person as PersonRecord, Prisma } from "@prisma/client";
import type { DateRow, PostMeDatesBody } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { dateOnlyOf, normaliseDateOnly } from "../../common/time/time";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { nextOccurrence, todayIn } from "./calendar";

export const DATE_TEXT_MAX = 80;
/** Default (lead), owner may override: an account keeps at most 1,000 dates; dates before 1900 are refused. */
export const DATES_MAX = 1000;
const EARLIEST = "1900-01-01";

interface DateInput {
  name: string;
  who: string;
  what: string;
  date: string;
}

/** A person of the caller's business, as a coming date (pro-people's Coming). */
export interface PeopleSource {
  withDates(businessId: string): Promise<PersonRecord[]>;
}

/**
 * A person's remembered dates (E-45..E-48). A date is a calendar date: stored as DATE, answered as the same YYYY-MM-DD.
 * The list answers each with the days to its next occurrence and the years it will mark (worked out from the clock port in the
 * home zone), and count, the number of dates the account keeps. Every read and write names the owner in the query.
 *
 * One row per person and day: the same name, occasion and date sent again answers the row already kept (200, not a second row).
 * A POST naming the id of one of the caller's rows changes that row (the app's undo re-adds a removed row by its id).
 * An id another account already uses is a 409. A client id must be a UUIDv7.
 */
@Injectable()
export class DatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async list(accountId: string, businessId: string | null, people: PeopleSource, cursor: string | undefined, limit: number): Promise<Page<DateRow>> {
    let after: { days: number; id: string } | null = null;
    if (cursor) {
      const c = decodeCursor(cursor);
      if (typeof c.key !== "number") throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = { days: c.key, id: c.id };
    }
    const today = todayIn(this.clock.now());
    const own = await this.prisma.dateRow.findMany({ where: { accountId, date: { not: null } } });
    const count = own.length;
    const rows: DateRow[] = own.map((r) => this.view(r, today, count));
    if (businessId) for (const p of await people.withDates(businessId)) rows.push(...this.personRows(p, today, count));
    rows.sort((a, b) => a.days - b.days || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rest = after ? rows.filter((r) => r.days > after.days || (r.days === after.days && r.id > after.id)) : rows;
    return toPage(rest.slice(0, limit + 1), limit, (r) => ({ key: r.days, id: r.id }));
  }

  async one(accountId: string, id: string): Promise<DateRow> {
    if (!isUuidV7(id)) throw AppError.notFound();
    const row = await this.prisma.dateRow.findFirst({ where: { id, accountId } });
    if (!row || !row.date) throw AppError.notFound();
    return this.view(row, todayIn(this.clock.now()), await this.prisma.dateRow.count({ where: { accountId, date: { not: null } } }));
  }

  /** Adds a date, or changes the caller's own row when its id is given. Answers the row and whether it was made now. */
  async save(accountId: string, body: PostMeDatesBody): Promise<{ row: DateRow; created: boolean }> {
    const input = this.read(body);
    const out = await this.write(accountId, body.id ?? null, input);
    const count = await this.prisma.dateRow.count({ where: { accountId, date: { not: null } } });
    return { row: this.view(out.row, todayIn(this.clock.now()), count), created: out.created };
  }

  private async write(accountId: string, id: string | null, input: DateInput): Promise<{ row: DateRecord; created: boolean }> {
    try {
      return await this.writeOnce(accountId, id, input);
    } catch (e) {
      // Two accounts sending the same new id at once: the loser sees the primary key taken.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw AppError.conflict("id_taken", "That id is in use. Send a new one.");
      throw e;
    }
  }

  private writeOnce(accountId: string, id: string | null, input: DateInput): Promise<{ row: DateRecord; created: boolean }> {
    const body = { id };
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"date_row:" + accountId}, 0))::text AS locked`;
      const same = await this.sameDay(tx, accountId, input, body.id);
      if (body.id) {
        const mine = await tx.dateRow.findFirst({ where: { id: body.id, accountId } });
        if (mine) {
          if (same) throw AppError.conflict("date_exists", "You already keep that date for them.");
          const row = await tx.dateRow.update({ where: { id: mine.id }, data: this.data(input) });
          return { row, created: false };
        }
        const elsewhere = await tx.dateRow.count({ where: { id: body.id } });
        if (elsewhere) throw AppError.conflict("id_taken", "That id is in use. Send a new one.");
      }
      if (same) return { row: same, created: false };
      const have = await tx.dateRow.count({ where: { accountId } });
      if (have >= DATES_MAX) throw AppError.conflict("dates_full", `You can keep at most ${DATES_MAX} dates.`);
      const row = await tx.dateRow.create({ data: { id: body.id ?? this.ids.id(), accountId, ...this.data(input) } });
      return { row, created: true };
    });
  }

  async remove(accountId: string, id: string): Promise<void> {
    if (!isUuidV7(id)) throw AppError.notFound();
    const done = await this.prisma.dateRow.deleteMany({ where: { id, accountId } });
    if (done.count === 0) throw AppError.notFound();
  }

  private view(r: DateRecord, today: string, count: number): DateRow {
    const date = dateOnlyOf(r.date as Date);
    const next = nextOccurrence(date, today);
    const name = r.name ?? "";
    return { id: r.id, key: "", name, who: r.who ?? "", what: r.what ?? "", date, days: next.days, years: next.years, count, for: name, person: null };
  }

  /** A person's birthday, and their work anniversary from the first full year on, keyed as approvals are (`${id}:b|s:${year}`). */
  private personRows(p: PersonRecord, today: string, count: number): DateRow[] {
    const out: DateRow[] = [];
    const name = p.name ?? "";
    const person = { id: p.id, name, team: p.team ?? "" };
    const add = (d: Date | null, tag: "b" | "s", what: string) => {
      if (!d) return;
      const date = dateOnlyOf(d);
      const next = nextOccurrence(date, today);
      if (tag === "s" && next.years < 1) return;
      const key = `${p.id}:${tag}:${next.on.slice(0, 4)}`;
      out.push({ id: key, key, name, who: p.team ?? "", what, date, days: next.days, years: next.years, count, for: name, person });
    };
    add(p.birthday, "b", "Staff birthday");
    add(p.start, "s", "Work anniversary");
    return out;
  }

  private read(body: PostMeDatesBody): DateInput {
    const fields: ErrorFields = {};
    const text = (k: "name" | "who" | "what"): string => {
      const v = typeof body[k] === "string" ? body[k].trim() : "";
      if (v.length > DATE_TEXT_MAX) fields[k] = `Must be ${DATE_TEXT_MAX} characters or fewer.`;
      return v;
    };
    const name = text("name");
    if (!name) fields.name ??= "Must be a name.";
    const who = text("who");
    const what = text("what");
    if (!what) fields.what ??= "Must say the occasion.";
    const date = normaliseDateOnly(body.date);
    if (!date) fields.date = "Must be a date as YYYY-MM-DD.";
    else if (date < EARLIEST) fields.date = "Must be 1900 or later.";
    if (body.id !== undefined && !isUuidV7(body.id)) fields.id = "Must be a UUIDv7 made on the device, or left out.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { name, who, what, date: date as string };
  }

  private data(i: DateInput) {
    return { name: i.name, who: i.who, what: i.what, date: new Date(`${i.date}T00:00:00.000Z`) };
  }

  /** The caller's row for the same person, occasion and day (names and occasions compared without case), other than `except`. */
  private async sameDay(tx: Prisma.TransactionClient, accountId: string, i: DateInput, except: string | null): Promise<DateRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM date_row
       WHERE "accountId" = ${accountId}::uuid AND date = ${i.date}::date
         AND lower(coalesce(name, '')) = lower(${i.name}) AND lower(coalesce(what, '')) = lower(${i.what})
         AND (${except}::text IS NULL OR id::text <> ${except}::text)
       ORDER BY id LIMIT 1`;
    return rows[0] ? tx.dateRow.findUnique({ where: { id: rows[0].id } }) : null;
  }
}
