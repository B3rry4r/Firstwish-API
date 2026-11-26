import { Injectable } from "@nestjs/common";
import type { RevealPlay } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import { LinkLimits, READS_PER_MINUTE, UNLOCKS_PER_HOUR } from "../public-wishes/link-limits";
import { UnlockTokens } from "../public-wishes/unlock-token";
import { verify } from "../public-wishes/public-wishes.service";
import { SignedUrlsService, type SizedRead } from "../stored-files/signed-urls.service";
import { fileName } from "./vault-shared";
import { heartPositions, idsOf, MAX_HEARTS, SetName, syncHearts } from "./vault-shared";

/** Who is asking: the address (from the trusted proxy setting; only a keyed hash of it is ever kept) and the unlock token. Nothing the page sends names a visitor (IC5). */
export interface Viewer {
  address: string | null;
  token?: string;
}

/** An open reveal: the photos (signed addresses), their positions in the link's file list, the positions the client marked, and for finals with downloads on one named download address for each photo. */
export type RevealView = ({ state: "open" } & RevealPlay & { business: string; hearts: number[]; downloads?: { name: string; url: string }[] }) | { state: "passcode" };

interface Row {
  linkId: string;
  businessId: string;
  shootId: string | null;
  wishId: string | null;
  hearts: string[];
  downloads: boolean;
  set: SetName;
  fileIds: unknown;
  passcodeHash: string | null;
  endsAt: Date | null;
  offAt: Date | null;
  wishNo: string | null;
  wishEndsAt: Date | null;
  sentAt: Date | null;
  reveal: unknown;
  ownerErased: boolean;
  business: string | null;
}

const CODE = /^[A-Za-z0-9_-]{22}$/;
/** IB1 (PROVISIONAL, owner may change): marks per link and address an hour. */
const FAVOURITES_PER_HOUR = 60;
const gone = (): AppError => new AppError(410, "gone", "This link is not available any more.");

/**
 * What the client's link shows. No sign-in, and nothing about the viewer is kept: a play is one row per visit holding a keyed hash.
 * A link already sent plays to its end whatever the business's plan does (a lapsed plan changes nothing here, case 6); it stops when
 * the business switches it off, when its end date has passed, or, for an erased owner, when the wish's term has ended (RR3, T-58).
 */
