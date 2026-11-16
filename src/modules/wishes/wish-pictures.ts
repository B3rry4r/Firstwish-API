import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { SignedUrlsService } from "../stored-files/signed-urls.service";

/** HP3: one picture of a wish as its owner reads it. `url` and `expiresAt` are null unless the file passed screening (ready). */
export interface WishPicture {
  fileId: string;
  role: "photo" | "cover";
  status: "ready" | "screening" | "refused";
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
      select: { wishId: true, fileId: true, role: true, file: { select: { status: true } } },
    });
    for (const r of rows) {
      const list = out.get(r.wishId) as WishPicture[];
      const status = r.file.status === "ready" ? "ready" : r.file.status === "rejected" ? "refused" : "screening";
      if (status !== "ready") {
        list.push({ fileId: r.fileId, role: r.role as "photo" | "cover", status, url: null, expiresAt: null });
        continue;
      }
      const s = await this.signed.signedRead({ fileId: r.fileId }, { type: "allowed" });
      list.push({ fileId: r.fileId, role: r.role as "photo" | "cover", status, url: s.url, expiresAt: s.expiresAt });
    }
    return out;
  }

  async videoStates(ids: string[]): Promise<Map<string, VideoState>> {
    const out = new Map<string, VideoState>();
    if (!ids.length) return out;
    const jobs = await this.db.renderJob.findMany({ where: { wishId: { in: ids } }, orderBy: { id: "desc" }, select: { wishId: true, status: true } });
    for (const j of jobs) if (!out.has(j.wishId)) out.set(j.wishId, JOB_STATE[j.status] ?? "none");
    return out;
  }
}
