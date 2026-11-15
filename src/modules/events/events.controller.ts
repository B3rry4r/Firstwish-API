import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { PostEventsBodyDto, type PostEventsResponse } from "../../contracts";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** E-52: signed in (no decorator: any side). */
  @Post()
  @HttpCode(200)
  async track(@Body() body: PostEventsBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<PostEventsResponse> {
    if (!p || p.kind !== "user") throw AppError.unauthorized();
    await this.events.track(p.accountId, body);
    return {};
  }
}
