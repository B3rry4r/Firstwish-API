import { Injectable } from "@nestjs/common";
import { DateRow as DateRecord, Person as PersonRecord, Prisma } from "@prisma/client";
import type { DateRow, PostMeDatesBody } from "../../contracts";
import { lockAccount } from "../../common/db/account-lock";
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

/**
 * A person's remembered dates (E-45..E-48). A date is a calendar date: stored as DATE, answered as the same YYYY-MM-DD.
 * The list answers each with the days to its next occurrence and the years it will mark (worked out from the clock port in the
 * home zone), and count, the number of dates the account keeps. Every read and write names the owner in the query.
 *
 * One row per person and day: the same name, occasion and date sent again answers the row already kept (200, not a second row).
 * A POST naming the id of one of the caller's rows changes that row (the app's undo re-adds a removed row by its id).
 * An id another account already uses is a 404 (BB7: it never tells a caller that the id exists). Every write takes the account
 * lock first (AA1). A client id must be a UUIDv7.
 */
@Injectable()
export class DatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * BB7: the page is cut in the database. Rows are ordered by the days to their next occurrence, counted from an anchor day (the
   * Lagos day of the first page, carried in the cursor as `anchor|days`), then by id. A paging run that crosses midnight keeps
   * the anchor, so it neither repeats nor skips a row. A business's people join as birthday and anniversary rows.
   */
  async list(accountId: string, businessId: string | null, cursor: string | undefined, limit: number): Promise<Page<DateRow>> {
    let anchor = todayIn(this.clock.now());
    let after: { days: number; id: string } | null = null;
    if (cursor) {
      const c = decodeCursor(cursor);
      const m = typeof c.key === "string" ? /^(\d{4}-\d{2}-\d{2})\|(-?\d{1,6})$/.exec(c.key) : null;
      if (!m || normaliseDateOnly(m[1]) !== m[1]) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      anchor = m[1];
      after = { days: Number(m[2]), id: c.id };
    }
    const people = businessId
      ? Prisma.sql`UNION ALL SELECT 'b', p.id::text, p.birthday FROM person p WHERE p."businessId" = ${businessId}::uuid AND p.birthday IS NOT NULL
                   UNION ALL SELECT 's', p.id::text, p.start FROM person p WHERE p."businessId" = ${businessId}::uuid AND p.start IS NOT NULL`
      : Prisma.empty;
    const past = after ? Prisma.sql`AND (days, rid COLLATE "C") > (${after.days}::int, ${after.id}::text COLLATE "C")` : Prisma.empty;
    const found = await this.prisma.$queryRaw<{ rid: string; kind: string; ref: string }[]>`
      WITH src(kind, ref, d) AS (
        SELECT 'd', r.id::text, r.date FROM date_row r WHERE r."accountId" = ${accountId}::uuid AND r.date IS NOT NULL
        ${people}
      ),
      occ AS (
        SELECT s.kind, s.ref, s.d, ${anchor}::date AS today,
               make_date(y.ty, m.m, least(m.d, extract(day FROM (make_date(y.ty, m.m, 1) + interval '1 month - 1 day'))::int)) AS this_year,
               make_date(y.ty + 1, m.m, least(m.d, extract(day FROM (make_date(y.ty + 1, m.m, 1) + interval '1 month - 1 day'))::int)) AS next_year
          FROM src s
         CROSS JOIN LATERAL (SELECT extract(year FROM ${anchor}::date)::int AS ty) y
         CROSS JOIN LATERAL (SELECT extract(month FROM s.d)::int AS m, extract(day FROM s.d)::int AS d) m
      ),
      nxt AS (
        SELECT kind, ref, d, today,
               CASE WHEN d >= today THEN d WHEN this_year >= today THEN this_year ELSE next_year END AS n
          FROM occ
      ),
      keyed AS (
        SELECT kind, ref, (n - today) AS days,
               CASE kind WHEN 'd' THEN ref ELSE ref || ':' || kind || ':' || to_char(n, 'YYYY') END AS rid,
               extract(year FROM n)::int - extract(year FROM d)::int AS years
          FROM nxt
      )
      SELECT rid, kind, ref FROM keyed
       WHERE (kind <> 's' OR years >= 1) ${past}
       ORDER BY days, rid COLLATE "C"
       LIMIT ${limit + 1}`;
    const ownIds = found.filter((f) => f.kind === "d").map((f) => f.ref);
    const personIds = [...new Set(found.filter((f) => f.kind !== "d").map((f) => f.ref))];
    const [own, folks, count] = await Promise.all([
      ownIds.length ? this.prisma.dateRow.findMany({ where: { id: { in: ownIds }, accountId } }) : [],
      personIds.length && businessId ? this.prisma.person.findMany({ where: { id: { in: personIds }, businessId } }) : [],
      this.prisma.dateRow.count({ where: { accountId, date: { not: null } } }),
    ]);
    const byOwn = new Map(own.map((r) => [r.id, r]));
    const byPerson = new Map(folks.map((r) => [r.id, r]));
    const rows: DateRow[] = [];
    for (const f of found) {
      if (f.kind === "d") {
        const r = byOwn.get(f.ref);
        if (r) rows.push(this.view(r, anchor, count));
      } else {
        const p = byPerson.get(f.ref);
        const row = p ? this.personRow(p, f.kind === "b" ? "b" : "s", anchor, count) : null;
        if (row) rows.push(row);
      }
    }
    return toPage(rows, limit, (r) => ({ key: `${anchor}|${r.days}`, id: r.id }));
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
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw AppError.notFound();
      throw e;
    }
  }

  private writeOnce(accountId: string, id: string | null, input: DateInput): Promise<{ row: DateRecord; created: boolean }> {
    const body = { id };
    return this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const same = await this.sameDay(tx, accountId, input, body.id);
      if (body.id) {
        const mine = await tx.dateRow.findFirst({ where: { id: body.id, accountId } });
        if (mine) {
          if (same) throw AppError.conflict("date_exists", "You already keep that date for them.");
          const row = await tx.dateRow.update({ where: { id: mine.id }, data: this.data(input) });
          return { row, created: false };
        }
        const elsewhere = await tx.dateRow.count({ where: { id: body.id } });
        if (elsewhere) throw AppError.notFound();
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
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const done = await tx.dateRow.deleteMany({ where: { id, accountId } });
      if (done.count === 0) throw AppError.notFound();
    });
  }

  private view(r: DateRecord, today: string, count: number): DateRow {
    const date = dateOnlyOf(r.date as Date);
    const next = nextOccurrence(date, today);
    const name = r.name ?? "";
    return { id: r.id, key: "", name, who: r.who ?? "", what: r.what ?? "", date, days: next.days, years: next.years, count, for: name, person: null };
  }

  /** A person's birthday ("b") or work anniversary ("s", from the first full year on), keyed as approvals are (`${id}:b|s:${year}`). */
  private personRow(p: PersonRecord, tag: "b" | "s", today: string, count: number): DateRow | null {
    const d = tag === "b" ? p.birthday : p.start;
    if (!d) return null;
    const name = p.name ?? "";
    const person = { id: p.id, name, team: p.team ?? "" };
    const date = dateOnlyOf(d);
    const next = nextOccurrence(date, today);
    if (tag === "s" && next.years < 1) return null;
    const key = `${p.id}:${tag}:${next.on.slice(0, 4)}`;
    return { id: key, key, name, who: p.team ?? "", what: tag === "b" ? "Staff birthday" : "Work anniversary", date, days: next.days, years: next.years, count, for: name, person };
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
