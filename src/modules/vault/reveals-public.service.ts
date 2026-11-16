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
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { idsOf, SetName } from "./vault-shared";

/** Who is asking: the address (from the trusted proxy setting; only a keyed hash of it is ever kept), the unlock token, the visit's own id. */
export interface Viewer {
  address: string | null;
  token?: string;
  session?: string;
}

export type RevealView = ({ state: "open" } & RevealPlay & { business: string }) | { state: "passcode" };

interface Row {
  linkId: string;
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
const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
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
      SELECT a."linkId"::text AS "linkId", a."set", a."fileIds", a."passcodeHash", a."endsAt", a."offAt",
             w.no AS "wishNo", w."endsAt" AS "wishEndsAt", w."sentAt", w.reveal,
             (o."erasedAt" IS NOT NULL) AS "ownerErased", b.business
        FROM reveal_access a
        JOIN business b ON b.id = a."businessId"
        LEFT JOIN account o ON o.id = b."accountId"
        LEFT JOIN client_wish w ON w.id = a."wishId"
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
    for (const id of idsOf(r.fileIds)) {
      try {
        photos.push((await this.reads.signedRead({ fileId: id }, { type: "allowed" })).url);
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // a file that was removed is left out
      }
    }
    await this.play(r.linkId, code, v);
    const words = r.reveal && typeof r.reveal === "object" && !Array.isArray(r.reveal) ? { ...(r.reveal as Record<string, unknown>) } : {};
    delete words.link;
    return {
      state: "open",
      no: r.wishNo ?? "",
      style: typeof words.style === "string" ? words.style : "",
      date: toWireInstant(r.sentAt ?? this.clock.now()),
      photos,
      index: photos.map((_, i) => i),
      content: words,
      business: r.business ?? "",
    };
  }

  /** One row for each visit: the visit is the page's own id when it sends one, else the address and the day, both only as a keyed hash. */
  private async play(linkId: string, code: string, v: Viewer): Promise<void> {
    const now = this.clock.now();
    const visit = v.session && SESSION.test(v.session) ? this.limits.keyOf("visit", code, v.session) : this.limits.keyOf("day", code, v.address, now.toISOString().slice(0, 10));
    await this.db.$executeRaw`
      INSERT INTO reveal_play (id, "linkId", visit, at) VALUES (${this.ids.id()}::uuid, ${linkId}::uuid, ${visit}, ${now})
      ON CONFLICT ("linkId", visit) DO NOTHING`;
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
