import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { refusalWords } from "../stored-files/refusal-words";
import { SignedUrlsService } from "../stored-files/signed-urls.service";

/** HP3: one picture of a wish as its owner reads it. `url` and `expiresAt` are null unless the file passed screening (ready). */
export interface WishPicture {
  fileId: string;
  role: "photo" | "cover";
  status: "ready" | "screening" | "refused";
  /** the server's words for a refused photo (null otherwise) */
  reason?: string | null;
  url: string | null;
  expiresAt: string | null;
}

/** HP5: the video's state on a wish read. */
export type VideoState = "none" | "asked" | "rendering" | "ready" | "failed";

const JOB_STATE: Record<string, VideoState> = { queued: "asked", rendering: "rendering", done: "ready", failed: "failed" };

/**
 * What the owner's wish read adds beside the content: a signed read url (short life: READ_TTL_SECONDS, ten minutes) for the cover and
 * each photo, and the video's state. Only the owner's reads call this; the receiver's link read has its own rules (B10).
 * A file still being screened answers status "screening" and a rejected one "refused"; neither gets a url, so a held or refused
 * picture is never handed out.
 */
@Injectable()
export class WishPictures {
  constructor(
    private readonly db: PrismaService,
    private readonly signed: SignedUrlsService,
  ) {}

  async forWishes(ids: string[]): Promise<Map<string, WishPicture[]>> {
    const out = new Map<string, WishPicture[]>(ids.map((i) => [i, []]));
    if (!ids.length) return out;
    const rows = await this.db.wishFile.findMany({
      where: { wishId: { in: ids }, role: { in: ["photo", "cover"] }, file: { status: { in: ["ready", "screening", "rejected"] } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { wishId: true, fileId: true, role: true, file: { select: { status: true, screeningResultByFile: { orderBy: { createdAt: "desc" }, take: 1, select: { labels: true } } } } },
    });
    for (const r of rows) {
      const list = out.get(r.wishId) as WishPicture[];
      const status = r.file.status === "ready" ? "ready" : r.file.status === "rejected" ? "refused" : "screening";
      if (status !== "ready") {
        // II2: the words come from the one fixed list by the screening result's kind (refusal-words.ts); a provider's own sentence never reaches a customer
        list.push({ fileId: r.fileId, role: r.role as "photo" | "cover", status, reason: status === "refused" ? refusalWords(r.file.screeningResultByFile[0]?.labels) : null, url: null, expiresAt: null });
        continue;
      }
      const s = await this.signed.signedRead({ fileId: r.fileId }, { type: "allowed" });
      list.push({ fileId: r.fileId, role: r.role as "photo" | "cover", status, reason: null, url: s.url, expiresAt: s.expiresAt });
    }
    return out;
  }

  /** `gone`: a status video whose extra was refunded is not shown (the video read is 404 for it): the wish says "none", a state HP5 already has. */
  async videoStates(ids: string[], gone?: (wishId: string) => Promise<boolean>): Promise<Map<string, VideoState>> {
    const out = new Map<string, VideoState>();
    if (!ids.length) return out;
    const jobs = await this.db.renderJob.findMany({ where: { wishId: { in: ids } }, orderBy: { id: "desc" }, select: { wishId: true, status: true, kind: true } });
    for (const j of jobs) if (!out.has(j.wishId)) out.set(j.wishId, j.kind === "status_video" && gone && (await gone(j.wishId)) ? "none" : (JOB_STATE[j.status] ?? "none"));
    return out;
  }
}
