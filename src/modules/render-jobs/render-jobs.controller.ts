import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { GetWishesByIdVideoParamsDto, PostWishesByIdVideoBodyDto, PostWishesByIdVideoParamsDto } from "../../contracts";
import type { GetWishesByIdVideoResponse, PostWishesByIdVideoResponse } from "../../contracts";
import { accountOf } from "../people/business-of";
import { RenderJobsService } from "./render-jobs.service";

/** E-147 and E-148, the owner's own wish only. */
@Controller("wishes/:id/video")
export class RenderJobsController {
  constructor(private readonly jobs: RenderJobsService) {}

  @Roles("person", "creator", "business")
  @Get()
  read(@Param() params: GetWishesByIdVideoParamsDto, @CurrentPrincipal() p: Principal | undefined): Promise<GetWishesByIdVideoResponse> {
    return this.jobs.latest(accountOf(p), params.id);
  }

  /** The wish has the video already (its ticket or an extra), so no payment starts: `payment` is null (DEC-139). */
  @Roles("person", "creator", "business")
  @Post()
  @HttpCode(200)
  async ask(@Param() params: PostWishesByIdVideoParamsDto, @Body() body: PostWishesByIdVideoBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<PostWishesByIdVideoResponse> {
    if (body.wishId !== undefined && body.wishId.trim() !== params.id) throw AppError.validation({ wishId: "Must be the wish in the address." });
    return (await this.jobs.ask(accountOf(p), params.id)) as unknown as PostWishesByIdVideoResponse;
  }
}
