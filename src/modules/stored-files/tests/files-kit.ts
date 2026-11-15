import type { WishStatus, WishTicket } from "@prisma/client";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { ScreenInput, ScreenResult, UploadScreeningPort } from "../../../common/ports/screening.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";

export const ids = new UuidV7Maker();
export const JPEG = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, n - 4), 1)]);
export const WEBM = (n: number) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(Math.max(0, n - 4), 2)]);
export const MB = 1024 * 1024;
export const GB = 1024 * MB;

/** A screening stand-in that answers the scores a test queues (default 0, clean). */
export class ScoredScreening extends UploadScreeningPort {
  readonly next: number[] = [];
  readonly screened: ScreenInput[] = [];
  screen(input: ScreenInput): Promise<ScreenResult> {
    this.screened.push(input);
    const score = this.next.shift() ?? 0;
    const r = score >= 0.5 ? { verdict: "rejected" as const, reason: "stand-in label", score } : { verdict: "clean" as const, score };
    return Promise.resolve(r);
  }
}

export async function filesApp(): Promise<{ t: TestApp; db: PrismaService; scored: ScoredScreening }> {
  const scored = new ScoredScreening();
  const t = await createTestApp({ configure: (b) => b.overrideProvider(UploadScreeningPort).useValue(scored) });
  const db = t.app.get(PrismaService);
  await ensureEntitlements(db);
  return { t, db, scored };
}

/** The entitlements row as scripts/seed.mjs seeds its parts used here (fixed id, so specs sharing a database agree). */
export async function ensureEntitlements(db: PrismaService): Promise<void> {
  const data = {
    tickets: {
      moment: { termDays: 7, photos: 6, clips: 0, keepable: false },
      keepsake: { termDays: 14, photos: 15, clips: 0, keepable: true },
      signature: { termDays: 30, photos: 15, clips: 0, keepable: true },
      premiere: { termDays: 60, photos: 20, clips: 3, clipSeconds: 15, keepable: true },
    },
    keepsakeExtrasCeilingKobo: 750000n,
    passWishes: 20,
    passUpgrades: 4,
    conciergePassDiscountPercent: 20,
    vatRate: "7.5",
    creator: {},
    pro: { starter: { wishes: 10, logins: 1, vaultGb: 100 }, studio: { wishes: 35, logins: 3, vaultGb: 500 }, pack: { wishes: 5, vaultGb: 20, days: 90 } },
  };
  const existing = await db.entitlements.findFirst();
  if (!existing) await db.entitlements.create({ data: { id: "019a8000-0000-7000-8000-00000000b009", ...data } }).catch(() => undefined);
}

export async function makeAccount(db: PrismaService, t: TestApp, sides: ("person" | "creator" | "business")[] = ["person"]): Promise<{ id: string; token: string }> {
  const id = ids.next();
  await db.account.create({ data: { id, sides, lastSide: sides[0] } });
  const token = `acct-${id}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides });
  return { id, token };
}

export async function makeBusiness(db: PrismaService, accountId: string, over: { plan?: string | null; vault?: bigint; pack?: number; packEnds?: Date } = {}): Promise<string> {
  const id = ids.next();
  await db.business.create({ data: { id, accountId, plan: over.plan === undefined ? "starter" : over.plan, vault: over.vault ?? 0n, pack: over.pack, packEnds: over.packEnds } });
  return id;
}

export async function makeWish(db: PrismaService, accountId: string, status: WishStatus = "draft", ticket: WishTicket | null = "keepsake", photos?: unknown): Promise<string> {
  const id = ids.next();
  await db.wish.create({
    data: { id, accountId, status, ticket, kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", photos: photos === undefined ? undefined : (photos as object) },
  });
  return id;
}
