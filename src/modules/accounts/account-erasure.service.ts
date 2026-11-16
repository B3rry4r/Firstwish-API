import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { AuditActor, AuditService } from "../audit/audit.service";
import { SavedWishesService } from "../saved-wishes/saved-wishes.service";
import { FileJobs } from "../stored-files/file-jobs";
import type { Db } from "./account-rules";

/** How young the session family (the sign-in) must be for a person to erase their own account. */
export const FRESH_SIGN_IN_MS = 10 * 60 * 1000;

/**
 * How each resource's rows belong to an account, for the erase rules in .pipeline/schema-map.json (Q9). Every resource that
 * has a 'blank' rule is listed here, or in NOT_THIS_ACCOUNT with the reason; a test walks schema-map and holds both lists to it.
 */
export const ERASE_LINKS = {
  Account: "the account row",
  AiRequest: "accountId",
  AuthCode: "destination or canonical is the account's email",
  BankAccount: "creatorId is the account's creator row",
  Business: "accountId",
  ClientWish: "businessId is one of the account's businesses",
  ConciergeOrder: "accountId",
  Creator: "accountId",
  DateRow: "accountId",
  ExternalIdentity: "accountId",
  Login: "businessId is one of the account's businesses",
  MessageDelivery: "to is the account's email",
  Notice: "accountId",
  Payment: "accountId, or businessId is one of the account's businesses",
  Person: "businessId is one of the account's businesses",
  PublishedWish: "wish is the id of one of the account's wishes (the table has no foreign key)",
  QrCard: "wishId is one of the account's wishes",
  Report: "accountId (the reporter)",
  Session: "accountId",
  Shoot: "businessId is one of the account's businesses",
  SupportMessage: "threadId is one of the account's support threads",
  SupportThread: "accountId",
  Wish: "accountId",
} as const;

export const NOT_THIS_ACCOUNT: Record<string, string> = {
  StaffAccount: "staff are separate from accounts (conventions: Who can do what); a staff member is never erased by an account erase",
};

/** The job kinds that wait on one wish (its id is the job's subject): the lifecycle's timed moves and its notice. */
const WISH_JOB_KINDS = ["open_wish", "rest_wish", "erase_wish", "erase_now", "restore_window_end", "send_notice"] as const;

export interface EraseRequest {
  /** Who asked: the person themselves (needs a fresh sign-in) or a staff member (B21, E-3, with a reason). */
  actor: AuditActor;
  reason: string | null;
  /** For a person erasing their own account: the session family of the request, which must be younger than 10 minutes. */
  freshFamilyId?: string;
}

/**
 * Erase on request (Q9). In ONE transaction: every column schema-map marks 'blank' for this account is blanked, erasedAt set,
 * every session ended, the creator and business sides taken away (their public pages gone), follows by and of the account
 * removed, and its wishes removed and erased (the lifecycle's "erase now": content gone for good), saved rows dropped, and one job row scheduled to remove its stored files. Payments and ledger rows
 * stay with their amounts and lose only personal fields. The email is free again, so it can sign up later as a new, empty account.
 * Erasing an erased account changes nothing.
 */
