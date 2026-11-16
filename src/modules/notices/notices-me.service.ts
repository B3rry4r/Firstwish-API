import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { Notice, NoticePrefs } from "../../contracts";
import { maskEmail } from "../../common/normalise/mask-email";
import { isTemplateKey, MUTABLE_KEYS, TEMPLATES, TemplateKey } from "./catalog";

const KIND_WIRE: Record<string, Notice["kind"]> = {
  opened: "opened", term_ends_soon: "term-ends-soon", anniversary: "anniversary", date_reminder_7d: "date-reminder-7d", date_reminder_1d: "date-reminder-1d",
  pass_ends_soon: "pass-ends-soon", pass_ended: "pass-ended", plan_renewal: "plan-renewal", plan_ended: "plan-ended", publish_notice: "publish-notice",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A person's own notices (E-77) and which kinds they have turned off (E-78). */
@Injectable()
export class NoticesMeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  /** E-77. Newest first, the signed-in account's own. The query holds the owner check. */
  async list(accountId: string, limit: number, cursor?: string): Promise<Page<Notice>> {
    const after = cursor ? decodeCursor(cursor).id : null;
    if (after !== null && !UUID.test(after)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
    const acct = await this.prisma.account.findUnique({ where: { id: accountId }, select: { contact: true } });
    const to = acct?.contact ? maskEmail(acct.contact) : "";
    const rows = await this.prisma.notice.findMany({ where: { accountId, ...(after ? { id: { lt: after } } : {}) }, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((r) => {
        const spec = r.key && isTemplateKey(r.key) ? TEMPLATES[r.key] : null;
        return {
          id: r.id, accountId: r.accountId, wishId: r.wishId, dateRowId: r.dateRowId, deliveryId: r.deliveryId, kind: KIND_WIRE[r.kind] ?? "publish-notice",
          key: r.key ?? "", name: spec?.label ?? "", subject: r.subject ?? spec?.label ?? "", body: r.body ?? "", when: spec?.when ?? "", to, reason: "",
          status: r.status, dueAt: toWireInstant(r.dueAt), createdAt: toWireInstant(r.createdAt), edited: null,
        };
      }),
    };
  }

  async prefs(accountId: string): Promise<NoticePrefs> {
    const row = await this.prisma.noticePrefs.findUnique({ where: { accountId } });
    return { channel: "email", muted: mutedOf(row?.muted) };
  }

  /** E-78. The kinds turned off, replacing the list. The sign-in code cannot be turned off; an unknown kind is 422. */
  async setMuted(accountId: string, muted: string[]): Promise<NoticePrefs> {
    const clean = [...new Set(muted.map((m) => m.trim().toLowerCase()))];
    const bad = clean.filter((m) => !(MUTABLE_KEYS as string[]).includes(m));
    if (bad.length) {
      const code = bad.includes("code");
      throw AppError.validation({ muted: code ? "The sign-in code cannot be turned off." : `Not a message you can turn off: ${bad.join(", ")}.` });
    }
    clean.sort();
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await tx.noticePrefs.upsert({ where: { accountId }, create: { id: this.ids.id(), accountId, channel: "email", muted: clean }, update: { muted: clean, channel: "email" } });
    });
    return { channel: "email", muted: clean };
  }
}

function mutedOf(v: unknown): TemplateKey[] {
  return Array.isArray(v) ? (v.filter((x): x is TemplateKey => isTemplateKey(x)).sort()) : [];
}
