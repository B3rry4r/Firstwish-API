import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import type { Provider, Settings } from "../../contracts";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { ProviderStatus } from "./provider-status";

export const SWITCH_KEYS = ["off40", "samplesOff"] as const;
export type SwitchKey = (typeof SWITCH_KEYS)[number];
export const STORAGE_CHOICES = ["r2", "spaces"] as const;
export type StorageChoice = (typeof STORAGE_CHOICES)[number];

const DEFAULT_PROVIDERS = [
  { key: "payments", name: "Payments", who: "Paystack" },
  { key: "email", name: "Email", who: "Resend" },
  { key: "ai", name: "AI", who: "Anthropic" },
  { key: "storage", name: "Storage", who: "" },
];

/**
 * Settings (E-163 to E-165, owner only) and the provider list. Staff settings live on the server (R10): one `settings` row per
 * setting, keyed by its name. A provider reads "connected" only when the app runs on real providers AND its port's ping answered ok
 * just now (FB4: ProviderStatus, cached for a minute); never from rows left by old calls. Anything else reads "not_connected". No key,
 * secret or address is ever in the answer.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    private readonly status: ProviderStatus,
  ) {}

  private async row(key: string): Promise<{ choice: unknown; on: boolean | null } | null> {
    const rows = await this.db.$queryRaw<{ choice: unknown; on: boolean | null }[]>`SELECT choice, "on" FROM settings WHERE key = to_jsonb(${key}::text) ORDER BY id LIMIT 1`;
    return rows[0] ?? null;
  }

  /** The adapter that runs: read from the env the ports were built with, never from a stored row. */
  storage(): StorageChoice {
    return this.env.STORAGE_DRIVER ?? "r2";
  }

  async switches(): Promise<Record<SwitchKey, boolean>> {
    const out = {} as Record<SwitchKey, boolean>;
    for (const k of SWITCH_KEYS) out[k] = (await this.row(k))?.on === true;
    return out;
  }

  async providers(): Promise<Provider[]> {
    const rows = await this.db.provider.findMany({ orderBy: { id: "asc" } });
    const base = rows.length ? rows.map((r) => ({ key: r.key ?? "", name: r.name ?? r.key ?? "", who: r.who ?? "" })) : DEFAULT_PROVIDERS;
    return Promise.all(
      base.map(async (p) => {
        const s = await this.status.state(p.key);
        return { key: p.key, name: p.name, who: p.who, state: s.connected ? "connected" : "not_connected", line: s.line };
      }),
    );
  }

  /** E-163. */
  async read(): Promise<Settings> {
    return { providers: await this.providers(), storage: this.storage(), switches: await this.switches() } as unknown as Settings;
  }

  private async lockKey(tx: Pick<PrismaService, "$executeRaw">, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`settings:${key}`}, 0))`;
  }

  /** E-164: storage is set at deploy (FB3). Naming the adapter that runs changes nothing; naming the other one is 422. */
  setStorage(choice: string, reasonText: string): void {
    requireReason(reasonText);
    if (!STORAGE_CHOICES.includes(choice as StorageChoice)) throw AppError.validation({ choice: "Must be r2 or spaces." });
    if (choice !== this.storage()) throw AppError.validation({ choice: "Storage is set when the app is deployed, not from this screen." }, "Storage is set at deploy and cannot be changed here.");
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
