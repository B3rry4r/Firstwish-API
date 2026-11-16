import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type MessageDelivery as DeliveryRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { MessageDelivery, MessageTemplate } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { isTemplateKey, LISTED_KEYS, maskEmail, scrubEmails, scrubReason, TEMPLATES, TemplateKey, wordingProblems } from "./catalog";
import { LANG, NoticesService } from "./notices.service";

const SECTION = "/admin/messages";
const RESEND_SUFFIX = "#resend";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff: the wording (E-75, E-76), the delivery log (E-71) and send again (E-70). */
@Injectable()
export class NoticesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly notices: NoticesService,
  ) {}

  /** II2: the wording in force for one message, as a MessageTemplate (editedAt and editedBy are null until staff first change it). */
  private wording(row: { key: string; subject: string | null; body: string; version: number; editedAt: Date | null; editedBy: string | null; channel: string; locale: string }): MessageTemplate {
    const spec = TEMPLATES[row.key as TemplateKey];
    return {
      key: row.key, name: spec.label, subject: row.subject ?? "", body: row.body, placeholders: [...spec.allowed], version: row.version,
      editedAt: row.editedAt ? toWireInstant(row.editedAt) : null, editedBy: row.editedBy, channel: row.channel, locale: row.locale,
    };
  }

  /** E-75. The messages with the wording now in force. */
  async templates(limit: number, cursor?: string): Promise<Page<MessageTemplate>> {
    const after = cursor ? String(decodeCursor(cursor).key) : "";
    const rows = await this.prisma.messageTemplate.findMany({ where: { channel: "email", locale: LANG, key: { in: [...LISTED_KEYS] } }, orderBy: [{ key: "asc" }, { version: "desc" }] });
    const latest = rows.filter((r, i) => i === 0 || rows[i - 1].key !== r.key).filter((r) => r.key > after).slice(0, limit + 1);
    return toPage(latest.map((r) => this.wording(r)), limit, (n) => ({ key: n.key, id: n.key }));
  }

  /** E-76. New wording for one message: kept words only, every placeholder it needs, a reason, one audit row. */
  async edit(key: string, body: { subject: string; body: string; reason: string }, actor: AuditActor): Promise<MessageTemplate> {
    if (!isTemplateKey(key) || !(LISTED_KEYS as readonly string[]).includes(key)) throw AppError.notFound();
    const reason = requireReason(body.reason);
    const subject = body.subject.trim();
    const text = body.body.trim();
    const fields = wordingProblems(key, subject, text);
    if (fields) throw AppError.validation(fields);
    const row = await this.prisma.$transaction(async (tx) => {
      const cur = await tx.messageTemplate.findFirst({ where: { key, channel: "email", locale: LANG }, orderBy: { version: "desc" } });
      if (!cur) throw AppError.notFound();
      await tx.$queryRaw`SELECT id FROM message_template WHERE id = ${cur.id}::uuid FOR UPDATE`;
      const next = await tx.messageTemplate.update({ where: { id: cur.id }, data: { subject, body: text, version: { increment: 1 }, editedAt: this.clock.now(), editedBy: actor.id ?? null } });
      await this.audit.write(tx, { actor, section: SECTION, action: "messages.template_edit", target: { type: "message_template", id: next.id }, reason, changedFields: ["subject", "body"] });
      return next;
    });
    return this.wording(row);
  }

  /** Wire shape of a delivery for staff: the address masked, the sign-in code never shown. */
  wire(r: DeliveryRow, resent: string | null): MessageDelivery {
    const vars = (r.vars ?? {}) as { wishId?: string; data?: Record<string, unknown> };
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(vars.data ?? {})) if (k !== "code") data[k] = typeof v === "string" ? scrubEmails(v) : v;
    const spec = TEMPLATES[r.templateKey as TemplateKey];
    return {
      id: r.id, templateKey: r.templateKey, channel: "email", to: maskEmail(r.to), purpose: purposeWire(r.purpose), status: r.status, state: r.status,
      providerMessageId: r.providerMessageId, error: r.error ? scrubReason(r.error) : null, reason: r.error ? scrubReason(r.error) : "", attempts: r.attempts,
      costKobo: null, createdAt: toWireInstant(r.createdAt), updatedAt: toWireInstant(r.updatedAt), at: toWireInstant(r.updatedAt),
      idempotencyKey: scrubEmails(r.idempotencyKey ?? ""), vars: data, what: spec?.label ?? r.templateKey, wish: vars.wishId ?? null, resent,
    };
  }

  /** E-71. Newest first; ?status=failed shows what staff must look at. */
  async log(limit: number, cursor: string | undefined, status: string | undefined): Promise<Page<MessageDelivery>> {
    const where: Prisma.MessageDeliveryWhereInput = {};
    if (status) where.status = status as DeliveryRow["status"];
    if (cursor) where.id = { lt: String(decodeCursor(cursor).id) };
    if (cursor && !UUID.test(decodeCursor(cursor).id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
    const rows = await this.prisma.messageDelivery.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const keys = rows.map((r) => `${r.idempotencyKey}${RESEND_SUFFIX}`);
    const resends = rows.length ? await this.prisma.messageDelivery.findMany({ where: { idempotencyKey: { in: keys } }, select: { id: true, idempotencyKey: true } }) : [];
    const byKey = new Map(resends.map((x) => [x.idempotencyKey, x.id]));
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map((r) => this.wire(r, byKey.get(`${r.idempotencyKey}${RESEND_SUFFIX}`) ?? null)), nextCursor: page.nextCursor };
  }

  /** E-70. Send again: once for a failed delivery (two at once: one send). Writes one audit row. */
  async resend(id: string, reasonIn: string, actor: AuditActor): Promise<MessageDelivery> {
    const reason = requireReason(reasonIn);
    if (!UUID.test(id)) throw AppError.notFound();
    const made = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM message_delivery WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows[0]) throw AppError.notFound();
      const orig = await tx.messageDelivery.findUniqueOrThrow({ where: { id } });
      if (orig.status !== "failed") throw new AppError(HttpStatus.CONFLICT, "not_failed", "Only a message that failed can be sent again.");
      if (orig.templateKey === "code") throw new AppError(HttpStatus.CONFLICT, "code_expired", "A sign-in code cannot be sent again. Ask the person to request a new one.");
      const origKey = orig.idempotencyKey ?? orig.id;
      const again = await tx.messageDelivery.findFirst({ where: { idempotencyKey: `${origKey}${RESEND_SUFFIX}` }, select: { id: true } });
      if (again) throw new AppError(HttpStatus.CONFLICT, "already_sent_again", "This message was already sent again.");
      const vars = (orig.vars ?? { data: {} }) as { accountId?: string; wishId?: string; data: Record<string, string | number> };
      if (vars.accountId) {
        const a = await tx.account.findUnique({ where: { id: vars.accountId }, select: { erasedAt: true } });
        if (!a || a.erasedAt) throw new AppError(HttpStatus.CONFLICT, "account_erased", "This account was erased. Nothing is sent.");
      }
      const newId = this.ids.id();
      await tx.messageDelivery.create({
        data: { id: newId, templateKey: orig.templateKey, channel: "email", to: orig.to, purpose: orig.purpose, status: "queued", attempts: 0, idempotencyKey: `${origKey}${RESEND_SUFFIX}`, vars: orig.vars as Prisma.InputJsonValue },
      });
      await this.notices.queueJob(tx, newId);
      await this.audit.write(tx, { actor, section: SECTION, action: "messages.resend", target: { type: "message_delivery", id: orig.id }, reason, changedFields: ["status"] });
      return newId;
    });
    await this.notices.deliverNow(made);
    const row = await this.prisma.messageDelivery.findUniqueOrThrow({ where: { id: made } });
    return this.wire(row, null);
  }
}

const PURPOSE: Record<string, MessageDelivery["purpose"]> = {
  auth_code: "auth-code", wish_delivery: "wish-delivery", opened: "opened", term_notice: "term-notice", anniversary: "anniversary",
  date_reminder: "date-reminder", publish_notice: "publish-notice", pass: "pass", plan: "plan", invite: "invite", receipt: "receipt", support: "support",
  sealed: "sealed", opens: "opens",
};
function purposeWire(p: string): MessageDelivery["purpose"] {
  return PURPOSE[p] ?? "support";
}
