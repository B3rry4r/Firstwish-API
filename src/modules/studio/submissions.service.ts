import { HttpStatus, Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { PostAdminStylesReviewByIdDecideBody, StyleSubmission, SubmissionView } from "../../contracts";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { JobsService, type JobContext, type JobResult } from "../jobs/jobs.service";
import { type StudioEntry, StylesService } from "../styles/styles.service";
import { CreatorStateService } from "./creator-state.service";
import { allPass, CHECK_KEYS, fileIdsOf, runChecks, type CheckResult, type Manifest, type UsedFile } from "./submission-checks";
import { EDITABLE, isObj, json, metaOf, obj, arr, UUID, type Obj } from "./studio-doc";
import { StudioStylesService } from "./studio-styles.service";

type Tx = Prisma.TransactionClient;

/** The job kind the checks run under (the registry's jobs list has no kind of its own for them) and the prefix of their subject keys. */
export const CHECK_JOB_KIND = "style-level-review";
export const CHECK_PREFIX = "check:";
const notAllowed = (message: string) => AppError.conflict("not_allowed", message);

/** Sending a style in, its eight checks, and staff review (StyleSubmission, DEC-65). */
@Injectable()
export class SubmissionsService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly state: CreatorStateService,
    private readonly drafts: StudioStylesService,
    private readonly styles: StylesService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  /** Not in tests (specs share one database: an app that handled the kind would run another spec's jobs); a spec calls registerAll(). */
  onModuleInit(): void {
    if (process.env.NODE_ENV !== "test") this.registerAll();
  }

  registerAll(): void {
    this.jobs.registerSubject(CHECK_JOB_KIND, CHECK_PREFIX, (c) => this.runCheckJob(c));
  }

  // ------------------------------------------------------------------ submit (E-202)

  /**
   * The draft is frozen as a snapshot, a review is taken (this month's, then a bought extra one, else 402), and the eight checks
   * are scheduled as a job. A second submit of a style that already waits is 409.
   */
  async submit(accountId: string, id: string, body: { style?: unknown; styleId?: string; useExtra?: boolean }): Promise<unknown> {
    if (!UUID.test(id)) throw AppError.notFound("No style has this id.");
    if (body.styleId !== undefined && body.styleId !== id) throw AppError.validation({ styleId: "Must be the style in the address." });
    try {
      return await this.db.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const row = await this.drafts.lockOwn(tx, accountId, id);
        if (row.status === "review") throw AppError.conflict("already_submitted", "This style is already waiting for review.");
        if (!EDITABLE.includes(row.status ?? "")) throw AppError.conflict("not_allowed", "A live style is taken back before it is sent in again.");
        const doc = obj(row.document);
        const meta = metaOf(doc);
        const sent = isObj(body.style) ? body.style.version : undefined;
        if (sent !== undefined && sent !== meta.version) throw AppError.conflict("stale_version", "This style was saved somewhere else since you opened it. Open it again.");
        const creator = await tx.creator.findUnique({ where: { accountId }, select: { id: true } });
        if (!creator) throw AppError.forbidden("Set up your creator profile first.");
        const used = await this.state.takeReview(tx, accountId);
        const now = this.clock.now();
        const account = await tx.account.findUnique({ where: { id: accountId }, select: { handle: true } });
        await this.styles.holdStudioStyle(tx, entryOf(id, doc, account?.handle ?? "", meta.byline, creator.id, await this.templateCreator(tx, doc)));
        const last = await tx.styleSubmission.aggregate({ where: { styleId: id }, _max: { version: true } });
        const submissionId = this.ids.id();
        const frozen = { ...doc, useExtra: used === "extra" };
        await tx.styleSubmission.create({ data: { id: submissionId, styleId: id, creatorId: creator.id, version: (last._max.version ?? 0) + 1, checks: [], status: "review" } });
        await tx.$executeRaw`
          INSERT INTO style_submission_snapshot (id, "submissionId", "accountId", document, used)
          VALUES (${this.ids.id()}::uuid, ${submissionId}::uuid, ${accountId}::uuid, ${JSON.stringify(frozen)}::jsonb, ${used})`;
        const saved = await tx.studioStyle.update({
          where: { id },
          data: { status: "review", submittedAt: now, document: json({ ...doc, useExtra: used === "extra", version: meta.version + 1, at: toWireInstant(now) }) },
        });
        await this.jobs.schedule(CHECK_JOB_KIND, now, `${CHECK_PREFIX}${submissionId}`, tx);
        const sub = await tx.styleSubmission.findUniqueOrThrow({ where: { id: submissionId } });
        const [wire] = await this.drafts.wire(tx, [saved]);
        return { ...wire, submission: this.drafts.submissionWire(sub, 1) };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw AppError.conflict("already_submitted", "This style is already waiting for review.");
      throw e;
    }
  }

  // ------------------------------------------------------------------ the checks (a job)

  /** Runs the eight checks over the snapshot and stores each result. A style that fails one goes back to its creator with the reasons. */
  async runCheckJob(c: JobContext): Promise<JobResult> {
    const submissionId = c.subjectId.slice(CHECK_PREFIX.length);
    if (!UUID.test(submissionId)) return { skipped: true };
    const snap = await this.db.styleSubmissionSnapshot.findUnique({ where: { submissionId }, select: { accountId: true, document: true, used: true } });
    if (!snap) return { skipped: true };
    const accountId = snap.accountId;
    const document = obj(snap.document);
    const used = snap.used as "plan" | "extra";
    const ids = fileIdsOf(document);
    const files = new Map<string, UsedFile>();
    if (ids.length) {
      for (const f of await this.db.storedFile.findMany({ where: { id: { in: ids }, ownerAccountId: accountId, status: "ready" } })) files.set(f.id, { id: f.id, kind: f.kind, bytes: Number(f.bytes) });
    }
    const checks = runChecks(document, files, { base: await this.manifestOf(document.base), fallback: await this.manifestOf(document.fallback) });
    let passed = false;
    const known = await this.db.styleSubmission.findUnique({ where: { id: submissionId }, select: { styleId: true } });
    if (!known) return { skipped: true };
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.lockStudio(tx, known.styleId);
      const rows = await tx.$queryRaw<{ id: string; styleId: string; status: string }[]>`
        SELECT id::text AS id, "styleId"::text AS "styleId", status::text AS status FROM style_submission WHERE id = ${submissionId}::uuid FOR UPDATE`;
      const sub = rows[0];
      if (!sub || sub.status !== "review") return;
      passed = allPass(checks);
      if (passed) {
        await tx.styleSubmission.update({ where: { id: sub.id }, data: { checks: checks as unknown as Prisma.InputJsonArray } });
        return;
      }
      const failed = checks.filter((k) => !k.pass).map((k) => k.detail).join(" ");
      await tx.styleSubmission.update({
        where: { id: sub.id },
        data: { checks: checks as unknown as Prisma.InputJsonArray, status: "returned", decision: "return", note: `The checks found something to fix. ${failed}`.slice(0, 1000) },
      });
      const style = await tx.studioStyle.findUnique({ where: { id: sub.styleId } });
      if (style && style.status === "review") {
        const doc = obj(style.document);
        await tx.studioStyle.update({ where: { id: style.id }, data: { status: "returned", document: json({ ...doc, version: metaOf(doc).version + 1, at: toWireInstant(this.clock.now()) }) } });
      }
      await this.state.giveReviewBack(tx, accountId, used);
    });
    return { changed: { submissionId, passed, failed: checks.filter((k) => !k.pass).map((k) => k.key) } };
  }

  /** A scene set as the checks read it: its Template row (kinds, dimension) and the occasions its catalogue Style names; undefined when there is none. */
  private async manifestOf(slug: unknown): Promise<Manifest | undefined> {
    if (typeof slug !== "string" || !slug.trim()) return undefined;
    const base = slug.trim();
    const t = await this.db.template.findFirst({ where: { base }, select: { kinds: true, dimension: true } });
    if (!t) return undefined;
    const st = await this.db.style.findUnique({ where: { slug: base }, select: { occasions: true } });
    const only = obj(st?.occasions);
    const occasions: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(only)) occasions[k] = arr(v).filter((x): x is string => typeof x === "string");
    return { slug: base, dimension: t.dimension ?? "flat", kinds: arr(t.kinds).filter((x): x is string => typeof x === "string"), occasions: st?.occasions ? occasions : null };
  }

  // ------------------------------------------------------------------ staff review (E-200, E-201)

  /** E-200: the queue: submissions whose eight checks passed and that wait for review, oldest first. */
  async queue(q: { cursor?: string; limit?: number }): Promise<Page<SubmissionView>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let after = "00000000-0000-0000-0000-000000000000";
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!UUID.test(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = c.id;
    }
    const keys = CHECK_KEYS.length;
    const ids = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM style_submission
       WHERE status = 'review' AND jsonb_typeof(checks) = 'array' AND jsonb_array_length(checks) = ${keys} AND id > ${after}::uuid
       ORDER BY id ASC LIMIT ${limit + 1}`;
    const page = toPage(ids, limit, (r) => ({ key: "", id: r.id }));
    return { items: await Promise.all(page.items.map((r) => this.view(r.id))), nextCursor: page.nextCursor };
  }

  /** One submission as staff see it: the style, its creator, the stored result of each check, and the frozen draft. */
  private async view(id: string): Promise<SubmissionView> {
    const sub = await this.db.styleSubmission.findUniqueOrThrow({ where: { id }, include: { creator: { include: { account: true } } } });
    const snap = await this.db.styleSubmissionSnapshot.findUnique({ where: { submissionId: id }, select: { document: true } });
    const doc = obj(snap?.document);
    const made = obj(doc.made);
    const base = typeof doc.base === "string" ? doc.base : "";
    const tpl = base ? await this.db.template.findFirst({ where: { base } }) : null;
    const state = sub.creator.accountId ? await this.db.creatorState.findUnique({ where: { accountId: sub.creator.accountId } }) : null;
    const checks: Obj = {};
    for (const k of arr(sub.checks)) {
      const o = obj(k);
      if (typeof o.key === "string") checks[o.key] = { pass: o.pass === true, detail: o.detail ?? "" };
    }
    const decided = sub.status === "review" ? null : { by: sub.reviewedBy ?? null, level: sub.level ?? null, note: sub.note ?? null, decision: sub.decision ?? null };
    return {
      id: sub.id, at: toWireInstant(sub.createdAt), baseName: tpl?.name ?? base, checks, creator: sub.creatorId,
      creatorName: sub.creator.name ?? metaOf(doc).byline, decided, handle: sub.creator.account?.handle ?? "", kinds: arr(made.kinds),
      name: typeof doc.name === "string" ? doc.name : "", plan: state?.plan ?? "open", rights: obj(doc.rights),
      still: typeof doc.still === "string" ? doc.still : "", style: sub.styleId, snapshot: doc,
    };
  }

  /**
   * E-201: approve (the style enters the catalogue as Standard unless staff say Premium: only staff set a level, T-59) or return it
   * with a reason the creator reads. The submission row is locked, so two staff at once make one 200 and one 409, and one audit row.
   */
  async decide(id: string, body: PostAdminStylesReviewByIdDecideBody, actor: AuditActor): Promise<StyleSubmission> {
    const reason = requireReason(body.reason);
    if (!UUID.test(id)) throw AppError.notFound("No submission has this id.");
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
    if (body.decision === "return" && !note && reason.length < 4) throw AppError.validation({ reason: "Say what to fix." });
    const out = await this.db.$transaction(async (tx) => {
      // SA1: one lock order everywhere: the studio style first, then the submission (a creator's withdraw takes them the same way).
      const known = await tx.styleSubmission.findUnique({ where: { id }, select: { styleId: true } });
      if (!known) throw AppError.notFound("No submission has this id.");
      const studio = await this.lockStudio(tx, known.styleId);
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM style_submission WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows[0]) throw AppError.notFound("No submission has this id.");
      const sub = await tx.styleSubmission.findUniqueOrThrow({ where: { id } });
      if (sub.status !== "review") throw notAllowed("This submission is already decided.");
      if (!allPass(arr(sub.checks) as CheckResult[])) throw notAllowed("The checks have not passed yet.");
      const snap = await tx.styleSubmissionSnapshot.findUnique({ where: { submissionId: id }, select: { accountId: true, document: true } });
      if (!snap) throw new AppError(HttpStatus.INTERNAL_SERVER_ERROR, "snapshot_missing", "This submission has no saved draft.");
      const doc = obj(snap.document);
      const now = this.clock.now();
      const staff = actor.id ? await tx.staffAccount.findUnique({ where: { id: actor.id }, select: { name: true } }) : null;
      let level: "standard" | "premium" | null = null;
      if (body.decision === "approve") {
        if (obj(doc.rights).confirmed === false) throw notAllowed("The creator has not confirmed their rights to this style.");
        level = body.level ?? "standard";
        const account = await tx.account.findUnique({ where: { id: snap.accountId }, select: { handle: true } });
        await this.styles.enterStudioStyle(tx, entryOf(sub.styleId, doc, account?.handle ?? "", metaOf(doc).byline, sub.creatorId, await this.templateCreator(tx, doc)), level, staff?.name ?? "Staff", actor.id ?? "staff", reason);
      }
      const updated = await tx.styleSubmission.update({
        where: { id },
        data: {
          status: body.decision === "approve" ? "live" : "returned", decision: body.decision, level, reviewedBy: actor.id,
          ...(body.decision === "approve" ? { approvedAt: now } : {}),
          note: body.decision === "return" ? (note ?? reason) : note,
        },
      });
      if (studio) {
        const sdoc = obj(studio.document);
        await tx.studioStyle.update({
          where: { id: studio.id },
          data: {
            status: body.decision === "approve" ? "live" : "returned", liveAt: body.decision === "approve" ? now : null,
            document: json({ ...sdoc, version: metaOf(sdoc).version + 1, at: toWireInstant(now) }),
          },
        });
      }
      await this.audit.write(tx, {
        actor, section: "/admin/styles", action: body.decision === "approve" ? "style-review.approve" : "style-review.return",
        target: { type: "StyleSubmission", id }, reason, changedFields: body.decision === "approve" ? ["status", "level"] : ["status", "note"],
      });
      return updated;
    });
    return this.drafts.submissionWire(out) as StyleSubmission;
  }

  /** WW6: the creator of the style this draft was made from, when it was made from a creator's style (a house template has none). */
  private async templateCreator(tx: Tx, doc: Obj): Promise<string | undefined> {
    const from = obj(doc.from);
    if (typeof from.id !== "string" || !UUID.test(from.id)) return undefined;
    const st = await tx.style.findUnique({ where: { id: from.id }, select: { creator: true } });
    const id = obj(st?.creator).creatorId;
    return typeof id === "string" ? id : undefined;
  }

  private async lockStudio(tx: Tx, styleId: string) {
    const hit = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM studio_style WHERE id = ${styleId}::uuid FOR UPDATE`;
    return hit[0] ? tx.studioStyle.findUnique({ where: { id: styleId } }) : null;
  }
}

/** What the catalogue needs of a Studio style, from its document. */
function entryOf(id: string, doc: Obj, handle: string, creatorName: string, creatorId: string, templateCreatorId?: string): StudioEntry {
  const made = obj(doc.made);
  const tags = obj(doc.tags);
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    id, name: s(doc.name), handle, creatorName: creatorName || handle, creatorId, ...(templateCreatorId ? { templateCreatorId } : {}), line: s(doc.brief) || s(doc.name), kinds: arr(made.kinds ?? tags.kinds),
    mood: arr(made.mood ?? tags.mood), pace: s(made.pace), orientation: s(made.orientation), dimension: s(made.dimension), moves: s(made.moves),
    light: made.light === true,
  };
}

