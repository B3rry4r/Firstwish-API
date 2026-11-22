import { Injectable } from "@nestjs/common";
import type { Prisma, Shoot as ShootRow } from "@prisma/client";
import type { PostBusinessShootsBody, Shoot, ShootFilesAdded } from "../../contracts";
import { lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import { StoredFilesService } from "../stored-files/stored-files.service";
import { playingRevealNames } from "../stored-files/file-jobs";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { dotsOnly, fileName, idsOf, MAX_FILES_PER_ADD, plainName, SetName, UUID } from "./vault-shared";
import { VaultSpaceService } from "./vault-space.service";

const CLIENT_MAX = 60;
const TITLE_MAX = 40;

interface FileItem {
  id: string;
  name: string;
  size: number;
  url?: string;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * A business's Vault shoots (E-167 to E-172). A shoot is one business's: every read and write names the business in its
 * query condition, so another business's shoot is 404. Files are Vault files already uploaded and confirmed (E-182); adding them
 * to a shoot moves no bytes, and a shoot holds only their ids, so the Vault's used bytes are always the sum of the stored files.
 */
@Injectable()
export class ShootsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly space: VaultSpaceService,
    private readonly reads: SignedUrlsService,
    private readonly files: StoredFilesService,
  ) {}

  /** The shoot as the wire has it. `sign` also gives each file a signed address (a single shoot; a list stays light). */
  async wire(row: ShootRow, sign: boolean): Promise<Shoot> {
    const proofs = idsOf(row.proofs);
    const finals = idsOf(row.finals);
    const all = [...new Set([...idsOf(row.files), ...proofs, ...finals])];
    const found = all.length
      ? await this.db.storedFile.findMany({ where: { id: { in: all }, businessId: row.businessId, purpose: "vault_file" }, select: { id: true, bytes: true, contentType: true, status: true, shownName: true } })
      : [];
    const by = new Map(found.map((f) => [f.id, f]));
    const ownerId = sign && row.businessId ? (await this.db.business.findUnique({ where: { id: row.businessId }, select: { accountId: true } }))?.accountId : null;
    const item = async (id: string): Promise<FileItem | null> => {
      const f = by.get(id);
      if (!f) return null;
      const out: FileItem = { id, name: fileName(id, f.contentType, f.shownName), size: Number(f.bytes) };
      if (ownerId && f.status === "ready") out.url = (await this.reads.signedRead({ fileId: id }, { type: "vault", accountId: ownerId })).url;
      return out;
    };
    const list = async (ids: string[]): Promise<FileItem[]> => (await Promise.all(ids.map(item))).filter((x): x is FileItem => x !== null);
    const marks = await this.withPlays([this.revealOf(row.proofsReveal), this.revealOf(row.finalsReveal)]);
    const [proofsReveal, finalsReveal] = marks;
    const hearts = Array.isArray(row.hearts) ? row.hearts : [];
    const wishState = finalsReveal ? "finals" : proofsReveal ? (hearts.length ? "favourites" : "proofs") : "uploaded";
    const out: Record<string, unknown> = {
      id: row.id,
      client: row.client ?? "",
      title: row.title ?? "",
      date: row.date ? ymd(row.date) : "",
      createdAt: toWireInstant(row.createdAt),
      files: await list(all),
      proofs: await list(proofs),
      finals: await list(finals),
      hearts,
      set: row.set ?? null,
      shoot: row.shoot ?? "",
      wishState,
    };
    if (proofsReveal) out.proofsReveal = proofsReveal;
    if (finalsReveal) out.finalsReveal = finalsReveal;
    return out as unknown as Shoot;
  }

  /**
   * IB5 (UA-832): each reveal mark also says how often the client played it (count, first and last time: a play is one visit, nothing of the
   * viewer) and when the client wish was first opened (openedAt, left out until it was).
   */
  private async withPlays(marks: (Record<string, unknown> | null)[]): Promise<(Record<string, unknown> | null)[]> {
    const links = marks.map((m) => (typeof m?.link === "string" && UUID.test(m.link) ? m.link : null)).filter((x): x is string => x !== null);
    const wishes = marks.map((m) => (typeof m?.wish === "string" && UUID.test(m.wish) ? m.wish : null)).filter((x): x is string => x !== null);
    if (!links.length && !wishes.length) return marks;
    const plays = await this.db.$queryRaw<{ linkId: string; count: number; first: Date; last: Date }[]>`
      SELECT "linkId"::text AS "linkId", count(*)::int AS count, min(at) AS first, max(at) AS last FROM reveal_play WHERE "linkId" = ANY(${links}::uuid[]) GROUP BY "linkId"`;
    const opened = await this.db.$queryRaw<{ id: string; openedAt: Date | null }[]>`SELECT id::text AS id, "openedAt" FROM client_wish WHERE id = ANY(${wishes}::uuid[])`;
    return marks.map((m) => {
      if (!m) return m;
      const p = plays.find((x) => x.linkId === m.link);
      const o = opened.find((x) => x.id === m.wish)?.openedAt ?? null;
      return {
        ...m,
        plays: { count: p?.count ?? 0, first: p ? toWireInstant(p.first) : null, last: p ? toWireInstant(p.last) : null },
        ...(o ? { openedAt: toWireInstant(o) } : {}),
      };
    });
  }

  /** The reveal settings kept on the shoot: which wish, its number, when. Nothing secret is ever kept there. */
  private revealOf(v: unknown): Record<string, unknown> | null {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { wish, no, sentAt, link } = v as Record<string, unknown>;
    return { wish, no, sentAt, link };
  }

  async list(businessId: string, cursor: string | undefined, limit: number): Promise<Page<Shoot>> {
    let before = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      before = c.id;
    }
    const rows = await this.db.shoot.findMany({ where: { businessId, id: { lt: before } }, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: await Promise.all(page.items.map((r) => this.wire(r, false))), nextCursor: page.nextCursor };
  }

  async get(businessId: string, id: string): Promise<Shoot> {
    if (!UUID.test(id)) throw AppError.notFound();
    const row = await this.db.shoot.findFirst({ where: { id, businessId } });
    if (!row) throw AppError.notFound();
    return this.wire(row, true);
  }

  /**
   * IB3 (E-277): rename a shoot (its title and the client's name). The business and its live logins; another business's shoot is 404. A field left
   * out stays as it was; the shoot's files and reveals are not touched.
   */
  async rename(businessId: string, id: string, body: { title?: unknown; client?: unknown }): Promise<Shoot> {
    if (!UUID.test(id)) throw AppError.notFound();
    const fields: ErrorFields = {};
    const data: Prisma.ShootUpdateInput = {};
    if (body.title !== undefined) {
      const title = plainName(body.title);
      if (!title || dotsOnly(title) || title.length > TITLE_MAX) fields.title = `Must be the shoot's name, 1 to ${TITLE_MAX} characters.`;
      else data.title = title;
    }
    if (body.client !== undefined) {
      const client = plainName(body.client);
      if (!client || dotsOnly(client) || client.length > CLIENT_MAX) fields.client = `Must be the client's name, 1 to ${CLIENT_MAX} characters.`;
      else data.client = client;
    }
    if (body.title === undefined && body.client === undefined) fields.title = "Say the new title or client.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const row = await this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const found = await tx.shoot.findFirst({ where: { id, businessId }, select: { id: true } });
      if (!found) throw AppError.notFound();
      return tx.shoot.update({ where: { id }, data });
    });
    return this.wire(row, true);
  }

  async create(businessId: string, body: PostBusinessShootsBody): Promise<Shoot> {
    const fields: ErrorFields = {};
    const client = plainName(String(body.client ?? ""));
    if (!client || dotsOnly(client) || client.length > CLIENT_MAX) fields.client = `Must be the client's name, 1 to ${CLIENT_MAX} characters.`;
    const title = plainName(String(body.title ?? "")) || "Shoot";
    if (dotsOnly(title)) fields.title = "Use a name with letters or numbers, not dots alone.";
    else if (title.length > TITLE_MAX) fields.title = `Up to ${TITLE_MAX} characters.`;
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const id = this.ids.id();
    const row = await this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      return tx.shoot.create({
        data: {
          id, businessId, client, title, date: new Date(`${body.date}T00:00:00Z`), createdAt: this.clock.now(), shoot: `shoot-${id.slice(-8)}`,
          files: [], proofs: [], finals: [], hearts: [],
        },
      });
    });
    return this.wire(row, false);
  }

  /**
   * E-169: the shoot and its files go; its space is given back. Its reveal links are switched off in the same transaction (a link whose
   * photos are gone plays nothing). The files are removed after the commit, one by one (storage is never called inside a transaction, Y4).
   */
  async remove(businessId: string, id: string): Promise<void> {
    if (!UUID.test(id)) throw AppError.notFound();
    const done = await this.db.$transaction(async (tx) => {
      const owner = await lockBusinessOwner(tx, businessId);
      const rows = await tx.$queryRaw<ShootRow[]>`SELECT * FROM shoot WHERE id = ${id}::uuid AND "businessId" = ${businessId}::uuid FOR UPDATE`;
      const row = rows[0];
      if (!row) throw AppError.notFound();
      await this.space.notePeak(tx, businessId, await this.space.usedBytes(tx, businessId), this.clock.now());
      await tx.$executeRaw`UPDATE reveal_access SET "offAt" = COALESCE("offAt", ${this.clock.now()}) WHERE "shootId" = ${id}::uuid`;
      await tx.shoot.delete({ where: { id } });
      const ids = [...new Set([...idsOf(row.files), ...idsOf(row.proofs), ...idsOf(row.finals)])];
      return { ids, accountId: owner.id };
    });
    // A file that another of the business's shoots still holds stays; the rest are removed and their bytes come off the count.
    const kept = new Set<string>();
    if (done.ids.length) {
      const others = await this.db.shoot.findMany({ where: { businessId }, select: { files: true, proofs: true, finals: true } });
      for (const o of others) for (const f of [...idsOf(o.files), ...idsOf(o.proofs), ...idsOf(o.finals)]) kept.add(f);
    }
    for (const fid of done.ids) {
      if (kept.has(fid)) continue;
      if (await playingRevealNames(this.db, fid, this.clock.now())) continue; // HC1: a reveal that still plays shows it
      // a file a login uploaded is held under that login's account: it goes under its own owner
      const owner = (await this.db.storedFile.findUnique({ where: { id: fid }, select: { ownerAccountId: true } }))?.ownerAccountId ?? done.accountId;
      try {
        await this.files.remove({ kind: "user", accountId: owner, sides: ["person", "business"] }, fid, {});
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // a file already gone (404) or still used (409) is left; the shoot is gone either way
      }
    }
  }

  /** E-171 (proofs) and E-172 (finals): adds Vault files the business already uploaded to the shoot's set. */
  async add(businessId: string, id: string, set: SetName, body: { files: unknown; shoot: unknown }): Promise<ShootFilesAdded> {
    if (!UUID.test(id)) throw AppError.notFound();
    const fields: ErrorFields = {};
    if (body.shoot !== id) fields.shoot = "Must be the id in the path.";
    const named = Array.isArray(body.files) ? body.files : null;
    if (!named || named.length === 0 || named.length > MAX_FILES_PER_ADD || !named.every((f) => typeof f === "string" && UUID.test(f))) {
      fields.files = `Must be 1 to ${MAX_FILES_PER_ADD} ids of files you uploaded to the Vault.`;
    }
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const want = [...new Set((named as string[]).map((f) => f.toLowerCase()))];
    const out = await this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const rows = await tx.$queryRaw<ShootRow[]>`SELECT * FROM shoot WHERE id = ${id}::uuid AND "businessId" = ${businessId}::uuid FOR UPDATE`;
      const row = rows[0];
      if (!row) throw AppError.notFound();
      await this.space.needRoom(tx, businessId);
      const found = await tx.storedFile.findMany({
        where: { id: { in: want }, businessId, purpose: "vault_file", status: { in: ["ready", "screening"] } },
        select: { id: true, contentType: true },
      });
      if (found.length !== want.length) throw AppError.validation({ files: "Some of these are not files you uploaded to the Vault." });
      const have = new Set(idsOf(row[set]));
      const fresh = want.filter((f) => !have.has(f));
      const all = new Set(idsOf(row.files));
      for (const f of fresh) all.add(f);
      const data: Prisma.ShootUpdateInput = { files: [...all], [set]: [...have, ...fresh] };
      const updated = await tx.shoot.update({ where: { id }, data });
      const fresher = new Set(fresh);
      return { row: updated, added: fresh.length, previews: found.filter((f) => fresher.has(f.id) && f.contentType.startsWith("image/")).length };
    });
    return { shoot: await this.wire(out.row, true), added: out.added, previews: out.previews };
  }
}
