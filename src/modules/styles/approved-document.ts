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
/** II3: the newest approved submission of the style with this slug (null for a house style, or one never approved): what a wish takes when it takes its style. */
export async function approvedSubmissionOf(db: Pick<PrismaService, "styleSubmission">, slug: string): Promise<string | null> {
  const sub = await db.styleSubmission.findFirst({ where: { status: "live", style: { slug } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  return sub?.id ?? null;
}

@Injectable()
export class ApprovedStyleDocuments {
  constructor(private readonly db: PrismaService) {}

  /**
   * II3: `submissionId` is the approved submission a wish was made under: that version's document is given, even after a later version
   * was approved. Without it (the public style read, a new wish) the newest approved version is given. A pointer that is not an approved
   * submission of this style reads as the newest approved one.
   */
  async of(styleId: string, submissionId?: string | null): Promise<StudioStyle | null> {
    const studio = await this.db.studioStyle.findUnique({ where: { id: styleId } });
    if (!studio) return null;
    const include = { styleSubmissionSnapshotBySubmission: { select: { document: true } } };
    const pinned = submissionId ? await this.db.styleSubmission.findFirst({ where: { id: submissionId, styleId, status: "live" }, include }) : null;
    const sub =
      pinned ?? (await this.db.styleSubmission.findFirst({ where: { styleId, status: "live" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include }));
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
