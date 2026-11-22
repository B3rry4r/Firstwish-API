import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { StudioStyle } from "../../contracts";
import { toWire } from "../studio/studio-doc";

/**
 * II1: the document of a Studio style as a receiver's phone may read it. It is the APPROVED version: the draft the reviewer saw (the
 * frozen snapshot of the latest submission that went live), never a later edit; a style approved before snapshots were kept, or one
 * whose row stands live, reads from the live row (a live style cannot be edited). A style that was never approved has none, and a
 * house style (no Studio row) has none. Whether it may be GIVEN (the style is on, or a wish was already made in it) is the caller's rule.
 */
@Injectable()
export class ApprovedStyleDocuments {
  constructor(private readonly db: PrismaService) {}

  async of(styleId: string): Promise<StudioStyle | null> {
    const studio = await this.db.studioStyle.findUnique({ where: { id: styleId } });
    if (!studio) return null;
    const sub = await this.db.styleSubmission.findFirst({
      where: { styleId, status: "live" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { styleSubmissionSnapshotBySubmission: { select: { document: true } } },
    });
    const frozen = sub?.styleSubmissionSnapshotBySubmission?.document ?? null;
    if (frozen === null && studio.status !== "live") return null;
    const style = await this.db.style.findUnique({ where: { id: styleId }, select: { level: true, addedAt: true } });
    const wire = toWire(
      { ...studio, document: frozen ?? studio.document, status: "live", liveAt: studio.liveAt ?? style?.addedAt ?? null, submittedAt: sub?.createdAt ?? studio.submittedAt },
      style?.level ?? null,
      null,
    );
    return wire;
  }
}