@Injectable()
export class AccountErasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly savedWishes: SavedWishesService,
    private readonly fileJobs: FileJobs,
  ) {}

  async erase(accountId: string, req: EraseRequest): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId, { allowErased: true });
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw AppError.notFound();
      if (account.erasedAt) return;
      if (req.freshFamilyId !== undefined) await this.requireFreshSignIn(tx, accountId, req.freshFamilyId);
      await this.blankAll(tx, accountId, account.contact, account.handle);
      await this.audit.write(tx, {
        actor: req.actor,
        section: "/admin/people",
        action: "account.erase",
        target: { type: "Account", id: accountId },
        reason: req.reason,
        changedFields: ["name", "contact", "phone", "bio", "handle", "dates", "business", "erasedAt"],
      });
    });
  }

  private async requireFreshSignIn(tx: Db, accountId: string, familyId: string): Promise<void> {
    const first = familyId === "" ? null : await tx.session.findFirst({ where: { accountId, familyId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const age = first ? this.clock.now().getTime() - first.createdAt.getTime() : Number.POSITIVE_INFINITY;
    if (!(age >= 0 && age < FRESH_SIGN_IN_MS)) {
      throw new AppError(403, "fresh_sign_in_needed", "Sign in again first: erasing your account needs a sign-in from the last 10 minutes.");
    }
  }

  private async blankAll(tx: Db, accountId: string, email: string | null, handle: string | null): Promise<void> {
    const now = this.clock.now();
    const businessIds = (await tx.business.findMany({ where: { accountId }, select: { id: true } })).map((b) => b.id);
    const creatorIds = (await tx.creator.findMany({ where: { accountId }, select: { id: true } })).map((c) => c.id);
    const wishIds = (await tx.wish.findMany({ where: { accountId }, select: { id: true } })).map((w) => w.id);
    const threadIds = (await tx.supportThread.findMany({ where: { accountId }, select: { id: true } })).map((t) => t.id);
    const inBusiness = { businessId: { in: businessIds } };

    await tx.account.update({
      where: { id: accountId },
      data: {
        name: null, contact: null, phone: null, bio: null, handle: null, timeZone: null, dates: Prisma.DbNull, business: null,
        sides: ["person"], space: null, lastSide: "person", erasedAt: now,
      },
    });
    await tx.session.updateMany({ where: { accountId, revokedAt: null }, data: { revokedAt: now, revokeReason: "erased" } });
    await tx.session.updateMany({ where: { accountId }, data: { ip: null, userAgent: null } });
    if (email) {
      await tx.authCode.updateMany({
        where: { OR: [{ destination: email }, { canonical: email }] },
        data: { destination: "", ip: null, canonical: null, triedFrom: [] },
      });
      await tx.messageDelivery.updateMany({ where: { to: email }, data: { to: "", vars: Prisma.DbNull } });
    }
    await tx.externalIdentity.updateMany({ where: { accountId }, data: { email: null, subject: "" } });
    await tx.creator.updateMany({ where: { accountId }, data: { name: null, person: null, line: null, href: null, img: null } });
    if (creatorIds.length) await tx.bankAccount.updateMany({ where: { creatorId: { in: creatorIds } }, data: { accountNumber: null } });
    await tx.business.updateMany({ where: { accountId }, data: { ownerName: null, person: null, business: null, name: null, brand: Prisma.DbNull } });
    if (businessIds.length) {
      await tx.clientWish.updateMany({ where: inBusiness, data: { from: null, client: null, wish: null } });
      await tx.login.updateMany({ where: inBusiness, data: { contact: null } });
      await tx.person.updateMany({ where: inBusiness, data: { name: null, phone: null, birthday: null, rows: Prisma.DbNull } });
      await tx.shoot.updateMany({ where: inBusiness, data: { client: null, title: null } });
    }
    await tx.aiRequest.updateMany({
      where: { accountId },
      data: {
        transcript: null, ask: null, description: null, instruction: null, prompt: null,
        output: Prisma.DbNull, made: Prisma.DbNull, target: Prisma.DbNull,
      },
    });
    await tx.conciergeOrder.updateMany({ where: { accountId }, data: { brief: "" } });
    await tx.dateRow.updateMany({ where: { accountId }, data: { name: null, who: null, what: null, person: Prisma.DbNull, for: Prisma.DbNull } });
    await tx.notice.updateMany({ where: { accountId }, data: { body: null, subject: null } });
    await tx.payment.updateMany({ where: { OR: [{ accountId }, inBusiness] }, data: { payerContact: null } });
    await tx.report.updateMany({ where: { accountId }, data: { reporterContact: null, contact: null, note: null } });
    if (threadIds.length) await tx.supportMessage.updateMany({ where: { threadId: { in: threadIds } }, data: { body: "" } });
    await tx.supportThread.updateMany({ where: { accountId }, data: { contact: "", subject: "", body: null, text: null } });
    if (wishIds.length) {
      await tx.qrCard.updateMany({ where: { wishId: { in: wishIds } }, data: { names: Prisma.DbNull } });
      await tx.publishedWish.updateMany({ where: { wish: { in: wishIds } }, data: { forName: null, from: null, name: null } });
    }
    // Every wish transition is recorded (wish lifecycle declaration); ids are UUIDv7 made here, one per wish that moves.
    const moving = await tx.wish.findMany({ where: { accountId, status: { not: "removed" } }, select: { id: true, status: true } });
    if (moving.length) {
      await tx.wishTransition.createMany({
        data: moving.map((w) => ({ id: this.ids.id(), wishId: w.id, from: w.status, to: "removed", cause: "account.erase", createdAt: now })),
      });
    }
    await tx.wish.updateMany({ where: { accountId, removedAt: null }, data: { removedAt: now } });
    await tx.wish.updateMany({
      where: { accountId },
      data: {
        name: null, letter: null, content: Prisma.DbNull, passcodeHash: null, call: null, note: null,
        blessing: Prisma.DbNull, captions: Prisma.DbNull, chapter: Prisma.DbNull, details: Prisma.DbNull, finale: Prisma.DbNull,
        links: Prisma.DbNull, makerNote: Prisma.DbNull, memory: Prisma.DbNull, photos: Prisma.DbNull, reasons: Prisma.DbNull,
        timeline: Prisma.DbNull, voices: Prisma.DbNull,
        status: "removed", erasedAt: now,
      },
    });
    // X10: the wishes' public links answer "gone" (the link row stays as a key; it is no longer active).
    if (wishIds.length) await tx.wishLink.updateMany({ where: { wishId: { in: wishIds } }, data: { active: false } });
    // INT-3 (J1): the erased wishes' waiting jobs go (nothing may open, rest or notify an erased wish), and the files they named are
    // no longer named (the files themselves go with the account's file job below).
    if (wishIds.length) {
      await tx.job.deleteMany({ where: { subjectId: { in: wishIds }, type: { in: [...WISH_JOB_KINDS] }, status: "scheduled" } });
      await tx.wishFile.deleteMany({ where: { wishId: { in: wishIds } } });
    }
    // BB6: every saved list drops the wishes (a feed row's id too); the account's own saved rows go with it.
    await this.savedWishes.forgetForWishes(tx, wishIds);
    await tx.savedWish.deleteMany({ where: { accountId } });
    // X10: the account's stored files are removed after this commits: one job row now, the storage calls by the cleanup handler (Y4).
    await this.fileJobs.removeAccountFiles(accountId, tx);
    await tx.follow.deleteMany({ where: { accountId } });
    if (handle) await tx.follow.deleteMany({ where: { handle } });
  }
}
