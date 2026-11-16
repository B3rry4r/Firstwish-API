import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { AuditActor, AuditService } from "../audit/audit.service";
import { ShowingLink } from "../showing/showing-link";
import { SavedWishesService } from "../saved-wishes/saved-wishes.service";
import { JobsService } from "../jobs/jobs.service";
import { ERASE_WISH_FILE_PREFIX, UNOPENED_DAYS } from "../wishes/wish-lifecycle.service";
import { StudioErasure } from "../studio/studio-erasure";
import { FileJobs } from "../stored-files/file-jobs";
import { passBusinessWishesToOwner } from "../wishes/business-wishes";
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

/** The subject prefix of an erase-now job that blanks one client wish row when its term ends (RR3). */
export const CLIENT_WISH_PREFIX = "client-wish:";

/**
 * EA4: a client wish's reveal words (the client's name, the note, the credits, the city, the booking link) are blanked; only the link id
 * stays (a key, nothing personal). `ids` are client-wish ids. One statement; safe to repeat.
 */
export async function blankRevealWords(tx: Pick<Prisma.TransactionClient, "$executeRaw">, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // The email that carried the client's name to the client (key reveal:<client wish>:<send>) keeps neither address nor words.
  const mails = await tx.$executeRaw`
    UPDATE message_delivery SET vars = NULL, "to" = ''
     WHERE "idempotencyKey" LIKE ANY(SELECT 'reveal:' || x || ':%' FROM unnest(${ids}::text[]) AS x) AND (vars IS NOT NULL OR "to" <> '')`;
  return mails + await tx.$executeRaw`
    UPDATE client_wish SET reveal = CASE WHEN reveal ? 'link' THEN jsonb_build_object('link', reveal -> 'link') ELSE '{}'::jsonb END
     WHERE id = ANY(${ids}::uuid[]) AND reveal IS NOT NULL AND reveal <> CASE WHEN reveal ? 'link' THEN jsonb_build_object('link', reveal -> 'link') ELSE '{}'::jsonb END`;
}

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
    private readonly showing: ShowingLink,
    private readonly jobs: JobsService,
    private readonly studio: StudioErasure,
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
    // ZB4: the business wishes this login made (drafts and sealed) pass to the business owner's account and keep playing; the rest of this account goes.
    await passBusinessWishesToOwner(tx, { fromAccountIds: [accountId] });
    const businessIds = (await tx.business.findMany({ where: { accountId }, select: { id: true } })).map((b) => b.id);
    const creatorIds = (await tx.creator.findMany({ where: { accountId }, select: { id: true } })).map((c) => c.id);
    // RR3 / ZB3: the account's own wishes, and the wishes made for its businesses (a login's client wishes carry the business).
    const allWishes = await tx.wish.findMany({ where: { OR: [{ accountId }, ...(businessIds.length ? [{ businessId: { in: businessIds } }] : [])] }, select: { id: true, status: true, businessId: true, erasedAt: true, removedAt: true, opensAt: true, openedAt: true, endsAt: true } });
    // RR3: a business owner's client wish that was already sent (sealed or live) is not erased now: its link keeps playing to the end of its term.
    const sentForClient = allWishes.filter((w) => w.businessId !== null && businessIds.includes(w.businessId) && !w.erasedAt && !w.removedAt && (w.status === "sealed" || w.status === "live"));
    const keptSet = new Set(sentForClient.map((w) => w.id));
    const wishIds = allWishes.map((w) => w.id).filter((id) => !keptSet.has(id));
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
    // HD1: this person's own address in every business's login rows (as a member of other businesses) goes too.
    if (email) await tx.$executeRaw`UPDATE login SET contact = NULL WHERE contact IS NOT NULL AND lower(trim(contact)) = lower(trim(${email}))`;
    await tx.externalIdentity.updateMany({ where: { accountId }, data: { email: null, subject: "" } });
    await tx.creator.updateMany({ where: { accountId }, data: { name: null, person: null, line: null, href: null, img: null } });
    if (creatorIds.length) await tx.bankAccount.updateMany({ where: { creatorId: { in: creatorIds } }, data: { accountNumber: null } });
    await tx.business.updateMany({ where: { accountId }, data: { ownerName: null, person: null, business: null, name: null, brand: Prisma.DbNull } });
    if (businessIds.length) {
      // RR3: the business's record of the client (name, contact) goes at once; a sent client wish still in its term keeps its words until the term ends.
      await tx.clientWish.updateMany({ where: inBusiness, data: { from: null, client: null } });
      // A record with a wish (ZB3) follows that wish: kept while the wish plays, blanked at once when the wish is erased now. A record with
      // no wish (a reveal) keeps its own term.
      const keptDue = new Map(sentForClient.map((w) => [w.id, w.status === "live" ? w.endsAt : new Date((w.opensAt ?? now).getTime() + UNOPENED_DAYS * 86_400_000)] as const));
      const rows = await tx.clientWish.findMany({ where: inBusiness, select: { id: true, wishId: true, sentAt: true, endsAt: true, wish: true } });
      // EA4: a reveal sent from the Vault ends where its link ends (the owner's end day), unless the link was switched off.
      const links = await tx.$queryRaw<{ wishId: string; endsAt: Date | null }[]>`
        SELECT "wishId"::text AS "wishId", "endsAt" FROM reveal_access WHERE "businessId" = ANY(${businessIds}::uuid[]) AND "wishId" IS NOT NULL AND "offAt" IS NULL`;
      const linkEnds = new Map(links.map((l) => [l.wishId, l.endsAt] as const));
      const playing: { id: string; endsAt: Date }[] = [];
      for (const c of rows) {
        const ends = c.endsAt ?? linkEnds.get(c.id) ?? null;
        const due = c.wishId ? keptDue.get(c.wishId) ?? null : c.sentAt && ends && ends > now && c.wish !== null ? ends : null;
        if (due) playing.push({ id: c.id, endsAt: due });
      }
      const notPlaying = { ...inBusiness, id: { notIn: playing.map((c) => c.id) } };
      await tx.clientWish.updateMany({ where: notPlaying, data: { wish: null } });
      // EA4: a reveal's words (name, note, credits) follow the same term: gone at once for a record not playing, at the end of its term for one that is.
      await blankRevealWords(tx, (await tx.clientWish.findMany({ where: notPlaying, select: { id: true } })).map((c) => c.id));
      for (const c of playing) await this.jobs.schedule("erase-now", c.endsAt, `${CLIENT_WISH_PREFIX}${c.id}`, tx);
      // RR3: closing the business: its logins can no longer act.
      await tx.login.updateMany({ where: inBusiness, data: { contact: null, status: "removed" } });
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
    await tx.supportThread.updateMany({ where: { accountId }, data: { contact: "", subject: "", body: null, text: null, name: null } });
    if (wishIds.length) {
      await tx.qrCard.updateMany({ where: { wishId: { in: wishIds } }, data: { names: Prisma.DbNull } });
      await tx.publishedWish.updateMany({ where: { wish: { in: wishIds } }, data: { forName: null, from: null, name: null } });
    }
    // Every wish transition is recorded (wish lifecycle declaration); ids are UUIDv7 made here, one per wish that moves.
    const moving = await tx.wish.findMany({ where: { id: { in: wishIds }, status: { not: "removed" } }, select: { id: true, status: true } });
    if (moving.length) {
      await tx.wishTransition.createMany({
        data: moving.map((w) => ({ id: this.ids.id(), wishId: w.id, from: w.status, to: "removed", cause: "account.erase", createdAt: now })),
      });
    }
    await tx.wish.updateMany({ where: { id: { in: wishIds }, removedAt: null }, data: { removedAt: now } });
    await tx.wish.updateMany({
      where: { id: { in: wishIds } },
      data: {
        name: null, content: Prisma.DbNull, passcodeHash: null, makerNote: Prisma.DbNull,
        status: "removed", erasedAt: now,
      },
    });
    // X10: the wishes' public links answer "gone" (the link row stays as a key; it is no longer active).
    if (wishIds.length) await tx.wishLink.updateMany({ where: { wishId: { in: wishIds } }, data: { active: false } });
    // VV2: no name stays in a link: the slug's name is cut off and the openings are deleted (the same step an erase of one wish takes).
    if (wishIds.length) {
      await tx.$executeRaw`UPDATE wish_link SET slug = substr(slug, strpos(slug, '-') + 1) WHERE "wishId" = ANY(${wishIds}::uuid[]) AND strpos(slug, '-') > 0 AND length(slug) - strpos(slug, '-') >= 8`;
      await tx.wishOpen.deleteMany({ where: { wishId: { in: wishIds } } });
    }
    // INT-3 (J1): the erased wishes' waiting jobs go (nothing may open, rest or notify an erased wish), and the files they named are
    // no longer named (the files themselves go with the account's file job below).
    if (wishIds.length) {
      await tx.job.deleteMany({ where: { subjectId: { in: wishIds }, type: { in: [...WISH_JOB_KINDS] }, status: "scheduled" } });
      // A login's wish in the business is not covered by the owner's file job: each file no other wish names gets its own cleanup (safe to repeat).
      const files = [...new Set((await tx.wishFile.findMany({ where: { wishId: { in: wishIds } }, select: { fileId: true } })).map((r) => r.fileId))];
      await tx.wishFile.deleteMany({ where: { wishId: { in: wishIds } } });
      for (const fileId of files) await this.jobs.schedule("upload-cleanup", now, `${ERASE_WISH_FILE_PREFIX}${fileId}`, tx);
    }
    // SS1: every wish of the account leaves the public list tables (published row and asks), with its saves and day picks.
    await this.showing.showing.dropForAccount(tx, accountId);
    await this.showing.showing.dropForWishes(tx, allWishes.map((w) => w.id));
    // RR3: the kept client wishes are erased when their term ends (never rest a year): nothing rests them, nothing notifies a gone owner.
    for (const w of sentForClient) {
      await this.jobs.cancel("rest-wish", w.id, tx);
      await this.jobs.cancel("send-notice", w.id, tx);
      const due = w.status === "live" ? w.endsAt : new Date((w.opensAt ?? now).getTime() + UNOPENED_DAYS * 86_400_000);
      if (due) await this.jobs.schedule("erase-now", due, w.id, tx);
    }
    // BB6: every saved list drops the wishes (a feed row's id too); the account's own saved rows go with it.
    await this.savedWishes.forgetForWishes(tx, allWishes.map((w) => w.id));
    await tx.savedWish.deleteMany({ where: { accountId } });
    // X10: the account's stored files are removed after this commits: one job row now, the storage calls by the cleanup handler (Y4).
    await this.fileJobs.removeAccountFiles(accountId, tx);
    // B15: Studio drafts and settings go; a live style stays (T-62).
    await this.studio.forget(tx, accountId);
    await tx.follow.deleteMany({ where: { accountId } });
    if (handle) await tx.follow.deleteMany({ where: { handle } });
  }
}
