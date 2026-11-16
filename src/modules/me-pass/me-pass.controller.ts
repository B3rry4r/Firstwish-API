import { Controller, Get } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { accountOf } from "../people/business-of";
import { MePassService, type PassRead } from "./me-pass.service";

/** E-83: the caller's own Pass (signed in, any side). With no Pass it answers the empty Pass, 200, never a 500. */
@Controller("me/pass")
export class MePassController {
  constructor(private readonly pass: MePassService) {}

  @Roles("person", "creator", "business")
  @Get()
  read(@CurrentPrincipal() p: Principal | undefined): Promise<PassRead> {
    return this.pass.read(accountOf(p));
  }
}
