import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../../common/auth/decorators";
import { GetStudioTemplatesQueryDto, type GetStudioTemplatesResponse } from "../../contracts";
import { TemplatesService } from "./templates.service";

@Controller("studio/templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** E-212: creators only. */
  @Roles("creator")
  @Get()
  list(@Query() q: GetStudioTemplatesQueryDto): Promise<GetStudioTemplatesResponse> {
    return this.templates.list(q);
  }
}
