import { Injectable } from "@nestjs/common";
import { Person as PersonRecord, Prisma } from "@prisma/client";
import type { ApprovedDate, Person, PostBusinessPeopleBody } from "../../contracts";
import { lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { normalisePhone } from "../../common/normalise/phone";
import { dateOnlyOf, normaliseDateOnly } from "../../common/time/time";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";

export const PERSON_TEXT_MAX = 80;
/** Default (lead), owner may override: one import adds at most 500 people; a business keeps at most 5,000. */
export const IMPORT_MAX = 500;
export const PEOPLE_MAX = 5000;

interface PersonInput {
  name: string;
  phone: string | null;
  team: string | null;
  birthday: string | null;
  start: string | null;
}

/** E-121's answer. */
export interface ImportAnswer {
  added: number;
  skipped: { row: number; reason: string; field?: string }[];
  /** HR5: one entry for every row sent, in order: accepted, or refused with the field and the words (a person twice is reported as a duplicate) */
  rows: { row: number; state: "accepted" | "refused" | "duplicate"; field?: string; reason?: string }[];
}

const asDate = (d: string | null): Date | null => (d ? new Date(`${d}T00:00:00.000Z`) : null);

/**
 * A business's people (E-117..E-121) and the dates it has approved for them (E-17). Every read and write is scoped to the
 * caller's business in the query itself: another business's row is not found (404). Removing a person removes their dates with
 * them: their birthday and start live on the person row, and the approvals keyed by their id are deleted in the same transaction.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  view(r: PersonRecord): Person {
    return {
      id: r.id,
      name: r.name ?? "",
      phone: r.phone ?? "",
      team: r.team ?? "",
      birthday: r.birthday ? dateOnlyOf(r.birthday) : "",
      start: r.start ? dateOnlyOf(r.start) : "",
      rows: [],
    };
  }

  async list(businessId: string, cursor: string | undefined, limit: number): Promise<Page<Person>> {
    const where: Prisma.PersonWhereInput = { businessId };
    if (cursor) {
      const c = decodeCursor(cursor);
      if (typeof c.key !== "string" || !isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.OR = [{ name: { gt: c.key } }, { name: c.key, id: { gt: c.id } }];
    }
    const rows = await this.prisma.person.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.name ?? "", id: r.id }));
    return { items: page.items.map((r) => this.view(r)), nextCursor: page.nextCursor };
  }

  async create(businessId: string, body: PostBusinessPeopleBody): Promise<Person> {
    const input = this.read(body);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      await this.lock(tx, businessId);
      await this.roomFor(tx, businessId, 1);
      return tx.person.create({ data: { id: this.ids.id(), businessId, ...this.data(input) } });
    });
    return this.view(row);
  }

  async update(businessId: string, id: string, body: PostBusinessPeopleBody): Promise<Person> {
    if (!isUuidV7(id)) throw AppError.notFound();
    const input = this.read(body);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const done = await tx.person.updateMany({ where: { id, businessId }, data: this.data(input) });
      if (done.count === 0) throw AppError.notFound();
      return tx.person.findFirstOrThrow({ where: { id, businessId } });
    });
    return this.view(row);
  }

  async remove(businessId: string, id: string): Promise<void> {
    if (!isUuidV7(id)) throw AppError.notFound();
    await this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const done = await tx.person.deleteMany({ where: { id, businessId } });
      if (done.count === 0) throw AppError.notFound();
      await tx.$executeRaw`DELETE FROM approved_date WHERE split_part(key, ':', 1) = ${id}`;
    });
  }

  /**
   * E-121: adds the readable rows and answers { added, skipped: [{ row, reason }] }; `row` counts the rows sent from 1. A row needs a
   * name and at least one readable date (birthday or start); the others are skipped, each with its reason, as the app's paste rule
   * says. A row the business already has (same name, birthday and start), or sent twice, is skipped. All good rows go in one
   * transaction.
   */
  async import(businessId: string, raw: unknown): Promise<ImportAnswer> {
    if (!Array.isArray(raw)) throw AppError.validation({ rows: "Must be a list of people." });
    if (raw.length > IMPORT_MAX) throw AppError.validation({ rows: `Send at most ${IMPORT_MAX} people at once.` });
    const skipped: ImportAnswer["skipped"] = [];
    const duplicates = new Set<number>();
    const inputs: { row: number; input: PersonInput }[] = [];
    raw.forEach((item, i) => {
      const row = i + 1;
      if (!item || typeof item !== "object") return void skipped.push({ row, reason: "Not a person.", field: "row" });
      const r = item as Record<string, unknown>;
      const text = (k: string) => (typeof r[k] === "string" ? r[k].trim().slice(0, PERSON_TEXT_MAX) : "");
      const name = text("name");
      const birthday = normaliseDateOnly(text("birthday"));
      const start = normaliseDateOnly(text("start"));
      if (!name) return void skipped.push({ row, reason: "Needs a name.", field: "name" });
      if (!birthday && !start) return void skipped.push({ row, reason: "Needs a birthday or start date we can read.", field: text("birthday") || !text("start") ? "birthday" : "start" });
      // HR5: a phone that is not one is refused, not stored blank
      const phone = text("phone") ? normalisePhone(text("phone")) : null;
      if (text("phone") && !phone) return void skipped.push({ row, reason: "That is not a phone number we can use. Write it with its country code, or leave it empty.", field: "phone" });
      inputs.push({ row, input: { name, phone, team: text("team") || null, birthday, start } });
    });
    if (!inputs.length) return { added: 0, skipped, rows: this.rowsOf(raw.length, skipped, duplicates) };
    const added = await this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      await this.lock(tx, businessId);
      const have = await tx.person.findMany({ where: { businessId }, select: { name: true, birthday: true, start: true } });
      const sig = (n: string, b: string | null, s: string | null) => `${n.toLowerCase()}|${b ?? ""}|${s ?? ""}`;
      const seen = new Set(have.map((h) => sig(h.name ?? "", h.birthday ? dateOnlyOf(h.birthday) : null, h.start ? dateOnlyOf(h.start) : null)));
      const fresh = inputs.filter(({ row, input: i }) => {
        const k = sig(i.name, i.birthday, i.start);
        if (seen.has(k)) {
          duplicates.add(row);
          skipped.push({ row, reason: have.some((h) => sig(h.name ?? "", h.birthday ? dateOnlyOf(h.birthday) : null, h.start ? dateOnlyOf(h.start) : null) === k) ? "Already on your list." : "The same person is in this file twice.", field: "name" });
          return false;
        }
        seen.add(k);
        return true;
      });
      if (!fresh.length) return 0;
      await this.roomFor(tx, businessId, fresh.length);
      const made = await tx.person.createMany({ data: fresh.map(({ input: i }) => ({ id: this.ids.id(), businessId, ...this.data(i) })) });
      return made.count;
    });
    skipped.sort((a, b) => a.row - b.row);
    return { added, skipped, rows: this.rowsOf(raw.length, skipped, duplicates) };
  }

  /** HR5: the per-row answer: every row sent is accepted, refused (with its field and words) or a duplicate. */
  private rowsOf(count: number, skipped: ImportAnswer["skipped"], duplicates: Set<number>): ImportAnswer["rows"] {
    const by = new Map(skipped.map((s) => [s.row, s]));
    return Array.from({ length: count }, (_, i) => {
      const row = i + 1;
      const s = by.get(row);
      if (!s) return { row, state: "accepted" as const };
      return { row, state: duplicates.has(row) ? ("duplicate" as const) : ("refused" as const), ...(s.field ? { field: s.field } : {}), reason: s.reason };
    });
  }

  /** E-17: the dates this business has approved; an approval's key names one of its people (`${personId}:b|s:${year}`). */
  async approved(businessId: string, cursor: string | undefined, limit: number): Promise<Page<ApprovedDate>> {
    let after = "00000000-0000-0000-0000-000000000000";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = c.id;
    }
    const rows = await this.prisma.$queryRaw<{ id: string; key: string }[]>`
      SELECT a.id::text AS id, a.key
        FROM approved_date a JOIN person p ON p.id::text = split_part(a.key, ':', 1)
       WHERE p."businessId" = ${businessId}::uuid AND a.id > ${after}::uuid
       ORDER BY a.id
       LIMIT ${limit + 1}`;
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map((r) => ({ key: r.key })), nextCursor: page.nextCursor };
  }

  /** The person the body names, one of this business's own: another business's person, and an id that is no uuid, are 404. */
  private async ownPerson(tx: Prisma.TransactionClient, businessId: string, personId: string): Promise<PersonRecord> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personId)) throw AppError.notFound();
    const person = await tx.person.findFirst({ where: { id: personId.toLowerCase(), businessId } });
    if (!person) throw AppError.notFound();
    return person;
  }

  private approvalYear(year: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw AppError.validation({ year: "Must be a year from 2000 to 2100." });
  }

  /**
   * E-239 (DEC-168): approves one date of one of this business's people. It writes the approval row only; the wish for the date is
   * made by E-32 (the one place a client wish is made and drawn, keyed by this same key), so approving here never draws. The same
   * body twice answers the same row (created: false the second time).
   */
  async approve(businessId: string, body: { personId: string; kind: "b" | "s"; year: number }): Promise<{ row: ApprovedDate; created: boolean }> {
    this.approvalYear(body.year);
    return this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const person = await this.ownPerson(tx, businessId, body.personId);
      if (!(body.kind === "b" ? person.birthday : person.start)) {
        throw AppError.validation({ kind: body.kind === "b" ? "This person has no birthday to approve." : "This person has no start date to approve." });
      }
      const key = `${person.id}:${body.kind}:${body.year}`;
      const made = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO approved_date (id, "businessId", key) VALUES (${this.ids.id()}::uuid, ${businessId}::uuid, ${key})
        ON CONFLICT ("businessId", key) DO NOTHING RETURNING id::text AS id`;
      return { row: { key }, created: made.length > 0 };
    });
  }

  /** E-238 (DEC-168): takes the approval back. A date that was never approved is the same 204. A wish already made for it stays. */
  async takeBack(businessId: string, body: { personId: string; kind: "b" | "s"; year: number }): Promise<void> {
    this.approvalYear(body.year);
    await this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const person = await this.ownPerson(tx, businessId, body.personId);
      await tx.$executeRaw`DELETE FROM approved_date WHERE "businessId" = ${businessId}::uuid AND key = ${`${person.id}:${body.kind}:${body.year}`}`;
    });
  }

  private read(body: PostBusinessPeopleBody): PersonInput {
    const fields: ErrorFields = {};
    const text = (k: "name" | "team", v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      if (t.length > PERSON_TEXT_MAX) fields[k] = `Must be ${PERSON_TEXT_MAX} characters or fewer.`;
      return t || null;
    };
    const name = text("name", body.name);
    if (!name) fields.name ??= "Must be a name.";
    const team = text("team", body.team);
    const birthday = body.birthday ? normaliseDateOnly(body.birthday) : null;
    const start = body.start ? normaliseDateOnly(body.start) : null;
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { name: name as string, phone: body.phone ? normalisePhone(body.phone) : null, team, birthday, start };
  }

  private data(i: PersonInput) {
    return { name: i.name, phone: i.phone, team: i.team, birthday: asDate(i.birthday), start: asDate(i.start) };
  }

  /** One writer per business at a time, so the count below cannot be raced. */
  private async lock(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"person:" + businessId}, 0))::text AS locked`;
  }

  private async roomFor(tx: Prisma.TransactionClient, businessId: string, n: number): Promise<void> {
    const have = await tx.person.count({ where: { businessId } });
    if (have + n > PEOPLE_MAX) throw AppError.conflict("people_full", `A business keeps at most ${PEOPLE_MAX} people.`);
  }
}
