import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ScreeningResult as ResultRow, type StoredFile as FileRow } from "@prisma/client";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { IdGenerator } from "../../common/ports/ids.port";
import { ScreenResult, UploadScreeningPort } from "../../common/ports/screening.port";
import { toWireInstant } from "../../common/time/time";
import type { ScreeningResult } from "../../contracts";
import { REJECT_SCORE, REVIEW_SCORE } from "./file-rules";

export type Verdict = "pass" | "review" | "reject";

/**
 * The provider's confidence that a file breaks the rules, 0 to 1. The port's result has no score field yet (asked for in the
 * hand-back), so a score the adapter adds is read when present; otherwise "rejected" is 1 and "clean" is 0.
 */
export function scoreOf(r: ScreenResult): number {
  const s = (r as { score?: unknown }).score;
  if (typeof s === "number" && Number.isFinite(s) && s >= 0 && s <= 1) return s;
  return r.verdict === "rejected" ? 1 : 0;
}

/** DEC-43, DEC-44: reject at or above 0.9, staff review from 0.5. */
export function verdictOf(score: number): Verdict {
  if (score >= REJECT_SCORE) return "reject";
  if (score >= REVIEW_SCORE) return "review";
  return "pass";
}

function labelsOf(r: ScreenResult): string[] {
  const extra = (r as { labels?: unknown }).labels;
  const labels = Array.isArray(extra) ? extra.filter((l): l is string => typeof l === "string") : [];
  if (r.verdict === "rejected") labels.push(r.reason);
  return labels;
}

export function screeningView(r: ResultRow): ScreeningResult {
  return {
    id: r.id,
    fileId: r.fileId,
    provider: r.provider,
    verdict: r.verdict,
    labels: Array.isArray(r.labels) ? r.labels : [],
    reviewedBy: r.reviewedBy,
    finalVerdict: r.finalVerdict,
    createdAt: toWireInstant(r.createdAt),
  };
}

/** E-158 port:screening-results#screenFile: screens one uploaded file through the screening port and records the result. */
@Injectable()
export class ScreeningService {
  constructor(
    private readonly port: UploadScreeningPort,
    private readonly ids: IdGenerator,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get provider(): string {
    return this.env.PROVIDERS === "standin" ? "standin" : (this.env.SCREENING_PROVIDER ?? "basic");
  }

  /** Runs inside the caller's transaction (the confirm), so the result row and the file's new status commit together. */
  async screenFile(tx: Prisma.TransactionClient, file: FileRow, size: number, head: Buffer): Promise<{ verdict: Verdict; result: ResultRow }> {
    const r = await this.port.screen({ key: file.objectKey, contentType: file.contentType, size, head });
    const score = scoreOf(r);
    const verdict = verdictOf(score);
    const result = await tx.screeningResult.create({
      data: { id: this.ids.id(), fileId: file.id, provider: this.provider, verdict, labels: [...labelsOf(r), `score:${score}`] },
    });
    return { verdict, result };
  }
}
