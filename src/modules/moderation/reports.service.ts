import { HOUSE_WORDS, isHouseWish } from "../wishes/house";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError } from "../../common/errors/app-error";
import { canonicalEmail, normaliseEmail } from "../../common/normalise/email";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor, Page } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { Report } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { NoticesService } from "../notices/notices.service";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { JobsService } from "../jobs/jobs.service";
import { ShowingService } from "../showing/showing.service";
import { WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { outOfSight, stateOf } from "../wishes/wish-state";
import { activeBanScopes, REPORT_HOURS, UPHELD_LIMIT } from "./ban-rules";
import { BansService } from "./bans.service";
import { ReportLimits, TAKE_DOWN_CODES_PER_EMAIL_PER_DAY } from "./report-limits";

type Tx = Prisma.TransactionClient;
type Obj = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,31}$/;
const HOUR_MS = 60 * 60 * 1000;
const REASONS = ["abuse", "child", "copyright", "other"] as const;
const NOTE_MAX = 1000;
/** The take-down code: 6 digits, 10 minutes, 5 tries, like the sign-in code. */
const CODE_MINUTES = 10;
const CODE_TRIES = 5;

interface LinkedWish {
  id: string;
  accountId: string;
}

/** Report: what anyone says about a public wish or a link, "This is me, take it down" (E-133), and the staff decision on both. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly limits: ReportLimits,
    private readonly bans: BansService,
    private readonly showing: ShowingService,
    private readonly lifecycle: WishLifecycleService,
    private readonly jobs: JobsService,
    private readonly notices: NoticesService,
    private readonly signed: SignedUrlsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---- the public side ----------------------------------------------------------------------------------------------

  /** E-151: anyone, signed in or not, reports a public wish or a link. 10 a day per address. */
  async create(body: { slug: string; reason: string; note?: string }, address: string | null): Promise<Obj> {
    const fields: Record<string, string> = {};
    if (!(REASONS as readonly string[]).includes(body.reason)) fields.reason = "Choose abuse, child, copyright or other.";
    const note = (body.note ?? "").trim();
    if (note.length > NOTE_MAX) fields.note = `Use ${NOTE_MAX} characters or fewer.`;
    if (Object.keys(fields).length) throw AppError.validation(fields);
    await this.limits.take("report", address);
    const id = this.ids.id();
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      const w = await this.wishAt(tx, body.slug);
      await tx.report.create({
        data: { id, wishId: w.id, accountId: w.accountId, reason: body.reason as (typeof REASONS)[number], status: "open", slug: body.slug, note: note || null, createdAt: now },
      });
    });
    return this.publicWire(id, body.slug, body.reason, now);
  }

  /**
   * E-133: "This is me, take it down". Without `code` it mails a code to the address (through the notices path) and nothing is
   * reported yet. With the code it makes the report, a kind of its own that goes to the take-down queue with its 24 hours.
   * The answer never says whether the address is the wish's owner's.
   */
  async thisIsMe(slug: string, body: { contact: string; code?: string }, address: string | null): Promise<Obj> {
    const email = normaliseEmail(body.contact ?? "");
    if (!email) throw AppError.validation({ contact: "Give the email address you can read." });
    if (body.code !== undefined && !/^\d{6}$/.test(body.code.trim())) throw AppError.validation({ code: "The code is 6 digits." });
    if (body.code === undefined) return this.sendCode(slug, email, address);
    const code = body.code.trim();
    const now = this.clock.now();
    const out = await this.db.$transaction(async (tx) => {
      const w = await this.wishAt(tx, slug);
      const rows = await tx.$queryRaw<{ id: string; codeHash: string; tries: number }[]>`
        SELECT id::text AS id, "codeHash", tries FROM take_down_code
         WHERE "wishId" = ${w.id}::uuid AND email = ${email} AND "usedAt" IS NULL AND "expiresAt" > ${now}
         ORDER BY "createdAt" DESC, id DESC LIMIT 1 FOR UPDATE`;
      const c = rows[0];
      if (!c || c.tries >= CODE_TRIES) return { kind: "dead" as const };
      if (!this.matches(c.codeHash, w.id, email, code)) {
        await tx.$executeRaw`UPDATE take_down_code SET tries = tries + 1 WHERE id = ${c.id}::uuid`;
        return { kind: "wrong" as const, left: CODE_TRIES - c.tries - 1 };
      }
      await tx.$executeRaw`DELETE FROM take_down_code WHERE "wishId" = ${w.id}::uuid AND email = ${email}`;
      const open = await tx.report.findFirst({ where: { wishId: w.id, reason: "this_is_me", reporterContact: email, status: "open" }, select: { id: true, createdAt: true } });
      if (open) return { kind: "ok" as const, id: open.id, at: open.createdAt };
      const id = this.ids.id();
      await tx.report.create({
        data: { id, wishId: w.id, accountId: w.accountId, reason: "this_is_me", reporterContact: email, contact: email, status: "open", slug, createdAt: now },
      });
      return { kind: "ok" as const, id, at: now };
    });
    if (out.kind === "wrong") {
      if (out.left <= 0) throw new AppError(HttpStatus.BAD_REQUEST, "code_wrong", "That code is not right. No tries are left. Ask for a new one.");
      throw new AppError(HttpStatus.BAD_REQUEST, "code_wrong", `That code is not right. ${out.left} ${out.left === 1 ? "try" : "tries"} left.`);
    }
    if (out.kind !== "ok") throw this.codeDead();
    return this.publicWire(out.id, slug, "this-is-me", out.at);
  }

  private codeDead(): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, "code_expired", "That code has run out. Ask for a new one.");
  }

  private async sendCode(slug: string, email: string, address: string | null): Promise<Obj> {
    await this.limits.take("take-down", address);
    // B13: a code is mailed to a typed address, so one address is also limited on its own, whoever asks and from wherever.
    await this.limits.take("take-down-email", canonicalEmail(email) ?? email, TAKE_DOWN_CODES_PER_EMAIL_PER_DAY); // a+1@ and a+2@ are one mailbox
    const now = this.clock.now();
    const id = this.ids.id();
    const code = this.codes.digits(6);
    const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60_000);
    const delivery = await this.db.$transaction(async (tx) => {
      const w = await this.wishAt(tx, slug);
      await tx.$executeRaw`DELETE FROM take_down_code WHERE "expiresAt" < ${new Date(now.getTime() - HOUR_MS)} OR ("wishId" = ${w.id}::uuid AND email = ${email})`;
      await tx.$executeRaw`
        INSERT INTO take_down_code (id, "wishId", email, "codeHash", tries, "expiresAt", "createdAt")
        VALUES (${id}::uuid, ${w.id}::uuid, ${email}, ${this.hash(w.id, email, code)}, 0, ${expiresAt}, ${now})`;
      return this.notices.send(tx, { template: "code", toEmail: email, data: { code }, key: `take-down-code:${id}` });
    });
    if (delivery.deliveryId) await this.notices.deliverNow(delivery.deliveryId);
    return { sent: true, expiresAt: toWireInstant(expiresAt) };
  }

  private hash(wishId: string, email: string, code: string): string {
    return createHmac("sha256", this.env.AUTH_CODE_PEPPER).update(`take-down:${wishId}:${email}:${code}`).digest("hex");
  }

  private matches(stored: string, wishId: string, email: string, code: string): boolean {
    const a = Buffer.from(stored);
    const b = Buffer.from(this.hash(wishId, email, code));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** The wish a link points at; an unknown link, a draft and a wish that is already gone are the same 404. */
  private async wishAt(tx: Tx, slug: string): Promise<LinkedWish> {
    const none = AppError.notFound("No wish is at this link.");
    if (!SLUG.test(slug)) throw none;
    const rows = await tx.$queryRaw<(LinkedWish & { status: string; erasedAt: Date | null })[]>`
      SELECT w.id::text AS id, w."accountId"::text AS "accountId", w.status::text AS status, w."erasedAt"
        FROM wish_link l JOIN wish w ON w.id = l."wishId" WHERE l.slug = ${slug}`;
    const w = rows[0];
    if (!w || w.status === "draft" || w.status === "removed" || w.erasedAt) throw none;
    // HU2: a house wish is the house's own sample: nothing is reported about it
    if (await isHouseWish(tx, w.id)) throw AppError.conflict("house_wish", HOUSE_WORDS);
    return w;
  }

  /** What the person who reported is told: the report, its clock, and nothing about the account. */
  private publicWire(id: string, slug: string, reason: string, at: Date): Obj {
    const due = new Date(at.getTime() + REPORT_HOURS * HOUR_MS);
    return { id, slug, reason, status: "open", queue: reason === "this-is-me" ? "takedown" : "report", at: toWireInstant(at), createdAt: toWireInstant(at), dueAt: toWireInstant(due) };
  }

  // ---- staff ------------------------------------------------------------------------------------------------------

  /**
   * E-150: take down, keep, or ban the account. One decision per report (the row is locked; the second is 409 not_allowed), one
   * audit row. Take down moves the wish through the lifecycle in this same transaction, so it leaves every list and its link
   * answers gone. Ban also ends the account's sessions and removes its listings for good. Three upheld reports against one
   * account remove its right to publish.
   */
  async decide(id: string, body: { decision: "take_down" | "keep" | "ban"; reason?: string }, actor: AuditActor): Promise<Report> {
    const reason = requireReason(body.reason);
    if (!UUID.test(id)) throw AppError.notFound("No such report.");
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM report WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw AppError.notFound("No such report.");
      const r = await tx.report.findUniqueOrThrow({ where: { id } });
      if (r.status !== "open") throw AppError.conflict("not_allowed", "This report was already decided.");
      const now = this.clock.now();
      let erased = false;
      if (r.accountId) erased = !!(await lockAccount(tx, r.accountId, { allowErased: true })).erasedAt;
      if (body.decision !== "keep") {
        if (body.decision === "take_down" && !r.wishId) throw AppError.conflict("not_allowed", "This report names no wish to take down.");
        if (body.decision === "ban" && !r.accountId) throw AppError.conflict("not_allowed", "This report names no account to ban.");
        if (r.wishId) {
          const w = await this.lifecycle.lock(tx, r.wishId);
          if (!outOfSight(stateOf(w)) && stateOf(w) !== "erased") await this.lifecycle.move(tx, w, "taken_down", { cause: `report:${r.id}` });
          else if (stateOf(w) === "taken_down") {
            // IF4a: an upheld report on a wish its owner removed makes the removal the staff's take-down: it is not erased at the owner's day and the owner cannot bring it back
            const last = await tx.wishTransition.findFirst({ where: { wishId: r.wishId, to: "taken_down" }, orderBy: { id: "desc" } });
            if (last?.cause === "owner.remove") {
              await tx.wishTransition.create({ data: { id: this.ids.id(), wishId: r.wishId, from: last.from, to: "taken_down", cause: `report:${r.id}`, createdAt: now } });
              await tx.wish.update({ where: { id: r.wishId }, data: { restorableUntil: null } });
              await this.jobs.cancel("restore-window-end", r.wishId, tx);
            }
          }
          await this.showing.dropForWishes(tx, [r.wishId]);
        }
        if (body.decision === "ban" && r.accountId && !erased) {
          if (!(await activeBanScopes(tx, r.accountId, now)).includes("account")) await this.bans.apply(tx, r.accountId, "account", actor.id ?? "staff", reason);
        }
      }
      await tx.report.update({
        where: { id }, data: { status: body.decision === "keep" ? "dismissed" : "upheld", decision: body.decision, decidedBy: actor.id, decidedAt: now },
      });
      // IF4a: a dismissed report on a removed wish whose day has passed: the wish is erased now
      if (body.decision === "keep" && r.wishId) await this.lifecycle.eraseRemovedIfDue(tx, r.wishId, "report.dismissed");
      await tx.$executeRaw`INSERT INTO moderation_decision (subject, "subjectId", reason, "decidedAt") VALUES ('report', ${id}::uuid, ${reason}, ${now})`;
      await this.audit.write(tx, {
        actor, section: "/admin/moderation", action: `report.${body.decision}`, target: { type: "Report", id }, reason, changedFields: ["status", "decision", "decidedBy", "decidedAt"],
      });
      if (body.decision !== "keep" && r.accountId && !erased) await this.removeRightToPublish(tx, r.accountId, now, actor);
    });
    return (await this.wire([id], "report"))[0] as unknown as Report;
  }

  /** Three upheld reports against one account remove its right to publish (a publishing ban made by the system). */
  private async removeRightToPublish(tx: Tx, accountId: string, now: Date, actor: AuditActor): Promise<void> {
    const upheld = await tx.report.count({ where: { accountId, status: "upheld" } });
    if (upheld < UPHELD_LIMIT) return;
    if ((await activeBanScopes(tx, accountId, now)).length) return;
    const why = "Three reports against this account were upheld.";
    await this.bans.apply(tx, accountId, "publishing", "system", why);
    await this.audit.write(tx, {
      actor: { type: "system", id: null, requestId: actor.requestId }, section: "/admin/moderation", action: "ban.auto",
      target: { type: "Account", id: accountId }, reason: why, changedFields: ["scope"],
    });
  }

  /** E-149: the three queues in one list, oldest first: reports, flagged photos (from the files bundle's queue), take-down asks. */
  async list(q: { cursor?: string; limit?: number }, staff?: { actor: AuditActor; roles: readonly string[] }): Promise<Page<Report>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let after = Prisma.empty;
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (typeof c.key !== "number" || !UUID.test(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = Prisma.sql`WHERE (u.ms, u.id) > (${c.key}, ${c.id})`;
    }
    const rows = await this.db.$queryRaw<{ src: "report" | "flagged"; id: string; ms: bigint }[]>`
      SELECT * FROM (
        SELECT 'report' AS src, r.id::text AS id, floor(extract(epoch FROM r."createdAt") * 1000)::bigint AS ms FROM report r WHERE r.status = 'open'
        UNION ALL
        SELECT 'flagged', s.id::text, floor(extract(epoch FROM s."createdAt") * 1000)::bigint FROM screening_result s WHERE s.verdict = 'review' AND s."finalVerdict" IS NULL
      ) u ${after} ORDER BY u.ms, u.id LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const reports = await this.wire(page.filter((r) => r.src === "report").map((r) => r.id), "report");
    const flagged = await this.wire(page.filter((r) => r.src === "flagged").map((r) => r.id), "flagged");
    const byId = new Map([...reports, ...flagged].map((i) => [i.id as string, i]));
    const last = page[limit - 1];
    const items = page.map((r) => byId.get(r.id)).filter((i): i is Obj => !!i);
    await this.addHeldPhotos(items, staff);
    return {
      items: items as unknown as Report[],
      nextCursor: rows.length > limit && last ? encodeCursor({ key: Number(last.ms), id: last.id }) : null,
    };
  }

  /** The counts the Overview shows: open reports, flagged photos, take-down asks, and how many of them are late. */
  async counts(): Promise<{ reports: number; flagged: number; takedowns: number; late: number }> {
    const due = new Date(this.clock.now().getTime() - REPORT_HOURS * HOUR_MS);
    const [row] = await this.db.$queryRaw<{ reports: bigint; flagged: bigint; takedowns: bigint; late: bigint }[]>`
      SELECT (SELECT count(*) FROM report WHERE status = 'open' AND reason <> 'this-is-me') AS reports,
             (SELECT count(*) FROM screening_result WHERE verdict = 'review' AND "finalVerdict" IS NULL) AS flagged,
             (SELECT count(*) FROM report WHERE status = 'open' AND reason = 'this-is-me') AS takedowns,
             ((SELECT count(*) FROM report WHERE status = 'open' AND "createdAt" < ${due})
              + (SELECT count(*) FROM screening_result WHERE verdict = 'review' AND "finalVerdict" IS NULL AND "createdAt" < ${due})) AS late`;
    return { reports: Number(row.reports), flagged: Number(row.flagged), takedowns: Number(row.takedowns), late: Number(row.late) };
  }

  /**
   * HP12: a flagged item gets heldPhoto {url, expiresAt}, a signed read good for ten minutes, so the moderator can see the photo they
   * judge. Only moderator, ops and owner get it (anyone else, and an item that is not a photo, gets null); each read is an audit row
   * (field names only, never the url).
   */
  private async addHeldPhotos(items: Obj[], staff?: { actor: AuditActor; roles: readonly string[] }): Promise<void> {
    const may = !!staff && staff.roles.some((r) => r === "moderator" || r === "ops" || r === "owner");
    for (const it of items) {
      it.heldPhoto = null;
      if (!may || !staff || it.queue !== "flagged" || typeof it.photo !== "string") continue;
      let read;
      try {
        read = await this.signed.signedPhoto({ fileId: it.photo }, { type: "staff" });
      } catch (e) {
        if (e instanceof AppError && e.getStatus() === 404) continue;
        throw e;
      }
      await this.db.$transaction((tx) =>
        this.audit.write(tx, { actor: staff.actor, section: "/admin/moderation", action: "moderation.view-photo", target: { type: "StoredFile", id: it.photo as string }, reason: null, changedFields: ["heldPhoto"] }),
      );
      it.heldPhoto = { url: read.read.url, expiresAt: read.read.expiresAt, ...(read.variants ? { variants: read.variants } : {}) }; // IM4
    }
  }

  /** Staff wire for reports and flagged photos, in the order of `ids`. */
  private async wire(ids: string[], kind: "report" | "flagged"): Promise<Obj[]> {
    if (!ids.length) return [];
    const now = this.clock.now();
    if (kind === "flagged") {
      const rows = await this.db.$queryRaw<{ id: string; createdAt: Date; fileId: string; accountId: string | null; name: string | null }[]>`
        SELECT s.id::text AS id, s."createdAt", s."fileId"::text AS "fileId", f."ownerAccountId"::text AS "accountId", a.name
          FROM screening_result s JOIN stored_file f ON f.id = s."fileId" LEFT JOIN account a ON a.id = f."ownerAccountId" WHERE s.id = ANY(${ids}::uuid[])`;
      const by = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => by.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => this.shape({
        id: r.id, queue: "flagged", reason: "other", status: "open", createdAt: r.createdAt, accountId: r.accountId, photo: r.fileId, what: "A photo held by screening",
        who: r.name ?? "", wishId: null, wishState: "", slug: "", note: "", contact: "", forName: "", from: "", decided: null, decision: null, decidedAt: null, decidedBy: null,
      }, now));
    }
    const rows = await this.db.$queryRaw<{ id: string; wishId: string | null; accountId: string | null; reason: string; status: string; createdAt: Date; slug: string | null; note: string | null; reporterContact: string | null; decision: string | null; decidedAt: Date | null; decidedBy: string | null; wishNo: string | null; wishName: string | null; wishKind: string | null; wishStatus: string | null; wishErased: Date | null; accountName: string | null; dReason: string | null }[]>`
      SELECT r.id::text AS id, r."wishId"::text AS "wishId", r."accountId"::text AS "accountId", r.reason::text AS reason, r.status::text AS status, r."createdAt", r.slug, r.note,
             r."reporterContact", r.decision::text AS decision, r."decidedAt", r."decidedBy"::text AS "decidedBy", w.no AS "wishNo", w.name AS "wishName", w.kind AS "wishKind",
             w.status::text AS "wishStatus", w."erasedAt" AS "wishErased", a.name AS "accountName", d.reason AS "dReason"
        FROM report r LEFT JOIN wish w ON w.id = r."wishId" LEFT JOIN account a ON a.id = r."accountId"
        LEFT JOIN moderation_decision d ON d.subject = 'report' AND d."subjectId" = r.id
       WHERE r.id = ANY(${ids}::uuid[])`;
    const by = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => by.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => this.shape({
      id: r.id, queue: r.reason === "this-is-me" ? "takedown" : "report", reason: r.reason, status: r.status, createdAt: r.createdAt, accountId: r.accountId, photo: null,
      what: r.note || (r.reason === "this-is-me" ? "Asked for this wish to come down" : `Reported as ${r.reason}`), who: r.accountName ?? "",
      wishId: r.wishId, wishState: r.wishStatus ? stateOf({ status: r.wishStatus, erasedAt: r.wishErased }) : "", slug: r.slug ?? "", note: r.note ?? "",
      contact: r.reporterContact ?? "", reporterContact: r.reporterContact, forName: r.wishName ?? "", from: r.accountName ?? "", whoLine: r.wishKind ? `${r.wishKind} wish${r.wishNo ? ` ${r.wishNo}` : ""}` : "",
      decision: r.decision, decidedAt: r.decidedAt, decidedBy: r.decidedBy, decided: r.decision && r.decidedAt ? { decision: r.decision, at: toWireInstant(r.decidedAt), by: r.decidedBy, reason: r.dReason ?? "" } : null,
    }, now));
  }

  private shape(r: { id: string; queue: string; reason: string; status: string; createdAt: Date; accountId: string | null; photo: string | null; what: string; who: string; wishId: string | null; wishState: string; slug: string; note: string; contact: string; reporterContact?: string | null; forName: string; from: string; whoLine?: string; decision: string | null; decidedAt: Date | null; decidedBy: string | null; decided: Obj | null }, now: Date): Obj {
    const due = new Date(r.createdAt.getTime() + REPORT_HOURS * HOUR_MS);
    const open = r.status === "open";
    const at = toWireInstant(r.createdAt);
    return {
      id: r.id, queue: r.queue, reason: r.reason, status: r.status, at, createdAt: at, dueAt: toWireInstant(due), late: open && now.getTime() > due.getTime(),
      minutesLeft: open ? Math.max(0, Math.ceil((due.getTime() - now.getTime()) / 60_000)) : 0, accountId: r.accountId, personId: "", wishId: r.wishId,
      wishState: r.wishState, slug: r.slug, note: r.note, contact: r.contact, reporterContact: r.reporterContact ?? null, what: r.what, who: r.who,
      whoLine: r.whoLine ?? "", forName: r.forName, from: r.from, photo: r.photo, decision: r.decision, decided: r.decided,
      decidedAt: r.decidedAt ? toWireInstant(r.decidedAt) : null, decidedBy: r.decidedBy,
    };
  }
}
