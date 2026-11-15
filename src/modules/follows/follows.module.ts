import { Module } from "@nestjs/common";
import { FollowsController } from "./follows.controller";
import { FollowsService } from "./follows.service";

/** Follow: an account follows a creator by handle (E-57, E-58). */
@Module({ controllers: [FollowsController], providers: [FollowsService] })
export class FollowsModule {}
