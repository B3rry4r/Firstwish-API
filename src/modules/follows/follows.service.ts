import { Injectable } from "@nestjs/common";
import type { FollowResponse } from "../../contracts";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { findPublicCreator, lookupHandle } from "../accounts/public-creators";

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
    const handle = lookupHandle(raw);
    if (handle === null) throw NOT_FOUND();
    const seen = await findPublicCreator(this.prisma, handle, this.clock.now());
    if (!seen) throw NOT_FOUND();
    if (seen.accountId === accountId) throw AppError.validation({ handle: "You cannot follow yourself." });
    return this.prisma.$transaction(async (tx) => {
      // AA1: lock the follower's account and the creator's account, in id order so two people following each other cannot
      // wait on one another. The creator's account is locked so that a creator erased at the same moment never keeps a follow
      // (its handle is free again). The follower's own lock refuses an erased follower (401).
      for (const id of [accountId, seen.accountId].sort()) {
        await lockAccount(tx, id, id === accountId ? {} : { allowErased: true });
      }
      const creator = await findPublicCreator(tx, handle, this.clock.now());
      if (!creator || creator.accountId !== seen.accountId) throw NOT_FOUND();
      await tx.$executeRaw`
        INSERT INTO follow (id, "accountId", handle) VALUES (${this.ids.id()}::uuid, ${accountId}::uuid, ${creator.handle})
        ON CONFLICT ("accountId", handle) DO NOTHING`;
      return { handle: creator.handle, following: true };
    });
  }

  /** Unfollow works whether or not the page is still public, so a person can always stop following. */
  async unfollow(accountId: string, raw: string): Promise<FollowResponse> {
    const handle = lookupHandle(raw);
    if (handle === null) throw NOT_FOUND();
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await tx.follow.deleteMany({ where: { accountId, handle } });
    });
    return { handle, following: false };
  }
}