@Injectable()
export class RevealsPublicService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly limits: LinkLimits,
    private readonly tokens: UnlockTokens,
    private readonly reads: SignedUrlsService,
  ) {}

  /** The link's row when it may play now; 404 for a code that is no code, 410 for a link that has ended. */
  private async resolve(code: string): Promise<Row> {
    if (!CODE.test(code)) throw AppError.notFound();
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT a."linkId"::text AS "linkId", a."businessId"::text AS "businessId", a."shootId"::text AS "shootId", a."wishId"::text AS "wishId", a.hearts, a.downloads, a."set", a."fileIds", a."passcodeHash", a."endsAt", a."offAt",
             w.no AS "wishNo", COALESCE(w."endsAt", ww."endsAt", a."endsAt") AS "wishEndsAt", w."sentAt", w.reveal,
             (o."erasedAt" IS NOT NULL) AS "ownerErased", b.business
        FROM reveal_access a
        JOIN business b ON b.id = a."businessId"
        LEFT JOIN account o ON o.id = b."accountId"
        LEFT JOIN client_wish w ON w.id = a."wishId"
        LEFT JOIN wish ww ON ww.id = w."wishId"
       WHERE a.code = ${code}`;
    const r = rows[0];
    if (!r) throw AppError.notFound();
    const now = this.clock.now();
    if (r.offAt) throw gone();
    if (r.endsAt && r.endsAt.getTime() <= now.getTime()) throw gone();
    if (r.ownerErased && !(r.wishEndsAt && r.wishEndsAt.getTime() > now.getTime())) throw gone();
    return r;
  }

  /** GET: the reveal, or the passcode step. An open reveal records its play (once for each visit). */
  async view(code: string, v: Viewer): Promise<RevealView> {
    await this.limits.take("read", this.limits.keyOf(v.address), READS_PER_MINUTE, 60);
    const r = await this.resolve(code);
    if (r.passcodeHash && !this.tokens.valid(v.token, r.linkId, r.passcodeHash)) return { state: "passcode" };
    const photos: string[] = [];
    const photoVariants: (SizedRead[] | null)[] = [];
    const index: number[] = [];
    const downloads: { name: string; url: string }[] = [];
    // IB2: a download address for each FINAL file when the business left downloads on; a proof never has one
    const giveDownloads = r.set === "finals" && r.downloads;
    const ids = idsOf(r.fileIds);
    const found = giveDownloads ? await this.db.storedFile.findMany({ where: { id: { in: ids } }, select: { id: true, contentType: true, shownName: true } }) : [];
    const meta = new Map(found.map((f) => [f.id, f]));
    for (const [pos, id] of ids.entries()) {
      try {
        const one = await this.reads.signedPhoto({ fileId: id }, { type: "allowed" });
        photos.push(one.read.url);
        photoVariants.push(one.variants ?? null); // IM4: the sizes of each photo, in the order of `photos` (null where a file is not a picture)
        index.push(pos);
        if (giveDownloads) {
          const f = meta.get(id);
          downloads.push({ name: fileName(id, f?.contentType ?? "", f?.shownName), url: (await this.reads.signedRead({ fileId: id }, { type: "allowed" })).url });
        }
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // a file that was removed is left out
      }
    }
    await this.play(r, code, v);
    const words = r.reveal && typeof r.reveal === "object" && !Array.isArray(r.reveal) ? { ...(r.reveal as Record<string, unknown>) } : {};
    delete words.link;
    return {
      state: "open",
      no: r.wishNo ?? "",
      style: typeof words.style === "string" ? words.style : "",
      date: toWireInstant(r.sentAt ?? this.clock.now()),
      photos,
      photoVariants,
      index,
      content: words,
      business: r.business ?? "",
      hearts: heartPositions(r.fileIds, r.hearts),
      ...(giveDownloads ? { downloads } : {}),
    };
  }

  /**
   * IB5: one row for each visit, and the client wish's first opening: the first play (after the passcode, where there is one) sets its
   * openedAt and a later play leaves it as it was.
   */
  /**
   * IC5: one play for each link and address in an hour, whatever the page sends: the visit is the link, the address and the clock's hour, as one
   * keyed hash. A header the client sets (it is free to make a new one for every request) never names a visit.
   */
  private async play(r: Row, code: string, v: Viewer): Promise<void> {
    const linkId = r.linkId;
    const now = this.clock.now();
    const visit = this.limits.keyOf("play", code, v.address, String(Math.floor(now.getTime() / 3_600_000)));
    await this.db.$executeRaw`
      INSERT INTO reveal_play (id, "linkId", visit, at) VALUES (${this.ids.id()}::uuid, ${linkId}::uuid, ${visit}, ${now})
      ON CONFLICT ("linkId", visit) DO NOTHING`;
    if (r.wishId) await this.db.$executeRaw`UPDATE client_wish SET "openedAt" = ${now} WHERE id = ${r.wishId}::uuid AND "openedAt" IS NULL`;
  }

  /** The link's row for a client past the passcode: the same refusals as a read (404, 410), and 403 with words while the passcode has not been given. */
  private async opened(code: string, v: Viewer): Promise<Row> {
    await this.limits.take("read", this.limits.keyOf(v.address), READS_PER_MINUTE, 60);
    const r = await this.resolve(code);
    if (r.passcodeHash && !this.tokens.valid(v.token, r.linkId, r.passcodeHash)) throw new AppError(403, "passcode_required", "Enter the passcode first.");
    return r;
  }

  /** IB1: the positions the client marked at this link (positions in the link's file list). */
  async favourites(code: string, v: Viewer): Promise<{ hearts: number[] }> {
    const r = await this.opened(code, v);
    return { hearts: heartPositions(r.fileIds, r.hearts) };
  }

  /**
   * IB1: marks (or unmarks) one photo position at this link, with no account. Marks belong to the link, not to a visit: a mark made in one
   * visit shows in the next. The client wish and the shoot the business reads are written in the same transaction. A mark is counted per
   * link and address (60 an hour); the same mark twice changes nothing; at most 200 positions are marked.
   */
  async mark(code: string, position: unknown, marked: unknown, v: Viewer): Promise<{ hearts: number[] }> {
    const fields: Record<string, string> = {};
    if (typeof position !== "number" || !Number.isInteger(position) || position < 0 || position > 9999) fields.position = "Must be a photo position, a whole number from 0.";
    if (typeof marked !== "boolean") fields.marked = "Must be true or false.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    // IC5: the hourly limit is counted first, so its refusal names the real wait (the minute's read limit would say 60 seconds for an hour's wait)
    if (!CODE.test(code)) throw AppError.notFound();
    await this.limits.take("favourite", this.limits.keyOf(code, v.address), FAVOURITES_PER_HOUR, 3600);
    const r = await this.opened(code, v);
    const ids = idsOf(r.fileIds);
    if ((position as number) >= ids.length) throw AppError.validation({ position: `This reveal has ${ids.length} photos, from 0 to ${Math.max(ids.length - 1, 0)}.` });
    const file = ids[position as number].toLowerCase();
    return this.db.$transaction(async (tx) => {
      // II2: a mark and the removal of the same file cannot both win. The file's row is share-locked first (the removal locks it for update, then clears hearts), so either the removal has finished and the check below refuses the mark, or it waits until the mark is stored and then clears it. Same lock order as the removal, so no deadlock.
      if (marked === true) await tx.$queryRaw`SELECT 1 FROM stored_file WHERE id = ${file}::uuid FOR SHARE`;
      const rows = await tx.$queryRaw<{ hearts: string[]; fileIds: unknown }[]>`SELECT hearts, "fileIds" FROM reveal_access WHERE "linkId" = ${r.linkId}::uuid AND "offAt" IS NULL FOR UPDATE`;
      const now = rows[0];
      if (!now) throw gone();
      // IC2: the mark is on the FILE at that place in the list as it stands now
      const at = idsOf(now.fileIds).map((x) => x.toLowerCase()).indexOf(file);
      if (at < 0) throw AppError.validation({ position: "This photo is not in the reveal any more." });
      const has = now.hearts.map((h) => h.toLowerCase()).includes(file);
      // II2: only a photo that is still one of this shoot's ready files can be marked: a file removed from the shoot, or one that is another shoot's, is refused and nothing is stored (unmarking is always allowed, so an old heart can be cleared)
      if (marked === true && !has) {
        if (now.hearts.length >= MAX_HEARTS) throw AppError.validation({ position: `At most ${MAX_HEARTS} photos can be marked. Unmark one first.` });
        if (!(await this.inShoot(tx, r, file))) throw AppError.validation({ position: "This photo is not in this shoot any more, so it cannot be marked." });
      }
      if ((marked === true && !has) || (marked === false && has)) {
        const next = marked === true ? [...now.hearts, file] : now.hearts.filter((h) => h.toLowerCase() !== file);
        await tx.$executeRaw`UPDATE reveal_access SET hearts = ${next}::text[]::uuid[] WHERE "linkId" = ${r.linkId}::uuid`;
        await syncHearts(tx, r.linkId);
        return { hearts: heartPositions(now.fileIds, next) };
      }
      return { hearts: heartPositions(now.fileIds, now.hearts) };
    });
  }

  /** True when the file is a ready Vault file of the link's business and one of the link's shoot's files (its proofs, its finals or its list). */
  private async inShoot(tx: Pick<PrismaService, "$queryRaw">, r: Row, file: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM stored_file f
       WHERE f.id = ${file}::uuid AND f.purpose = 'vault-file'::"StoredFilePurpose" AND f.status = 'ready'::"StoredFileStatus" AND f."businessId" = ${r.businessId}::uuid
         AND ${r.shootId}::uuid IS NOT NULL
         AND EXISTS (SELECT 1 FROM shoot s WHERE s.id = ${r.shootId}::uuid AND s."businessId" = ${r.businessId}::uuid
                       AND (COALESCE(s.proofs, '[]'::jsonb) @> to_jsonb(${file}::text) OR COALESCE(s.finals, '[]'::jsonb) @> to_jsonb(${file}::text) OR COALESCE(s.files, '[]'::jsonb) @> to_jsonb(${file}::text)))`;
    return rows.length > 0;
  }

  /** The passcode: counted before it is compared, by the receiver link's own lock (LinkLimits.countTry); a locked link says when to come back. */
  async unlock(code: string, passcode: unknown, v: Viewer): Promise<{ ok: boolean; token?: string; expiresAt?: string; error?: string }> {
    await this.limits.take("read", this.limits.keyOf(v.address), READS_PER_MINUTE, 60);
    const r = await this.resolve(code);
    if (!r.passcodeHash) return { ok: true };
    await this.limits.take("unlock", this.limits.keyOf(r.linkId, v.address), UNLOCKS_PER_HOUR, 3600);
    await this.limits.countTry("reveal_access", r.linkId);
    const good = typeof passcode === "string" && passcode.length > 0 && passcode.length <= 200 && (await verify(passcode, r.passcodeHash));
    if (!good) return { ok: false, error: "That is not the passcode." };
    const t = this.tokens.issue(r.linkId, r.passcodeHash);
    return { ok: true, token: t.token, expiresAt: toWireInstant(t.expiresAt) };
  }
}
