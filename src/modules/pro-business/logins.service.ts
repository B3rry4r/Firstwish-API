import { Injectable } from "@nestjs/common";
import type { Login } from "../../contracts";
import { lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { normaliseEmail } from "../../common/normalise/email";
import { IdGenerator } from "../../common/ports/ids.port";
import { NoticesService } from "../notices/notices.service";
import type { TemplateKey } from "../notices/catalog";
import { passBusinessWishesToOwner } from "../wishes/business-wishes";
import { PlanView } from "./plan-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The message a new login gets (the wording is a MessageTemplate row of this key). */
export const INVITE_TEMPLATE = "login-invite" satisfies TemplateKey;

const wire = (l: { id: string; contact: string | null; status: string | null }, overPlan = false): Login => ({ id: l.id, contact: l.contact ?? "", status: l.status ?? "invited", overPlan });

/**
 * The extra logins of a business (E-66 to E-68). Only the owner manages them. The plan's number of seats comes from the
 * entitlements row (PlanView.loginsAllowed) and counts the owner's own seat; a login over it is 409. A removed login keeps its row
 * with status removed: ProAccess stops seeing the business for it on its very next request.
 */
@Injectable()
export class LoginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly plan: PlanView,
    private readonly notices: NoticesService,
  ) {}

  async list(businessId: string, cursor: string | undefined, limit: number): Promise<Page<Login>> {
    let after = "00000000-0000-0000-0000-000000000000";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = c.id;
    }
    const rows = await this.prisma.login.findMany({ where: { businessId, id: { gt: after }, NOT: { status: "removed" } }, orderBy: { id: "asc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    // B17: after a downgrade the logins stay. Seats go oldest first with the owner's own seat first; a login past the plan's seats is overPlan.
    const state = await this.plan.peek(this.prisma, businessId);
    const allowed = await this.plan.loginsAllowed(this.prisma, state?.plan ?? null);
    const before = await this.prisma.login.count({ where: { businessId, id: { lte: after }, NOT: { status: "removed" } } });
    return { items: page.items.map((l, i) => wire(l, before + i + 2 > allowed)), nextCursor: page.nextCursor };
  }

  /** E-67: invite a login by email. Inviting an email that already stands answers the login it has. */
  async invite(businessId: string, contact: string): Promise<Login> {
    const email = normaliseEmail(contact);
    if (!email) throw AppError.validation({ contact: "Use an email address, like name@studio.ng." });
    return this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const owner = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true, business: true, account: { select: { contact: true } } } });
      if (normaliseEmail(owner.account?.contact ?? "") === email) throw AppError.conflict("already_member", "That is your own sign-in email.");
      const same = await tx.$queryRaw<{ id: string; contact: string | null; status: string | null }[]>`
        SELECT id::text AS id, contact, status FROM login WHERE "businessId" = ${businessId}::uuid AND lower(trim(contact)) = ${email} AND coalesce(status, '') <> 'removed' LIMIT 1`;
      if (same[0]) return wire(same[0]); // a login that already stands is within the plan when it was invited (invites past the seats are refused)
      // Count the seats under the same lock that every login change takes (the owner's account), so two invites cannot both take the last one.
      const state = await this.plan.peek(tx, businessId);
      const allowed = await this.plan.loginsAllowed(tx, state?.plan ?? null);
      const used = await this.plan.seatsUsed(tx, businessId);
      if (used >= allowed) throw AppError.conflict("logins_full", `Your plan has ${allowed} login${allowed === 1 ? "" : "s"} and all are in use.`);
      const id = this.ids.id();
      await tx.login.create({ data: { id, businessId, contact: email, status: "invited" } });
      await this.notices.send(tx, { template: INVITE_TEMPLATE, toEmail: email, data: { business: owner.business ?? owner.name ?? "A business" }, key: `login-invite:${id}` });
      return { id, contact: email, status: "invited", overPlan: false };
    });
  }

  /** E-68: take a login out. The owner check is in the update's where. */
  async remove(businessId: string, id: string): Promise<void> {
    if (!UUID.test(id)) throw AppError.notFound();
    await this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const gone = await tx.$queryRaw<{ contact: string | null }[]>`UPDATE login SET status = 'removed' WHERE id = ${id}::uuid AND "businessId" = ${businessId}::uuid AND coalesce(status, '') <> 'removed' RETURNING contact`;
      if (gone.length === 0) throw AppError.notFound();
      // ZB5: the business's wishes this login made (drafts and sealed) pass to the owner's account in this same transaction.
      const email = normaliseEmail(gone[0].contact ?? "");
      if (!email) return;
      const accounts = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM account WHERE "erasedAt" IS NULL AND lower(trim(contact)) = ${email}`;
      await passBusinessWishesToOwner(tx, { fromAccountIds: accounts.map((x) => x.id), businessId });
    });
  }
}
