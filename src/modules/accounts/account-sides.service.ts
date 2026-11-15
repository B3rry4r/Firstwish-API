import { Injectable } from "@nestjs/common";
import { Account as AccountRow, Prisma } from "@prisma/client";
import type { HandleCheck, PostMeBusinessBody, PostMeCreatorBody } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { canonicalHandle, handleProblem } from "../../common/normalise/handle";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { Db, HANDLE_TAKEN, isUniqueViolation, readContact, setHandle, Side, sidesOf } from "./account-rules";
import { AccountsService, MeView } from "./accounts.service";

const BUSINESS_NAME_MAX = 48;
const NAME_MAX = 80;
const ENDED = () => AppError.unauthorized("Your session has ended. Sign in again.");

/**
 * The creator and business sides of an account (E-8 to E-11) and the handle check (E-5). Turning a side on makes its row once
 * (the account row is locked, and the creator row is unique per account); turning it off keeps the row and its history and only
 * takes the side away, which hides the public page.
 */
@Injectable()
export class AccountSidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly accounts: AccountsService,
  ) {}

  /** E-5: is this handle free for the caller? Its own handle is free; a rule it breaks is the problem. */
  async checkHandle(accountId: string, raw: string): Promise<HandleCheck> {
    const handle = canonicalHandle(raw);
    const problem = handleProblem(handle);
    if (problem) return { free: false, problem };
    const taken = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM account WHERE lower(handle) = ${handle} AND id <> ${accountId}::uuid LIMIT 1`;
    return taken.length ? { free: false, problem: `@${handle} is taken.` } : { free: true };
  }

  /** E-11: turns the creator side on (or updates it): the handle, the creator row once, and the side. */
  async creatorOn(accountId: string, body: PostMeCreatorBody): Promise<MeView> {
    const fields: ErrorFields = {};
    const name = body.name?.trim();
    if (name !== undefined && (name.length === 0 || name.length > NAME_MAX)) fields.name = `Must be 1 to ${NAME_MAX} characters.`;
    await this.inLockedAccount(accountId, async (tx, row) => {
      const phone = body.contact !== undefined ? readContact(body.contact, row.contact, fields) : undefined;
      if (Object.keys(fields).length) throw AppError.validation(fields);
      await setHandle(tx, accountId, row.handle, body.handle);
      const data: Prisma.AccountUpdateInput = { sides: this.withSide(row, "creator"), space: "creator", lastSide: "creator" };
      if (phone !== undefined) data.phone = phone;
      if (body.bio !== undefined) data.bio = body.bio.trim() || null;
      await tx.account.update({ where: { id: accountId }, data });
      await tx.$executeRaw`
        INSERT INTO creator (id, "accountId", version) VALUES (${this.ids.id()}::uuid, ${accountId}::uuid, 0)
        ON CONFLICT ("accountId") DO NOTHING`;
      if (name !== undefined) await tx.creator.update({ where: { accountId }, data: { name } });
    });
    return this.accounts.me(accountId);
  }

  /** E-10: turns the creator side off. The creator row, its handle and its follows stay; the public page is hidden. */
  async creatorOff(accountId: string): Promise<MeView> {
    await this.inLockedAccount(accountId, (tx, row) => this.dropSide(tx, row, "creator"));
    return this.accounts.me(accountId);
  }

  /**
   * E-9: turns the business side on: the business name and the business row once. A plan is never granted here: a Pro plan or
   * pack comes only from a paid payment (B07). Default (lead), owner may override.
   */
  async businessOn(accountId: string, body: PostMeBusinessBody): Promise<MeView> {
    const fields: ErrorFields = {};
    const fromPro = this.readPro(body.pro, fields);
    const businessName = (body.business ?? fromPro)?.trim();
    if (businessName !== undefined && (businessName.length === 0 || businessName.length > BUSINESS_NAME_MAX)) {
      fields.business = `Must be 1 to ${BUSINESS_NAME_MAX} characters.`;
    }
    const ownerName = body.name?.trim();
    if (ownerName !== undefined && (ownerName.length === 0 || ownerName.length > NAME_MAX)) fields.name = `Must be 1 to ${NAME_MAX} characters.`;
    await this.inLockedAccount(accountId, async (tx, row) => {
      const phone = body.contact !== undefined ? readContact(body.contact, row.contact, fields) : undefined;
      const name = businessName ?? row.business ?? undefined;
      if (!name && !fields.business) fields.business = "Must be your business name.";
      if (Object.keys(fields).length || !name) throw AppError.validation(fields);
      const data: Prisma.AccountUpdateInput = { sides: this.withSide(row, "business"), business: name, space: "business", lastSide: "business" };
      if (phone !== undefined) data.phone = phone;
      await tx.account.update({ where: { id: accountId }, data });
      const existing = await tx.business.findFirst({ where: { accountId }, orderBy: { id: "asc" } });
      const owner = ownerName ?? row.name ?? null;
      if (existing) {
        await tx.business.update({ where: { id: existing.id }, data: { business: name, name, ...(ownerName ? { ownerName } : {}) } });
      } else {
        await tx.business.create({
          data: { id: this.ids.id(), accountId, business: name, name, ownerName: owner, since: this.clock.now(), version: 0 },
        });
      }
    });
    return this.accounts.me(accountId);
  }

  /** E-8: turns the business side off; the business row and its records stay. */
  async businessOff(accountId: string): Promise<MeView> {
    await this.inLockedAccount(accountId, (tx, row) => this.dropSide(tx, row, "business"));
    return this.accounts.me(accountId);
  }

  private readPro(pro: PostMeBusinessBody["pro"], fields: ErrorFields): string | undefined {
    if (pro === undefined) return undefined;
    const p: Record<string, unknown> = pro;
    const unknown = Object.keys(p).filter((k) => k !== "plan" && k !== "business");
    for (const k of unknown) fields[`pro.${k}`] = "Not a known field.";
    if (p.plan !== undefined && p.plan !== "pack") fields["pro.plan"] = "Must be pack.";
    if (p.business === undefined) return undefined;
    if (typeof p.business !== "string" || p.business.trim().length > BUSINESS_NAME_MAX) {
      fields["pro.business"] = `Must be text of ${BUSINESS_NAME_MAX} characters or fewer.`;
      return undefined;
    }
    return p.business;
  }

  private withSide(row: AccountRow, side: Side): Side[] {
    const sides = sidesOf(row.sides);
    return sides.includes(side) ? sides : [...sides, side];
  }

  private async dropSide(tx: Db, row: AccountRow, side: Side): Promise<void> {
    const sides = sidesOf(row.sides).filter((s) => s !== side);
    const leaving = row.lastSide === side || row.space === side;
    await tx.account.update({
      where: { id: row.id },
      data: { sides, ...(leaving ? { space: "me", lastSide: "person" } : {}) },
    });
  }

  /** Runs `fn` with the account row locked (FOR UPDATE), so two side changes at once run one after the other. */
  private async inLockedAccount(accountId: string, fn: (tx: Db, row: AccountRow) => Promise<void>): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM account WHERE id = ${accountId}::uuid FOR UPDATE`;
        const row = await tx.account.findUnique({ where: { id: accountId } });
        if (!row || row.erasedAt) throw ENDED();
        await fn(tx, row);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw HANDLE_TAKEN();
      throw e;
    }
  }
}
