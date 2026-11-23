import { Injectable } from "@nestjs/common";
import type { SampleWish as SampleRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import type { PaginatedList, SampleWish } from "../../contracts";

/** The instant every sample opens at: a day already past, fixed, so a preview always opens and the answer never changes between reads. */
export const SAMPLE_OPENS_AT = "2026-11-07T00:00:00.000Z";

/**
 * IJ1, DEC-309: the designed sample wishes the style previews play. A row of sample_wish is shown in the shape the public wish read gives a
 * player (kind, occasion, content, files, receiverName, opensAt, state, openable), marked `sample`. It is reference data owned here: it has
 * no slug, owner, link, style or counts, and nothing in a request is ever written to it (this service only reads).
 */
function shown(r: SampleRow): SampleWish {
  const photos = (r.photos as string[]) ?? [];
  return {
    sample: true,
    kind: r.kind,
    occasion: r.occasion,
    occasionName: r.occasionName,
    receiverName: r.name,
    call: r.call,
    date: r.date,
    opensAt: SAMPLE_OPENS_AT,
    state: "open",
    openable: true,
    content: r.content as Record<string, unknown>,
    files: photos.map((url) => ({ role: "photo", url })),
    photos,
  };
}

const byKindThenOccasion = (a: SampleRow, b: SampleRow): number => (a.kind === b.kind ? (a.occasion < b.occasion ? -1 : 1) : a.kind < b.kind ? -1 : 1);

@Injectable()
export class SampleWishesService {
  constructor(private readonly db: PrismaService) {}

  /** E-288. */
  async one(kind: string, occasion: string): Promise<SampleWish> {
    const row = await this.db.sampleWish.findUnique({ where: { kind_occasion: { kind, occasion } } });
    if (!row) {
      const kindKnown = (await this.db.sampleWish.count({ where: { kind } })) > 0;
      throw AppError.notFound(kindKnown ? `There is no sample wish for the occasion "${occasion.slice(0, 60)}" in the kind "${kind}".` : `There is no sample wish for the kind "${kind.slice(0, 60)}".`);
    }
    return shown(row);
  }

  /** E-287: the samples of one kind, or of every kind when none is named. At most 44 rows (one for each kind and occasion of the catalogue), in one answer. */
  async list(kind?: string): Promise<PaginatedList<SampleWish>> {
    const named = (kind ?? "").trim();
    const rows = await this.db.sampleWish.findMany({ where: named ? { kind: named } : undefined });
    if (named && !rows.length) throw AppError.notFound(`There is no sample wish for the kind "${named.slice(0, 60)}".`);
    return { items: rows.sort(byKindThenOccasion).map(shown), nextCursor: null };
  }
}
