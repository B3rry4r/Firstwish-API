import { Injectable } from "@nestjs/common";
import type { VaultStorage } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { dateOnlyOf } from "../../common/time/time";
import { GB } from "../stored-files/file-rules";
import { monthOf, Tx } from "./vault-shared";

type Db = Pick<Tx, "$queryRaw" | "business" | "entitlements" | "purchaseGrant" | "price">;
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** What a business may hold now, in GB, and where each part comes from (the grants and the price book: nothing here is typed in). */
export interface Standing {
  planGb: number;
  packGb: number;
  packUntil: Date | null;
  /** GB from Vault space bought (live grants), and the blocks that is. */
  boughtGb: number;
  boughtBlocks: number;
  blockGb: number;
  bulkFromGb: number;
  limitBytes: number;
  includedBytes: number;
}

/**
 * Vault space (GG4, T-17, T-39): the plan's GB while the plan is live, plus the GB of every live grant (a wish pack's, Vault space
 * bought). Used bytes are the sum of the business's stored Vault files, counted in one statement; the business.vault counter that
 * the upload path keeps is never read here. The peak of the month is kept so extra space is billed by the most the month held.
 */
@Injectable()
export class VaultSpaceService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Bytes in the business's Vault: every confirmed Vault file, held ones too. One statement. */
  async usedBytes(db: Pick<Tx, "$queryRaw">, businessId: string): Promise<number> {
    const r = await db.$queryRaw<{ n: string }[]>`
      SELECT COALESCE(SUM(bytes), 0)::text AS n FROM stored_file
       WHERE "businessId" = ${businessId}::uuid AND purpose = 'vault-file' AND status IN ('ready', 'screening')`;
    return Number(r[0]?.n ?? 0);
  }

  async standing(db: Db, businessId: string, now: Date): Promise<Standing> {
    const e = await db.entitlements.findFirst({ orderBy: { id: "desc" } });
    if (!e) throw new AppError(503, "entitlements_missing", "Vault space cannot be worked out right now.");
    const pro = obj(e.pro);
    const biz = await db.business.findUnique({ where: { id: businessId }, select: { plan: true, renews: true } });
    if (!biz) throw AppError.notFound();
    const live = !!biz.plan && biz.plan !== "pack" && !!biz.renews && biz.renews.getTime() > now.getTime();
    const planGb = live ? num(obj(pro[biz.plan as string]).vaultGb) : 0;
    const grants = await db.purchaseGrant.findMany({
      where: { businessId, kind: { in: ["wish-pack", "vault-space"] }, revokedAt: null, refusedReason: null, endsAt: { gt: now } },
      select: { kind: true, detail: true, endsAt: true },
    });
    let packGb = 0;
    let boughtGb = 0;
    let boughtBlocks = 0;
    let packUntil: Date | null = null;
    for (const g of grants) {
      const d = obj(g.detail);
      if (g.kind === "wish-pack") {
        packGb += num(d.vaultGb);
        if (g.endsAt && (!packUntil || g.endsAt > packUntil)) packUntil = g.endsAt;
      } else {
        boughtGb += num(d.gb);
        boughtBlocks += num(d.blocks);
      }
    }
    const block = obj(obj(pro.vault).block);
    const bulk = obj(obj(pro.vault)["block-bulk"]);
    return {
      planGb, packGb, packUntil, boughtGb, boughtBlocks,
      blockGb: num(block.vaultGb) || 100,
      bulkFromGb: num(bulk.fromGb) || 1000,
      includedBytes: (planGb + packGb) * GB,
      limitBytes: (planGb + packGb + boughtGb) * GB,
    };
  }

  /** The month's peak: raised to `used` in one statement, never lowered. Answers the peak. */
  async notePeak(db: Pick<Tx, "$queryRaw">, businessId: string, used: number, now: Date): Promise<number> {
    const r = await db.$queryRaw<{ bytes: string }[]>`
      INSERT INTO vault_peak ("businessId", month, bytes) VALUES (${businessId}::uuid, ${monthOf(now)}, ${used})
      ON CONFLICT ("businessId", month) DO UPDATE SET bytes = GREATEST(vault_peak.bytes, EXCLUDED.bytes)
      RETURNING bytes::text AS bytes`;
    return Number(r[0]?.bytes ?? used);
  }

  /** What the blocks cost, from the price book (never discounted: the list price): the first blocks up to the bulk line at the block price, the rest at the bulk price. */
  private async cost(db: Db, s: Standing, blocks: number): Promise<number> {
    if (blocks <= 0) return 0;
    const price = async (sku: string): Promise<number> => {
      const p = await db.price.findFirst({ where: { sku }, orderBy: { version: "desc" } });
      if (!p) throw new AppError(503, "price_book_missing", "The price book has no Vault space price.");
      return Number(p.listKobo);
    };
    const upTo = Math.floor(s.bulkFromGb / s.blockGb);
    const normal = Math.min(blocks, upTo);
    const rest = blocks - normal;
    return normal * (await price("vault.block")) + (rest > 0 ? rest * (await price("vault.block-bulk")) : 0);
  }

  /** E-215. */
  async view(businessId: string): Promise<VaultStorage> {
    const now = this.clock.now();
    return this.db.$transaction(async (tx) => {
      const s = await this.standing(tx, businessId, now);
      const used = await this.usedBytes(tx, businessId);
      const peak = await this.notePeak(tx, businessId, used, now);
      const over = Math.max(0, peak - s.includedBytes);
      const blocks = over > 0 ? Math.ceil(over / (s.blockGb * GB)) : 0;
      const out: VaultStorage = {
        month: monthOf(now), used, peak, planGB: s.planGb, packGB: s.packGb, included: s.includedBytes, over, blocks,
        cost: await this.cost(tx, s, blocks), free: Math.max(0, s.limitBytes - used),
      };
      if (s.packUntil) out.packUntil = dateOnlyOf(s.packUntil);
      return out;
    });
  }

  /**
   * Room for new files, inside the caller's transaction (the owner's account is locked): refused when the business holds no Vault space
   * now (a lapsed plan with no live pack or bought space: 402) or already holds more than it may (409).
   */
  async needRoom(tx: Tx, businessId: string): Promise<void> {
    const now = this.clock.now();
    const s = await this.standing(tx, businessId, now);
    if (s.limitBytes <= 0) throw new AppError(402, "vault_lapsed", "Your plan has ended. Renew it, or buy a wish pack or Vault space, to add files. Your files stay as they are.");
    const used = await this.usedBytes(tx, businessId);
    await this.notePeak(tx, businessId, used, now);
    if (used > s.limitBytes) throw AppError.conflict("vault_full", "Your Vault is over its space. Free some space or buy more to add files.");
  }
}
