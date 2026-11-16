import type { WishStatus, WishTicket } from "@prisma/client";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { ScreenInput, ScreenResult, UploadScreeningPort } from "../../../common/ports/screening.port";
import { stagingKeyOf } from "../file-rules";
import { createTestApp, TestApp } from "../../../../test/kit/app";

export const ids = new UuidV7Maker();
export const JPEG = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, n - 4), 1)]);
export const WEBM = (n: number) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(Math.max(0, n - 4), 2)]);
export const PNG = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(Math.max(0, n - 8), 3)]);
export const SVG = (n: number) => Buffer.concat([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), Buffer.alloc(Math.max(0, n - 70), 32)]).subarray(0, n);
export const MB = 1024 * 1024;
export const GB = 1024 * MB;

/** A screening stand-in that answers the scores a test queues (default 0, clean). */
export class ScoredScreening extends UploadScreeningPort {
  readonly next: number[] = [];
  /** Labels for the next answers (X21), in step with `next`. */
  readonly nextLabels: string[][] = [];
  readonly screened: ScreenInput[] = [];
  screen(input: ScreenInput): Promise<ScreenResult> {
    this.screened.push(input);
    const score = this.next.shift() ?? 0;
    const labels = this.nextLabels.shift() ?? (score >= 0.5 ? ["stand-in label"] : []);
    const r = score >= 0.5 ? { verdict: "rejected" as const, reason: "stand-in reason", score, labels } : { verdict: "clean" as const, score, labels };
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

export async function makeBusiness(db: PrismaService, accountId: string, over: { plan?: string | null; vault?: bigint; pack?: number; packEnds?: Date; renews?: Date | null } = {}): Promise<string> {
  const id = ids.next();
  const plan = over.plan === undefined ? "starter" : over.plan;
  // EA3: the plan's Vault space counts only while the plan is live, so a plan made here renews far ahead unless a test says otherwise.
  const renews = over.renews === undefined ? (plan ? new Date("2999-01-01T00:00:00.000Z") : null) : over.renews;
  await db.business.create({ data: { id, accountId, plan, renews, vault: over.vault ?? 0n, pack: over.pack, packEnds: over.packEnds } });
  return id;
}

export async function makeWish(db: PrismaService, accountId: string, status: WishStatus = "draft", ticket: WishTicket | null = "keepsake"): Promise<string> {
  const id = ids.next();
  await db.wish.create({
    data: { id, accountId, status, ticket, kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos" },
  });
  return id;
}

/** Puts bytes where the browser's signed PUT would: on the file's STAGING key (Y1), as storage takes it (type and length bound, X26). */
export async function stage(t: TestApp, db: PrismaService, id: string, bytes: Buffer, contentType: string): Promise<string> {
  const key = stagingKeyOf((await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey);
  if (!t.storage.putSigned(key, bytes, contentType)) t.storage.put(key, bytes, contentType);
  return key;
}
