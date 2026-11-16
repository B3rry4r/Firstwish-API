import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import type { Provider, Settings } from "../../contracts";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";

export const SWITCH_KEYS = ["off40", "samplesOff"] as const;
export type SwitchKey = (typeof SWITCH_KEYS)[number];
export const STORAGE_CHOICES = ["r2", "spaces"] as const;
export type StorageChoice = (typeof STORAGE_CHOICES)[number];
const STORAGE_KEY = "storage";

const DEFAULT_PROVIDERS = [
  { key: "payments", name: "Payments", who: "Paystack" },
  { key: "email", name: "Email", who: "Resend" },
  { key: "ai", name: "AI", who: "Anthropic" },
  { key: "storage", name: "Storage", who: "" },
];

/**
 * Settings (E-163 to E-165, owner only) and the provider list. Staff settings live on the server (R10): one `settings` row per
 * setting, keyed by its name. A provider reads "connected" only when the app runs on real providers AND a real call has
 * succeeded and left its mark (a verified payment, an email the provider accepted, an AI request answered, a file stored);
 * anything else reads "not_connected". No key, secret or address is ever in the answer.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async row(key: string): Promise<{ choice: unknown; on: boolean | null } | null> {
    const rows = await this.db.$queryRaw<{ choice: unknown; on: boolean | null }[]>`SELECT choice, "on" FROM settings WHERE key = to_jsonb(${key}::text) ORDER BY id LIMIT 1`;
    return rows[0] ?? null;
  }

  async storage(): Promise<StorageChoice> {
    const v = (await this.row(STORAGE_KEY))?.choice;
    if (v === "r2" || v === "spaces") return v;
    return this.env.STORAGE_DRIVER ?? "r2";
  }

  async switches(): Promise<Record<SwitchKey, boolean>> {
    const out = {} as Record<SwitchKey, boolean>;
    for (const k of SWITCH_KEYS) out[k] = (await this.row(k))?.on === true;
    return out;
  }

  private async evidence(): Promise<Record<string, boolean>> {
    const [pay, mail, ai, file] = await Promise.all([
      this.db.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM payment WHERE "verifiedAt" IS NOT NULL AND status::text IN ('succeeded', 'refunded', 'partly-refunded') LIMIT 1`,
      this.db.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM message_delivery WHERE status::text IN ('sent', 'delivered') AND "providerMessageId" IS NOT NULL LIMIT 1`,
      this.db.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM ai_request WHERE status::text = 'done' LIMIT 1`,
      this.db.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM stored_file WHERE status::text IN ('uploaded', 'screening', 'ready') LIMIT 1`,
    ]);
    return { payments: pay.length > 0, email: mail.length > 0, ai: ai.length > 0, storage: file.length > 0 };
  }

  async providers(): Promise<Provider[]> {
    const rows = await this.db.provider.findMany({ orderBy: { id: "asc" } });
    const base = rows.length ? rows.map((r) => ({ key: r.key ?? "", name: r.name ?? r.key ?? "", who: r.who ?? "" })) : DEFAULT_PROVIDERS;
    const live = this.env.PROVIDERS === "live";
    const seen = await this.evidence();
    return base.map((p) => {
      const connected = live && seen[p.key] === true;
      return {
        key: p.key,
        name: p.name,
        who: p.who,
        state: connected ? "connected" : "not_connected",
        line: connected ? "A real call to the provider has worked." : live ? "No real call to the provider has worked yet." : "Running on stand-ins, so nothing real has been called.",
      };
    });
  }

  /** E-163. */
  async read(): Promise<Settings> {
    return { providers: await this.providers(), storage: await this.storage(), switches: await this.switches() } as unknown as Settings;
  }

  private async lockKey(tx: Pick<PrismaService, "$executeRaw">, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`settings:${key}`}, 0))`;
  }

  /** E-164: nothing changes (and no audit row is written) when the choice is the one already in force. */
  async setStorage(choice: string, reasonText: string, actor: AuditActor): Promise<void> {
    const reason = requireReason(reasonText);
    if (!STORAGE_CHOICES.includes(choice as StorageChoice)) throw AppError.validation({ choice: "Must be r2 or spaces." });
    await this.db.$transaction(async (tx) => {
      await this.lockKey(tx, STORAGE_KEY);
      const rows = await tx.$queryRaw<{ id: string; choice: unknown }[]>`SELECT id::text AS id, choice FROM settings WHERE key = to_jsonb(${STORAGE_KEY}::text) ORDER BY id LIMIT 1`;
      const now = rows[0]?.choice ?? this.env.STORAGE_DRIVER ?? "r2";
      if (now === choice) return;
      if (rows[0]) await tx.$executeRaw`UPDATE settings SET choice = to_jsonb(${choice}::text) WHERE id = ${rows[0].id}::uuid`;
      else await tx.$executeRaw`INSERT INTO settings (id, key, choice) VALUES (${this.ids.id()}::uuid, to_jsonb(${STORAGE_KEY}::text), to_jsonb(${choice}::text))`;
      await this.audit.write(tx, { actor, section: "/admin/settings", action: "settings.storage", target: { type: "Settings", id: STORAGE_KEY }, reason, changedFields: ["choice"] });
    });
  }

  /** E-165: the same rule: a switch already in that position changes nothing and writes no audit row. */
  async setSwitch(key: string, on: boolean, reasonText: string, actor: AuditActor): Promise<void> {
    const reason = requireReason(reasonText);
    if (!SWITCH_KEYS.includes(key as SwitchKey)) throw AppError.validation({ key: "Must be off40 or samplesOff." });
    await this.db.$transaction(async (tx) => {
      await this.lockKey(tx, key);
      const rows = await tx.$queryRaw<{ id: string; on: boolean | null }[]>`SELECT id::text AS id, "on" FROM settings WHERE key = to_jsonb(${key}::text) ORDER BY id LIMIT 1`;
      if ((rows[0]?.on ?? false) === on) return;
      if (rows[0]) await tx.$executeRaw`UPDATE settings SET "on" = ${on} WHERE id = ${rows[0].id}::uuid`;
      else await tx.$executeRaw`INSERT INTO settings (id, key, "on") VALUES (${this.ids.id()}::uuid, to_jsonb(${key}::text), ${on})`;
      await this.audit.write(tx, { actor, section: "/admin/settings", action: "settings.switch", target: { type: "Settings", id: key }, reason, changedFields: ["on"] });
    });
  }
}
