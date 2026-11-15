import { HttpStatus, Injectable } from "@nestjs/common";
import { scrypt, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { RateLimited } from "../../common/errors/rate-limited";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { PublicWishView } from "../../contracts";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { LINK_LOCK_SECONDS, LINK_WRONG_TRIES, LinkLimits, READS_PER_MINUTE, UNLOCKS_PER_HOUR } from "./link-limits";
import { UnlockTokens } from "./unlock-token";

/** Who is asking: the client address (from the trusted proxy setting), the unlock token the page holds, the opening session. */
export interface Caller {
  address: string | null;
  userAgent?: string | null;
  /** a HEAD: answered like the read, but nothing is written (NN2) */
  head?: boolean;
  token?: string;
  session?: string;
}

interface Row {
  linkId: string;
  slug: string;
  active: boolean;
  tries: number;
  lockedUntil: Date | null;
  id: string;
  status: string;
  erasedAt: Date | null;
  removedAt: Date | null;
  ownerErasedAt: Date | null;
  kind: string;
  occasion: string;
  styleSlug: string;
  opensAt: Date | null;
  openedAt: Date | null;
  endsAt: Date | null;
  timeZone: string;
  name: string | null;
  no: string | null;
  content: unknown;
  passcodeHash: string | null;
}

/** What the server decided for a link at this moment. */
export type Standing = "countdown" | "locked" | "open";

export interface Resolved {
  row: Row;
  standing: Standing;
  /** open means the content may be served now (no passcode, or a good unlock token). */
  needsPasscode: boolean;
}

const gone = () => new AppError(HttpStatus.GONE, "gone", "This wish is no longer here.");
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const INVISIBLE = /[\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/u;
/** NN7: the one invisible character an emoji sequence needs: a zero-width joiner with an emoji (and its variation selector) before and an emoji after. */
const EMOJI_JOINER = /(?<=\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?)\u200D(?=\p{Extended_Pictographic})/gu;
const SLUG_LOOKS = /^[A-Za-z0-9_-]{1,64}$/;

function questionOf(content: unknown): string | null {
  const values = plain(content) && plain(content.opening) && plain(content.opening.values) ? content.opening.values : null;
  const q = values && (values.question ?? values.prompt);
  return typeof q === "string" && q.trim() ? q.trim() : null;
}

/** The only part of a sealed wish a link may show: which opening scene it has. */
function sceneOf(content: unknown): Record<string, unknown> | undefined {
  if (!plain(content) || !plain(content.opening)) return undefined;
  const o = content.opening;
  const out: Record<string, unknown> = {};
  if (typeof o.id === "string") out.id = o.id;
  if (typeof o.scene === "string") out.scene = o.scene;
  return Object.keys(out).length ? { opening: out } : undefined;
}

const verify = (candidate: string, stored: string): Promise<boolean> =>
  new Promise((resolve) => {
    const [kind, salt, key] = stored.split("$");
    if (kind !== "scrypt" || !salt || !key) return resolve(false);
    scrypt(candidate, Buffer.from(salt, "hex"), 32, (err, derived) => {
      const want = Buffer.from(key, "hex");
      resolve(!err && derived.length === want.length && timingSafeEqual(derived, want));
    });
  });

/**
 * The receiver's link (B10). The server decides what a link shows from the wish's own columns and its own clock; the phone's
 * clock is never read. Nothing here needs sign-in and nothing returns the sender's account or any staff field.
 */
@Injectable()
export class PublicWishesService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly limits: LinkLimits,
    private readonly tokens: UnlockTokens,
    private readonly signed: SignedUrlsService,
    private readonly life: WishLifecycleService,
  ) {}

  /**
   * E-129. A read never starts the term (NN2): before the first opening it answers the opening view only (state sealed,
   * openable true once the open time has passed); after it, the full view.
   */
  async view(slug: string, c: Caller, depth = 0): Promise<PublicWishView> {
    await this.limits.take("read", this.limits.keyOf(c.address), READS_PER_MINUTE, 60);
    const r = await this.resolve(slug, c);
    const { row } = r;
    const base = this.base(slug, row);
    if (r.standing === "countdown") return { ...base, state: "countdown", openable: false, content: sceneOf(row.content) };
    if (r.standing === "locked") {
      const q = questionOf(row.content);
      return { ...base, state: q ? "question" : "passcode", openable: true, prompt: q, content: sceneOf(row.content) };
    }
    if (!row.openedAt) return { ...base, state: "sealed", openable: true, content: sceneOf(row.content) };
    const served = await this.serve(row, base, c, "read");
    if (served === "refused") {
      if (depth > 0) throw gone();
      return this.view(slug, c, depth + 1);
    }
    return served;
  }

  /**
   * E-131: the receiver's opening gesture. This call, and only it, starts the term (once); it answers the full view, after the
   * passcode step where there is one. Before the open time it is refused and starts nothing.
   */
  async open(slug: string, c: Caller, depth = 0): Promise<PublicWishView> {
    await this.limits.take("read", this.limits.keyOf(c.address), READS_PER_MINUTE, 60);
    const r = await this.resolve(slug, c);
    if (r.standing === "countdown") throw AppError.conflict("not_open_yet", "This wish is not open yet.");
    if (r.standing === "locked") throw AppError.conflict("not_open", "This wish is not showing yet.");
    const { row } = r;
    const served = await this.serve(row, this.base(slug, row), c, row.openedAt ? "play" : "read");
    if (served === "refused") {
      if (depth > 0) throw gone();
      return this.open(slug, c, depth + 1);
    }
    return served;
  }

  /** The full view of a wish whose content may show now. The first call for a wish starts its term in one transaction. */
  private async serve(row: Row, base: PublicWishView, c: Caller, kind: "read" | "play"): Promise<PublicWishView | "refused"> {
    const stored = plain(row.content) ? row.content : {};
    if (c.head) return { ...base, state: "open", openable: true, openedAt: row.openedAt ? toWireInstant(row.openedAt) : null, endsAt: row.endsAt ? toWireInstant(row.endsAt) : null };
    const files = await this.fileLinks(row.id);
    const done = await this.recordRead(row, this.clock.now(), c, kind);
    if (done === "refused") return "refused";
    return { ...base, ...done.times, state: "open", openable: true, content: { ...stored, files } };
  }

  /** E-134: a passcode (or the answer of a question). Counted before it is compared; a locked link says when to come back. */
  async unlock(slug: string, c: Caller, input: { passcode?: string; answer?: string; opening?: Record<string, unknown> }): Promise<Record<string, unknown>> {
    await this.limits.take("read", this.limits.keyOf(c.address), READS_PER_MINUTE, 60);
    const { row } = await this.resolve(slug, c);
    const now = this.clock.now();
    if (!row.opensAt || row.opensAt.getTime() > now.getTime()) throw AppError.conflict("not_open_yet", "This wish is not open yet.");
    if (!row.passcodeHash) return { ok: true };
    await this.limits.take("unlock", this.limits.keyOf(row.linkId, c.address), UNLOCKS_PER_HOUR, 3600);
    // the try is counted in ONE statement on the link; a link locked until a time refuses with that time
    const lockTo = new Date(now.getTime() + LINK_LOCK_SECONDS * 1000);
    const counted = await this.db.$queryRaw<{ tries: number }[]>`
      UPDATE wish_link SET
        tries = CASE WHEN "lockedUntil" IS NOT NULL THEN 1 ELSE tries + 1 END,
        "lockedUntil" = CASE WHEN "lockedUntil" IS NULL AND tries + 1 >= ${LINK_WRONG_TRIES} THEN ${lockTo}::timestamptz ELSE NULL END
      WHERE id = ${row.linkId}::uuid AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
      RETURNING tries`;
    if (!counted.length) {
      const cur = await this.db.wishLink.findUnique({ where: { id: row.linkId }, select: { lockedUntil: true } });
      const secs = cur?.lockedUntil ? Math.max(1, Math.ceil((cur.lockedUntil.getTime() - now.getTime()) / 1000)) : LINK_LOCK_SECONDS;
      throw new RateLimited(secs, `This link is locked. Try again in ${secs} seconds.`);
    }
    const candidate = input.passcode ?? input.answer ?? (typeof input.opening?.answer === "string" ? input.opening.answer : "");
    const good = typeof candidate === "string" && candidate.length > 0 && candidate.length <= 200 && (await verify(candidate, row.passcodeHash));
    if (!good) return { ok: false, error: questionOf(row.content) ? "That is not the answer." : "That is not the passcode." };
    // a good code does not reset the count: a reset would let tries made at the same moment pass the lock (at most 30 are checked)
    const t = this.tokens.issue(row.linkId, row.passcodeHash);
    return { ok: true, token: t.token, expiresAt: toWireInstant(t.expiresAt) };
  }

  /** E-132: one reaction per opening session, changeable; the counts come from the rows. */
  async react(slug: string, c: Caller, input: { reaction: string; wishId: string }): Promise<{ reaction: string; counts: Record<string, number> }> {
    const reaction = input.reaction.trim();
    if (!reaction || reaction.length > 40 || [...reaction].some((ch) => ch.charCodeAt(0) < 32)) throw AppError.validation({ reaction: "Use 1 to 40 characters." });
    // NN5: no direction-override, zero-width or other invisible (format) character, and no line or paragraph separator
    if (INVISIBLE.test(input.reaction.replace(EMOJI_JOINER, ""))) throw AppError.validation({ reaction: "Use ordinary text, with no hidden characters." });
    const row = await this.showing(slug, c);
    this.sameWish(row, slug, input.wishId, "wishId");
    const now = this.clock.now();
    const session = this.sessionOf(row, c);
    await this.db.$executeRaw`
      INSERT INTO wish_reaction (id, "wishId", session, reaction, "createdAt", "updatedAt")
      VALUES (${this.ids.id()}::uuid, ${row.id}::uuid, ${session}, ${reaction}, ${now}, ${now})
      ON CONFLICT ("wishId", session) DO UPDATE SET reaction = EXCLUDED.reaction, "updatedAt" = EXCLUDED."updatedAt"`;
    return { reaction, counts: await this.reactionCounts(row.id) };
  }

  /** E-130: the photo positions the receiver marked (one set per opening session, replaced each time). */
  async favourites(slug: string, c: Caller, input: { hearts: number[]; no: string }): Promise<void> {
    const row = await this.showing(slug, c);
    if (!row.no || input.no.trim() !== row.no) throw AppError.validation({ no: "That is not this wish." });
    if (input.hearts.length > 200 || input.hearts.some((h) => h < 0 || h > 9999)) throw AppError.validation({ hearts: "Use up to 200 positions, each 0 to 9999." });
    const hearts = [...new Set(input.hearts)].sort((a, b) => a - b);
    await this.db.$executeRaw`
      INSERT INTO wish_favourite (id, "wishId", session, hearts, "updatedAt")
      VALUES (${this.ids.id()}::uuid, ${row.id}::uuid, ${this.sessionOf(row, c)}, ${hearts}::int[], ${this.clock.now()})
      ON CONFLICT ("wishId", session) DO UPDATE SET hearts = EXCLUDED.hearts, "updatedAt" = EXCLUDED."updatedAt"`;
  }

  // ---- the shared steps

  /** The row for a slug and where it stands; 404 for an unknown slug, 410 for a wish that is not here. Both do the same one query. */
  async resolve(slug: string, c: Caller): Promise<Resolved> {
    const key = SLUG_LOOKS.test(slug) ? slug : "-";
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT l.id AS "linkId", l.slug, l.active, l.tries, l."lockedUntil", w.id, w.status::text AS status, w."erasedAt", w."removedAt",
             a."erasedAt" AS "ownerErasedAt", w.kind, w.occasion, w."styleSlug", w."opensAt", w."openedAt", w."endsAt",
             w."timeZone", w.name, w.no, w.content, w."passcodeHash"
        FROM wish_link l JOIN wish w ON w.id = l."wishId" JOIN account a ON a.id = w."accountId"
       WHERE l.slug = ${key}`;
    const row = rows[0];
    if (!row || key !== slug || row.status === "draft") throw AppError.notFound("No wish is at this link.");
    const now = this.clock.now().getTime();
    const resting = row.status === "resting" || (row.status === "live" && (!row.endsAt || row.endsAt.getTime() <= now));
    if (!row.active || row.erasedAt || row.removedAt || row.ownerErasedAt || row.status === "removed" || resting) throw gone();
    if (!row.opensAt || row.opensAt.getTime() > now || (row.status !== "sealed" && row.status !== "live")) {
      return { row, standing: "countdown", needsPasscode: false };
    }
    const needsPasscode = row.passcodeHash !== null;
    if (needsPasscode && !this.tokens.valid(c.token, row.linkId, row.passcodeHash)) return { row, standing: "locked", needsPasscode };
    return { row, standing: "open", needsPasscode };
  }

  /** The wish when its content is showing to this caller, else the answer the read would give (409 when it is not showing). */
  private async showing(slug: string, c: Caller): Promise<Row> {
    await this.limits.take("read", this.limits.keyOf(c.address), READS_PER_MINUTE, 60);
    const r = await this.resolve(slug, c);
    if (r.standing !== "open" || !r.row.openedAt) throw AppError.conflict("not_open", "This wish is not showing yet.");
    return r.row;
  }

  private sameWish(row: Row, slug: string, given: string, field: string): void {
    const g = given.trim();
    if (g !== row.id && g !== row.no && g !== slug) throw AppError.validation({ [field]: "That is not this wish." });
  }

  /** The opening session: the id the page holds in memory, or else a hash of the link, the address and the browser. */
  private sessionOf(row: Row, c: Caller): string {
    if (c.session && /^[A-Za-z0-9_-]{8,64}$/.test(c.session)) return `s:${c.session}`;
    return `h:${this.limits.keyOf(row.id, c.address, c.userAgent)}`;
  }

  private async reactionCounts(wishId: string): Promise<Record<string, number>> {
    const rows = await this.db.$queryRaw<{ reaction: string; n: bigint }[]>`
      SELECT reaction, count(*)::bigint AS n FROM wish_reaction WHERE "wishId" = ${wishId}::uuid GROUP BY reaction`;
    return Object.fromEntries(rows.map((r) => [r.reaction, Number(r.n)]));
  }

  private base(slug: string, row: Row): PublicWishView {
    return {
      slug, kind: row.kind, occasion: row.occasion, styleSlug: row.styleSlug, state: "countdown", openable: false,
      serverTime: toWireInstant(this.clock.now()), opensAt: row.opensAt ? toWireInstant(row.opensAt) : null, timeZone: row.timeZone,
      receiverName: row.name, wishNo: row.no,
    };
  }

  /** A signed read for each file the wish-to-file rows name (never ids found in content, EE3). A file that cannot be read now is left out. */
  private async fileLinks(wishId: string): Promise<{ fileId: string; role: string; url: string; expiresAt: string }[]> {
    const rows = await this.db.wishFile.findMany({ where: { wishId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { fileId: true, role: true } });
    const out: { fileId: string; role: string; url: string; expiresAt: string }[] = [];
    for (const r of rows) {
      try {
        const s = await this.signed.signedRead({ fileId: r.fileId }, { type: "allowed" });
        out.push({ fileId: r.fileId, role: r.role, url: s.url, expiresAt: s.expiresAt });
      } catch (e) {
        if (!(e instanceof AppError) || e.getStatus() !== 404) throw e;
      }
    }
    return out;
  }

  /**
   * The first read starts the term (EE7): markOpened and the WishOpen row go in one transaction. markOpened answers
   * {opened: false} when it refuses (JJ2): then the read is not a first opening; if the wish is still not opened, the read is
   * answered again from the row as it stands now.
   */
  private async recordRead(row: Row, at: Date, c: Caller, kind: "read" | "play"): Promise<"refused" | { times: Partial<PublicWishView> }> {
    const t = (d: Date | null): string | null => (d ? toWireInstant(d) : null);
    if (row.openedAt) {
      await this.insertOpen(this.db, row, kind, false, at, c);
      return { times: { openedAt: t(row.openedAt), endsAt: t(row.endsAt) } };
    }
    return this.db.$transaction(async (tx) => {
      const m = await this.life.markOpened(tx, row.id, at);
      if (!m.opened && !m.openedAt) return "refused" as const;
      await this.insertOpen(tx, row, "read", m.opened, at, c);
      return { times: { openedAt: t(m.openedAt), endsAt: t(m.endsAt) } };
    });
  }

  private async insertOpen(db: Pick<PrismaService, "$executeRaw">, row: Row, kind: "read" | "play", first: boolean, at: Date, c: Caller): Promise<void> {
    await db.$executeRaw`
      INSERT INTO wish_open (id, slug, "wishId", kind, first, session, "createdAt")
      VALUES (${this.ids.id()}::uuid, ${row.slug}, ${row.id}::uuid, ${kind}, ${first}, ${this.sessionOf(row, c)}, ${at})`;
  }
}
