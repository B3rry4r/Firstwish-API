import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ScreeningResult as ResultRow, type StoredFile as FileRow } from "@prisma/client";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { IdGenerator } from "../../common/ports/ids.port";
import { UploadScreeningPort } from "../../common/ports/screening.port";
import { toWireInstant } from "../../common/time/time";
import type { ScreeningResult } from "../../contracts";
import { REJECT_SCORE, REVIEW_SCORE } from "./file-rules";

export type Verdict = "pass" | "review" | "reject";

/**
 * DEC-43, DEC-44, X21: reject at or above 0.9, staff review from 0.5, by the score the port answers. A port that says
 * "rejected" never lets a file pass, even with a low score: it goes to staff.
 */
export function verdictOf(score: number, portSaysRejected = false): Verdict {
  if (score >= REJECT_SCORE) return "reject";
  if (score >= REVIEW_SCORE || portSaysRejected) return "review";
  return "pass";
}

/** What the port found, as the confirm records it. */
export interface Screened {
  verdict: Verdict;
  score: number;
  labels: string[];
  provider: string;
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

  /** Y4: asks the port (a slow call, never inside a transaction). The labels are the port's, plus its reason for a refusal. */
  async screen(file: Pick<FileRow, "objectKey" | "contentType">, size: number, head: Buffer): Promise<Screened> {
    const r = await this.port.screen({ key: file.objectKey, contentType: file.contentType, size, head });
    const score = Number.isFinite(r.score) ? Math.min(1, Math.max(0, r.score)) : 1;
    const labels = [...r.labels];
    if (r.verdict === "rejected" && !labels.includes(r.reason)) labels.push(r.reason);
    return { verdict: verdictOf(score, r.verdict === "rejected"), score, labels, provider: this.provider };
  }

  /** Records a finished screening in the caller's (short) transaction, so the result row and the file's new status commit together. */
  record(tx: Prisma.TransactionClient, fileId: string, s: Screened): Promise<ResultRow> {
    return tx.screeningResult.create({ data: { id: this.ids.id(), fileId, provider: s.provider, verdict: s.verdict, labels: s.labels } });
  }
}
