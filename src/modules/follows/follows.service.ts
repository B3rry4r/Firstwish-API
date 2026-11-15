import { Injectable } from "@nestjs/common";
import type { FollowResponse } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { canonicalHandle, handleProblem } from "../../common/normalise/handle";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { findPublicCreator } from "../accounts/public-creators";

const NOT_FOUND = () => AppError.notFound("No creator has that handle.");

/**
 * E-57, E-58: follow and unfollow a creator, both safe to send twice and at once (one row per account and handle, written with
 * ON CONFLICT). Counts are counted from the rows on read, so no toggle can take them below zero.
 */
@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async follow(accountId: string, raw: string): Promise<FollowResponse> {
    const handle = canonicalHandle(raw);
    if (handleProblem(handle)) throw NOT_FOUND();
    const creator = await findPublicCreator(this.prisma, handle, this.clock.now());
    if (!creator) throw NOT_FOUND();
    if (creator.accountId === accountId) throw AppError.validation({ handle: "You cannot follow yourself." });
    await this.prisma.$executeRaw`
      INSERT INTO follow (id, "accountId", handle) VALUES (${this.ids.id()}::uuid, ${accountId}::uuid, ${creator.handle})
      ON CONFLICT ("accountId", handle) DO NOTHING`;
    return { handle: creator.handle, following: true };
  }

  /** Unfollow works whether or not the page is still public, so a person can always stop following. */
  async unfollow(accountId: string, raw: string): Promise<FollowResponse> {
    const handle = canonicalHandle(raw);
    if (handleProblem(handle)) throw NOT_FOUND();
    await this.prisma.follow.deleteMany({ where: { accountId, handle } });
    return { handle, following: false };
  }
}
