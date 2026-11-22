import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { CursorQueryDto } from "../../common/pagination/cursor";
import { PostAdminConciergeOrdersByIdMakerBodyDto, PostAdminConciergeOrdersByIdQuoteBodyDto } from "../../contracts";
import type { ConciergeOrderWish } from "../../contracts";
import type { ConciergeOrder, Maker } from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { accountOf } from "../people/business-of";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { CancelBodyDto, DeliverBodyDto, DueQueryDto, IdParamDto, MakeWishBodyDto, PlaceOrderBodyDto, StaffOrdersQueryDto } from "./dto";
import { ConciergeService, type StaffCaller } from "./concierge.service";

const SECTION = "/admin/concierge";

function staffOf(p: Principal | undefined): StaffCaller {
  if (!p || p.kind !== "staff") throw AppError.unauthorized();
  return { staffId: p.staffId, roles: p.roles };
}

/** E-40 places an order (registry auth: business, or signed in). The reads and the cancel are the buyer's own orders. */
@Controller("concierge-orders")
export class ConciergeOrdersController {
  constructor(private readonly orders: ConciergeService) {}

  @Roles("person", "creator", "business")
  @Post()
  place(@Body() body: PlaceOrderBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<ConciergeOrder> {
    return this.orders.place(accountOf(p), body);
  }

  @Roles("person", "creator", "business")
  @Get()
  list(@Query() q: CursorQueryDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.orders.listOwn(accountOf(p), q);
  }

  @Roles("person", "creator", "business")
  @Get(":id")
  read(@Param() params: IdParamDto, @CurrentPrincipal() p: Principal | undefined): Promise<ConciergeOrder> {
    return this.orders.readOwn(accountOf(p), params.id);
  }

  @Roles("person", "creator", "business")
  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Param() params: IdParamDto, @CurrentPrincipal() p: Principal | undefined): Promise<ConciergeOrder> {
    return this.orders.cancelOwn(accountOf(p), params.id);
  }
}

/** The staff side: E-34 to E-39 and E-69. A maker sees only the orders given to them; owner and ops see all (A9). */
@Controller("admin")
export class ConciergeAdminController {
  constructor(private readonly orders: ConciergeService) {}

  /** E-34 */
  @AdminRoute(SECTION, "maker")
  @Post("concierge-orders/:id/delivery")
  @HttpCode(200)
  deliver(@Param() params: IdParamDto, @Body() body: DeliverBodyDto, @CurrentPrincipal() p: Principal | undefined, @StaffActor() actor: AuditActor): Promise<ConciergeOrder> {
    return this.orders.deliver(staffOf(p), params.id, body, actor);
  }

  /** E-35 */
  @AdminRoute(SECTION, "ops")
  @Post("concierge-orders/:id/quote")
  @HttpCode(200)
  quote(@Param() params: IdParamDto, @Body() body: PostAdminConciergeOrdersByIdQuoteBodyDto, @StaffActor() actor: AuditActor): Promise<ConciergeOrder> {
    return this.orders.quote(params.id, body, actor);
  }

  /** E-36 */
  @AdminRoute(SECTION, "maker", "ops")
  @Get("concierge/due")
  due(@Query() q: DueQueryDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.orders.due(staffOf(p), q);
  }

  /** E-69 */
  @AdminRoute(SECTION, "maker", "ops")
  @Get("concierge/makers")
  makers(@Query() q: CursorQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<{ items: Maker[]; nextCursor: string | null }> {
    return this.orders.makers(staffOf(p), q);
  }

  /** E-37 */
  @AdminRoute(SECTION, "maker", "ops")
  @Get("concierge/orders")
  list(@Query() q: StaffOrdersQueryDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.orders.staffList(staffOf(p), q);
  }

  /** E-270 (HY5): the wishes of this order a maker delivers. */
  @AdminRoute(SECTION, "maker", "ops")
  @Get("concierge/orders/:id/wishes")
  wishes(@Param() params: IdParamDto, @CurrentPrincipal() p: Principal | undefined): Promise<{ items: ConciergeOrderWish[]; nextCursor: string | null }> {
    return this.orders.staffWishes(staffOf(p), params.id);
  }

  /** E-273 (HZ2): make a wish in the buyer's name. */
  @AdminRoute(SECTION, "maker")
  @Post("concierge/orders/:id/wishes")
  @HttpCode(201)
  makeWish(@Param() params: IdParamDto, @Body() body: MakeWishBodyDto, @CurrentPrincipal() p: Principal | undefined, @StaffActor() actor: AuditActor): Promise<ConciergeOrderWish> {
    return this.orders.makeWish(staffOf(p), params.id, body, actor);
  }

  /** E-38 */
  @AdminRoute(SECTION, "maker", "ops")
  @Get("concierge/orders/:id")
  read(@Param() params: IdParamDto, @CurrentPrincipal() p: Principal | undefined): Promise<ConciergeOrder> {
    return this.orders.staffRead(staffOf(p), params.id);
  }

  /** E-39 */
  @AdminRoute(SECTION, "ops")
  @Post("concierge/orders/:id/maker")
  @HttpCode(200)
  giveMaker(@Param() params: IdParamDto, @Body() body: PostAdminConciergeOrdersByIdMakerBodyDto, @StaffActor() actor: AuditActor): Promise<ConciergeOrder> {
    return this.orders.give(params.id, body, actor);
  }

  @AdminRoute(SECTION, "ops")
  @Post("concierge/orders/:id/cancel")
  @HttpCode(200)
  cancel(@Param() params: IdParamDto, @Body() body: CancelBodyDto, @StaffActor() actor: AuditActor): Promise<ConciergeOrder> {
    return this.orders.cancelStaff(params.id, body, actor);
  }
}
