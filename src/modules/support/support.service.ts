import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type SupportMessage as MessageRow, type SupportThread as ThreadRow } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { normaliseEmail } from "../../common/normalise/email";
import { fullEmailOf, likeLiteral, searchWord, wishNumberOf } from "../../common/normalise/search-word";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { SavedReply, StaffHandOver, SupportMessage, SupportThread, ThreadCounts } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { NoticesService } from "../notices/notices.service";
import { RoleAccessService } from "../role-access/role-access.service";
import { EmailSuppression } from "../notices/suppression";
import { IntakeLimits } from "./intake-limits";
import { isOwnAddress, maskContact, MESSAGE_MAX, replyDomain, REPLY_LOCAL, replyToken, SUBJECT_MAX, textProblem } from "./rules";

const IDEM_KEY = /^[A-Za-z0-9._:-]{8,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SECTION = "/admin/support";
type Tx = Prisma.TransactionClient;

/** A thread with its messages, the shape E-207, E-208 and E-209 answer (the registry's ThreadDetail). */
export type ThreadDetail = SupportThread & { messages: SupportMessage[] };

interface Extras {
  name: string;
  last: string;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly notices: NoticesService,
    private readonly suppression: EmailSuppression,
    private readonly limits: IntakeLimits,
    @Inject(ENV) private readonly env: Env,
    private readonly roleAccess: RoleAccessService,
  ) {}

  // ---------- wire ----------

  private wireMessage(m: MessageRow): SupportMessage {
    return { id: m.id, threadId: m.threadId, from: m.from, body: m.body, fileIds: [...m.fileIds], createdAt: toWireInstant(m.createdAt) };
  }

  /** The thread as the wire has it. `own` shows the person their own address; staff always see it masked (case 6). */
  private wireThread(t: ThreadRow, x: Extras, own: boolean): SupportThread {
    const contact = own ? t.contact : maskContact(t.contact);
    return {
      id: t.id, accountId: t.accountId, assigneeId: t.assigneeId, body: t.body ?? "", text: t.text ?? "", contact, email: contact, name: x.name,
      createdAt: toWireInstant(t.createdAt), updatedAt: toWireInstant(t.updatedAt), last: x.last, notes: [], person: t.accountId, priority: t.priority,
      reason: "", state: t.status === "closed" ? "closed" : "open", status: t.status, subject: t.subject, wish: null, wishFor: null,
    };
  }

  private async extras(rows: ThreadRow[], db: Pick<Tx, "$queryRaw" | "account"> = this.prisma): Promise<Map<string, Extras>> {
    const out = new Map<string, Extras>();
    if (!rows.length) return out;
    const accountIds = [...new Set(rows.flatMap((r) => (r.accountId ? [r.accountId] : [])))];
    const accounts = accountIds.length ? await db.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(accounts.map((a) => [a.id, a.name ?? ""]));
    const ids = rows.map((r) => r.id);
    const lasts = await db.$queryRaw<{ threadId: string; body: string }[]>`
      SELECT DISTINCT ON ("threadId") "threadId"::text AS "threadId", body FROM support_message
      WHERE "threadId" = ANY(${ids}::uuid[]) ORDER BY "threadId", id DESC`;
    const lastBy = new Map(lasts.map((l) => [l.threadId, l.body.length > 120 ? `${l.body.slice(0, 117)}...` : l.body]));
    for (const r of rows) out.set(r.id, { name: r.accountId ? (names.get(r.accountId) ?? "") : "", last: lastBy.get(r.id) ?? "" });
    return out;
  }

  private async detail(t: ThreadRow, own: boolean, db: Pick<Tx, "$queryRaw" | "account" | "supportMessage"> = this.prisma): Promise<ThreadDetail> {
    const x = (await this.extras([t], db)).get(t.id) ?? { name: "", last: "" };
    const messages = await db.supportMessage.findMany({ where: { threadId: t.id }, orderBy: { id: "asc" } });
    return { ...this.wireThread(t, x, own), messages: messages.map((m) => this.wireMessage(m)) };
  }

  // ---------- the person ----------

  private checkNew(subject: string, body: string): { subject: string; body: string } {
    const fields: Record<string, string> = {};
    const s = textProblem(subject, SUBJECT_MAX, "subject");
    if (s) fields.subject = s;
    else if (/[\r\n]/.test(subject.trim())) fields.subject = "The subject is one line.";
    const b = textProblem(body, MESSAGE_MAX, "message");
    if (b) fields.body = b;
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { subject: subject.trim(), body: body.trim() };
  }

  private async insertThread(tx: Tx, input: { accountId: string | null; contact: string; subject: string; body: string }): Promise<ThreadRow> {
    const now = this.clock.now();
    const id = this.ids.id();
    const t = await tx.supportThread.create({
      data: { id, accountId: input.accountId, contact: input.contact, subject: input.subject, status: "open", priority: "normal", body: input.body, text: input.body, createdAt: now, updatedAt: now },
    });
    await tx.supportMessage.create({ data: { id: this.ids.id(), threadId: id, from: "customer", body: input.body, fileIds: [], createdAt: now } });
    return t;
  }

  /** E-210: a signed-in person opens a thread. The address is the account's own. */
  async open(accountId: string, subjectIn: string, bodyIn: string, ip: string | null | undefined): Promise<ThreadDetail> {
    const { subject, body } = this.checkNew(subjectIn, bodyIn);
    return this.prisma.$transaction(async (tx) => {
      const acct = await lockAccount(tx, accountId);
      const row = await tx.account.findUniqueOrThrow({ where: { id: acct.id }, select: { contact: true } });
      const contact = normaliseEmail(row.contact ?? "");
      if (!contact) throw AppError.validation({ contact: "Add an email address to your account first." });
      await this.limits.take(tx, ip, contact);
      const t = await this.insertThread(tx, { accountId: acct.id, contact, subject, body });
      return this.detail(t, true, tx);
    });
  }

  /**
   * The contact page: no sign-in, an email. A thread from an address that is an account's own joins that account's threads.
   * With an Idempotency-Key the same key and the same words is one thread (the repeat answers it again and is not counted against the limits);
   * the same key with other words is 409. The key is kept as a hash with a hash of what was sent, never as text.
   */
  async openFromContact(emailIn: string, subjectIn: string, bodyIn: string, ip: string | null | undefined, idempotencyKey?: string): Promise<{ thread: ThreadDetail; fresh: boolean }> {
    if (idempotencyKey !== undefined && !IDEM_KEY.test(idempotencyKey)) throw AppError.validation({ "Idempotency-Key": "Must be 8 to 100 letters, digits or . _ : -" });
    const email = normaliseEmail(emailIn);
    if (!email) throw AppError.validation({ email: "Give an email address we can write back to." });
    const { subject, body } = this.checkNew(subjectIn, bodyIn);
    const keyHash = idempotencyKey === undefined ? null : createHash("sha256").update(`contact:${idempotencyKey}`).digest("hex");
    const fingerprint = createHash("sha256").update(JSON.stringify([email, subject, body])).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      if (keyHash) {
        // the first to insert the key owns it; a second at the same moment waits for the first to finish, then finds it
        const made = await tx.$executeRaw`INSERT INTO support_contact_key ("keyHash", fingerprint, "createdAt") VALUES (${keyHash}, ${fingerprint}, ${this.clock.now()}) ON CONFLICT ("keyHash") DO NOTHING`;
        if (made === 0) {
          const seen = await tx.supportContactKey.findUniqueOrThrow({ where: { keyHash } });
          if (seen.fingerprint !== fingerprint) throw AppError.conflict("idempotency_key_reused", "This Idempotency-Key was already used for a different message.");
          const first = seen.threadId ? await tx.supportThread.findUnique({ where: { id: seen.threadId } }) : null;
          if (!first) throw AppError.conflict("idempotency_key_reused", "This Idempotency-Key was used for a message that is no longer here. Use a new key.");
          return { thread: await this.detail(first, true, tx), fresh: false };
        }
      }
      const accountId = await this.accountOfAddress(tx, email);
      await this.limits.take(tx, ip, email);
      const t = await this.insertThread(tx, { accountId, contact: email, subject, body });
      if (keyHash) await tx.supportContactKey.update({ where: { keyHash }, data: { threadId: t.id } });
      return { thread: await this.detail(t, true, tx), fresh: true };
    });
  }

  /** The live account that signs in with this address, locked so an erase cannot slip in, or null. */
  async accountOfAddress(tx: Tx, email: string): Promise<string | null> {
    const a = await tx.account.findFirst({ where: { contact: email, erasedAt: null }, select: { id: true } });
    if (!a) return null;
    try {
      await lockAccount(tx, a.id);
      return a.id;
    } catch {
      return null;
    }
  }

  /** E-203: a signed-in person answers in a thread of their own (another's is 404, as a query condition). A closed thread opens again. */
  async customerMessage(accountId: string, threadId: string, bodyIn: string): Promise<SupportMessage> {
    if (!UUID.test(threadId)) throw AppError.notFound();
    const problem = textProblem(bodyIn, MESSAGE_MAX, "message");
    if (problem) throw AppError.validation({ body: problem });
    return this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM support_thread WHERE id = ${threadId}::uuid AND "accountId" = ${accountId}::uuid FOR UPDATE`;
      if (!rows[0]) throw AppError.notFound();
      return this.addCustomerMessage(tx, threadId, bodyIn.trim());
    });
  }

  /** A customer message on a locked thread: stored, the thread is open again. */
  async addCustomerMessage(tx: Tx, threadId: string, body: string): Promise<SupportMessage> {
    const now = this.clock.now();
    const m = await tx.supportMessage.create({ data: { id: this.ids.id(), threadId, from: "customer", body, fileIds: [], createdAt: now } });
    await tx.supportThread.update({ where: { id: threadId }, data: { status: "open", updatedAt: now } });
    return this.wireMessage(m);
  }

  // ---------- staff ----------

  /** E-205: the numbers for the menu. */
  async counts(): Promise<ThreadCounts> {
    const rows = await this.prisma.$queryRaw<{ status: string; n: number }[]>`SELECT status::text AS status, count(*)::int AS n FROM support_thread GROUP BY status`;
    const by = (s: string): number => rows.find((r) => r.status === s)?.n ?? 0;
    const open = by("open");
    const waiting = by("waiting");
    const closed = by("closed");
    return { all: open + waiting + closed, open, waiting, closed };
  }

  /**
   * E-206: newest first; ?status= and ?assignee= narrow it, and ?q= (HY2) matches a thread's subject, the person's name, the thread's whole
   * email address (a part of an address matches nothing, so the list cannot be used to read the masked address) or a wish number of the
   * person's account. What comes back is masked as ever.
   */
  async list(limit: number, cursor: string | undefined, filter: { status?: string; assigneeId?: string; q?: string }): Promise<Page<SupportThread>> {
    const where: Prisma.SupportThreadWhereInput = {};
    const word = searchWord(filter.q);
    if (word) {
      const like = { contains: likeLiteral(word), mode: "insensitive" as const };
      const email = fullEmailOf(word);
      const no = wishNumberOf(word);
      const exact = new Set<string>();
      if (email) {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM support_thread WHERE lower(contact) = lower(${email})`;
        rows.forEach((r) => exact.add(r.id));
      }
      if (no) {
        const rows = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT t.id::text AS id FROM support_thread t JOIN wish w ON w."accountId" = t."accountId" WHERE lower(w.no) = lower(${no})`;
        rows.forEach((r) => exact.add(r.id));
      }
      where.OR = [{ subject: like }, { name: like }, { account: { name: like } }, ...(exact.size ? [{ id: { in: [...exact] } }] : [])];
    }
    if (filter.status) where.status = filter.status as ThreadRow["status"];
    if (filter.assigneeId) {
      if (!UUID.test(filter.assigneeId)) return { items: [], nextCursor: null };
      where.assigneeId = filter.assigneeId;
    }
    if (cursor) {
      const pos = decodeCursor(cursor);
      if (!UUID.test(pos.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.id = { lt: pos.id };
    }
    const rows = await this.prisma.supportThread.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    const x = await this.extras(page.items);
    return { items: page.items.map((r) => this.wireThread(r, x.get(r.id) ?? { name: "", last: "" }, false)), nextCursor: page.nextCursor };
  }

  /**
   * E-271 (HY3): the active staff a thread can be handed to (the assign check takes active staff only): id, name and role, never an email or
   * a sign-in detail. The owner's role comes first when a member holds several.
   */
  async staffToHandOver(): Promise<Page<StaffHandOver>> {
    const rows = (await this.prisma.staffAccount.findMany({ where: { status: "active" }, select: { id: true, name: true, roles: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }));
    // W14B: only a member whose role opens Support is offered (the Team access table, the same one the route guard reads); a thread never sits with someone who cannot read it
    const open: typeof rows = [];
    for (const r of rows) if (await this.roleAccess.opens(r.roles, SECTION)) open.push(r);
    const items = open.map((r): StaffHandOver => ({ id: r.id, name: r.name, role: r.roles.includes("owner") ? "owner" : (r.roles[0] ?? "") }));
    return { items, nextCursor: null };
  }

  /** E-207 */
  async get(id: string): Promise<ThreadDetail> {
    if (!UUID.test(id)) throw AppError.notFound();
    const t = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!t) throw AppError.notFound();
    return this.detail(t, false);
  }

  private async lockThread(tx: Tx, id: string): Promise<ThreadRow> {
    if (!UUID.test(id)) throw AppError.notFound();
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM support_thread WHERE id = ${id}::uuid FOR UPDATE`;
    if (!rows[0]) throw AppError.notFound();
    return tx.supportThread.findUniqueOrThrow({ where: { id } });
  }

  /** The Reply-To address of a thread: reply+<token>@<domain> (the token is the match; the subject is never read). */
  replyAddress(t: Pick<ThreadRow, "id" | "contact">): string {
    return `${REPLY_LOCAL}+${replyToken(this.env.AUTH_CODE_PEPPER, t.id, t.contact)}@${replyDomain(this.env.MAIL_FROM)}`;
  }

  /**
   * E-208: staff answer. In one transaction under the thread's row lock: the message, the thread waiting, one audit row, and the email
   * queued through the notices path (the delivery log). Two staff answering at once both land, one after the other. The email goes
   * at once after the commit (the job sends it otherwise).
   */
  async reply(id: string, textIn: string, reasonIn: string, actor: AuditActor): Promise<ThreadDetail> {
    const reason = requireReason(reasonIn);
    const problem = textProblem(textIn, MESSAGE_MAX, "reply");
    if (problem) throw AppError.validation({ text: problem });
    const text = textIn.trim();
    const { detail, deliveryId } = await this.prisma.$transaction(async (tx) => {
      const t = await this.lockThread(tx, id);
      if (!t.contact) throw AppError.validation({ id: "This person's details were erased: there is no address to write to." });
      if (isOwnAddress(this.env.MAIL_FROM, t.contact)) throw AppError.validation({ id: "This thread's contact is one of our own addresses: there is no one to write to." });
      if (await this.suppression.has(t.contact, tx)) throw AppError.conflict("address_complained", "This address asked not to get email, so a reply cannot be sent.");
      const now = this.clock.now();
      const mid = this.ids.id();
      await tx.supportMessage.create({ data: { id: mid, threadId: t.id, from: "staff", body: text, fileIds: [], createdAt: now } });
      const next = await tx.supportThread.update({ where: { id: t.id }, data: { status: "waiting", updatedAt: now } });
      await this.audit.write(tx, { actor, section: SECTION, action: "support.reply", target: { type: "support_thread", id: t.id }, reason, changedFields: ["status", "messages"] });
      const sent = await this.notices.send(tx, {
        template: "support", toEmail: t.contact, data: { subject: t.subject, text }, key: `support-reply:${mid}`, replyTo: this.replyAddress(t),
      });
      return { detail: await this.detail(next, false, tx), deliveryId: sent.status === "queued" ? sent.deliveryId : null };
    });
    await this.notices.deliverNow(deliveryId);
    return detail;
  }

  /** E-209: close, or open again. Asking for the state it already has changes nothing and writes no audit row. */
  async setState(id: string, state: "open" | "closed", reasonIn: string, actor: AuditActor): Promise<ThreadDetail> {
    const reason = requireReason(reasonIn);
    return this.prisma.$transaction(async (tx) => {
      const t = await this.lockThread(tx, id);
      const now = state === "closed" ? "closed" : t.status === "closed" ? "open" : t.status;
      if (now === t.status) return this.detail(t, false, tx);
      const next = await tx.supportThread.update({ where: { id: t.id }, data: { status: now, updatedAt: this.clock.now() } });
      await this.audit.write(tx, { actor, section: SECTION, action: state === "closed" ? "support.close" : "support.reopen", target: { type: "support_thread", id: t.id }, reason, changedFields: ["status"] });
      return this.detail(next, false, tx);
    });
  }

  /** E-204: give the thread to a staff member who is active. The same assignee again changes nothing. */
  async assign(id: string, assigneeId: string, reasonIn: string, actor: AuditActor, expectedAssignee?: string): Promise<SupportThread> {
    const reason = requireReason(reasonIn);
    if (!UUID.test(assigneeId)) throw AppError.validation({ assigneeId: "Pick a staff member." });
    // W14B: the holder the caller saw ("" when the thread had none); without it the last hand-over wins, as before
    const expected = expectedAssignee === undefined ? undefined : expectedAssignee.trim().toLowerCase();
    if (expected !== undefined && expected !== "" && !UUID.test(expected)) throw AppError.validation({ expectedAssignee: "Send the staff member you saw holding this thread, or an empty value when it had none." });
    return this.prisma.$transaction(async (tx) => {
      const t = await this.lockThread(tx, id);
      if (expected !== undefined && (t.assigneeId ?? "") !== expected) throw AppError.conflict("thread_changed_hands", "Someone else handed this thread over since you looked. Look at it again.");
      const staff = await tx.staffAccount.findUnique({ where: { id: assigneeId }, select: { id: true, status: true, roles: true } });
      if (!staff || staff.status !== "active") throw AppError.validation({ assigneeId: "Pick a staff member who is active." });
      if (!(await this.roleAccess.opens(staff.roles, SECTION))) throw AppError.validation({ assigneeId: "Pick a staff member whose role opens Support." });
      let row = t;
      if (t.assigneeId !== staff.id) {
        row = await tx.supportThread.update({ where: { id: t.id }, data: { assigneeId: staff.id, updatedAt: this.clock.now() } });
        await this.audit.write(tx, { actor, section: SECTION, action: "support.assign", target: { type: "support_thread", id: t.id }, reason, changedFields: ["assigneeId"] });
      }
      const x = (await this.extras([row], tx)).get(row.id) ?? { name: "", last: "" };
      return this.wireThread(row, x, false);
    });
  }

  /** The saved replies staff keep (a table of config rows, seeded). */
  async savedReplies(): Promise<SavedReply[]> {
    const rows = await this.prisma.savedReply.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
    return rows.map((r) => ({ id: r.id, name: r.name ?? "", text: r.text ?? "" }));
  }

  /** E-251: add a saved reply. A name and the words, both plain text; one audit row in the same transaction. */
  async addSavedReply(nameIn: string, textIn: string, reasonIn: string, actor: AuditActor): Promise<SavedReply> {
    const reason = requireReason(reasonIn);
    const name = this.savedName(nameIn);
    const text = this.savedText(textIn);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.savedReply.create({ data: { id: this.ids.id(), name, text } });
      await this.audit.write(tx, { actor, section: SECTION, action: "support.saved-reply.add", target: { type: "saved_reply", id: row.id }, reason, changedFields: ["name", "text"] });
      return { id: row.id, name, text };
    });
  }

  /** E-253: change a saved reply's name or text (at least one). The reply is locked while it changes. */
  async changeSavedReply(id: string, change: { name?: string; text?: string }, reasonIn: string, actor: AuditActor): Promise<SavedReply> {
    const reason = requireReason(reasonIn);
    if (change.name === undefined && change.text === undefined) throw AppError.validation({ name: "Send a name or the words to change." });
    const name = change.name === undefined ? undefined : this.savedName(change.name);
    const text = change.text === undefined ? undefined : this.savedText(change.text);
    if (!UUID.test(id)) throw AppError.notFound("No such saved reply.");
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM saved_reply WHERE id = ${id}::uuid FOR UPDATE`;
      if (!found[0]) throw AppError.notFound("No such saved reply.");
      const row = await tx.savedReply.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(text !== undefined ? { text } : {}) } });
      await this.audit.write(tx, { actor, section: SECTION, action: "support.saved-reply.change", target: { type: "saved_reply", id }, reason, changedFields: [...(name !== undefined ? ["name"] : []), ...(text !== undefined ? ["text"] : [])] });
      return { id: row.id, name: row.name ?? "", text: row.text ?? "" };
    });
  }

  /** E-252: remove a saved reply. */
  async removeSavedReply(id: string, reasonIn: string, actor: AuditActor): Promise<void> {
    const reason = requireReason(reasonIn);
    if (!UUID.test(id)) throw AppError.notFound("No such saved reply.");
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.savedReply.deleteMany({ where: { id } });
      if (!gone.count) throw AppError.notFound("No such saved reply.");
      await this.audit.write(tx, { actor, section: SECTION, action: "support.saved-reply.remove", target: { type: "saved_reply", id }, reason, changedFields: ["name", "text"] });
    });
  }

  private savedName(v: string): string {
    const name = v.replace(/\s+/g, " ").trim();
    if (!name || name.length > 80) throw AppError.validation({ name: "Give it a name of 1 to 80 characters." });
    return name;
  }

  private savedText(v: string): string {
    const problem = textProblem(v, 4000, "reply");
    if (problem) throw AppError.validation({ text: problem });
    return v.trim();
  }
}
