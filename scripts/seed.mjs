#!/usr/bin/env node
// Reference rows only: the price book (version 1, its lines in kobo, the promotion, entitlements), the staff roles and the
// sections each opens, the lifecycle terms and the PROVISIONAL payout threshold, and the catalogues the web app holds as
// constants (prisma/seed-data/*.json, written by scripts/export-seed-data.mjs; ruling Q11). Never people or wishes; the one
// account is the house (X8): handle firstwish, a creator side, no email, so it can never sign in.
// Running it twice gives the same rows: every row has a fixed id made from its natural key and is upserted.
//   DATABASE_URL=... node scripts/seed.mjs            (node scripts/seed.mjs styles: the styles alone)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const priceBook = JSON.parse(readFileSync(join(ROOT, ".pipeline/declared/price-book.json"), "utf8"));
const royalties = JSON.parse(readFileSync(join(ROOT, ".pipeline/declared/royalties-payouts.json"), "utf8"));

const SEED_MS = Date.UTC(2026, 10, 15); // the day the registry froze; seed ids sort before any live row

/** A UUIDv7 with a fixed time and bits from the row's natural key, so a re-run upserts the same row. */
export function seedId(key) {
  const h = createHash("sha256").update(`firstwish-seed:${key}`).digest();
  const b = Buffer.alloc(16);
  b.writeUIntBE(SEED_MS, 0, 6);
  h.copy(b, 6, 0, 10);
  b[6] = 0x70 | (b[6] & 0x0f);
  b[8] = 0x80 | (b[8] & 0x3f);
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/* Default (lead), owner may override: what each staff role opens (the web app's Team access table, lib/admin/d-fixtures.ts). */
const ALL = ["/admin", "/admin/wishes", "/admin/people", "/admin/moderation", "/admin/showing", "/admin/styles", "/admin/styles/review",
  "/admin/creators", "/admin/payments", "/admin/businesses", "/admin/concierge", "/admin/prices", "/admin/support", "/admin/messages",
  "/admin/numbers", "/admin/team", "/admin/audit", "/admin/settings"];
const ROLE_SECTIONS = {
  owner: ALL,
  // X16: ops reads /admin/prices (E-123); only owner and finance change a price (E-124's roles, A9).
  ops: ALL.filter((h) => !["/admin/team", "/admin/settings"].includes(h)),
  moderator: ["/admin", "/admin/wishes", "/admin/people", "/admin/moderation", "/admin/showing"],
  reviewer: ["/admin", "/admin/styles", "/admin/styles/review", "/admin/creators"],
  support: ["/admin", "/admin/wishes", "/admin/people", "/admin/support", "/admin/messages"],
  finance: ["/admin", "/admin/payments", "/admin/businesses", "/admin/creators", "/admin/prices", "/admin/numbers"],
  maker: ["/admin", "/admin/concierge"],
};

/* Entitlements, from the price-book declaration's behaviour (the app's account.ts, catalog.ts, pro-data.ts, studio.ts). */
const ENTITLEMENTS = {
  // Each ticket: term, photos, clips, style level and the extras it may take (catalog.ts extras table, "Yes" cells).
  // Then what each extra, keep and Concierge line grants (catalog.ts:397-413; product-plan T-36 for the rush).
  tickets: {
    moment: { termDays: 7, photos: 6, clips: 0, keepable: false, styleLevel: "starter", takes: [] },
    keepsake: { termDays: 14, photos: 15, clips: 0, keepable: true, styleLevel: "standard",
      takes: ["extra.five-photos", "extra.premium-style", "extra.portrait-video", "extra.qr-card"] },
    signature: { termDays: 30, photos: 15, clips: 0, keepable: true, styleLevel: "premium", portraitVideo: true, qrCard: true,
      friendMessagesMax: 10, takes: ["extra.five-photos"] },
    premiere: { termDays: 60, photos: 20, clips: 3, clipSeconds: 15, keepable: true, styleLevel: "premium", video: true,
      portraitVideo: true, qrCard: true, takes: ["extra.clip-15s", "extra.clip-60s"] },
    extras: {
      "five-photos": { photos: 5 },
      "premium-style": { styleLevel: "premium" },
      "portrait-video": { portraitVideo: true },
      "qr-card": { qrCard: true },
      "clip-15s": { clips: 1, clipSeconds: 15, video: true },
      "clip-60s": { clips: 1, clipSeconds: 60, video: true },
    },
    keeps: { month: { termDays: 30 }, half: { termDays: 182 }, year: { termDays: 365 } },
    concierge: { single: { wishes: 1 } },
  },
  keepsakeExtrasCeilingKobo: 750000n,
  passWishes: 20,
  passUpgrades: 4,
  conciergePassDiscountPercent: 20,
  vatRate: "7.5",
  creator: {
    open: { creditsOnce: 3, reviewsPerMonth: 1, drafts: 1 },
    creator: { credits: 10, reviewsPerMonth: 2, drafts: "unlimited" },
    signed: { signed: true, days: 30 },
    creditPack: { credits: 5 },
    extraReview: { reviews: 1 },
    costs: { draft: 4, change: 1 },
    sharePercent: 20,
    templateRoyaltyPercent: 25,
  },
  pro: {
    starter: { wishes: 10, logins: 1, vaultGb: 100 },
    studio: { wishes: 35, logins: 3, vaultGb: 500 },
    pack: { wishes: 5, vaultGb: 20, days: 90 },
    vault: { block: { vaultGb: 100, days: 30 }, "block-bulk": { vaultGb: 100, days: 30, fromGb: 1000 } },
  },
};

/* Z2: concierge.rush is in no web app file and by R5 the app is the truth for what is sold, so it is not seeded (listed to the
   owner; it comes back as a price line when the app sells it). A copy an earlier seed wrote is removed. */
const NOT_SOLD = new Set(["concierge.rush"]);
const SOLD_PRICES = priceBook.seed.prices.filter((p) => !NOT_SOLD.has(p.sku));

/* X8: the house. Styles and wishes made by Firstwish have an owner, and the creators list includes it. No email and no Google
   identity: no sign-in can ever reach it. "firstwish" is a reserved handle, so no person can take it. */
export const HOUSE_ACCOUNT_ID = seedId("account:house");
export const HOUSE_HANDLE = "firstwish";

async function seedHouse(db) {
  const at = new Date(SEED_MS);
  const account = { name: "Firstwish", handle: HOUSE_HANDLE, sides: ["person", "creator"], lastSide: "creator", contact: null, phone: null };
  await db.account.upsert({ where: { id: HOUSE_ACCOUNT_ID }, create: { id: HOUSE_ACCOUNT_ID, ...account, createdAt: at }, update: account });
  const creatorId = seedId("creator:house");
  const creator = { accountId: HOUSE_ACCOUNT_ID, name: "Firstwish", house: true, href: `/creators/${HOUSE_HANDLE}`, line: "Made by Firstwish" };
  await db.creator.upsert({ where: { accountId: HOUSE_ACCOUNT_ID }, create: { id: creatorId, ...creator }, update: creator });
}

/* Lifecycle terms (DEC-70), from the wish-lifecycle declaration and the app's account.ts. */
const LIFECYCLE = {
  HOLD_DAYS: 365,
  RESTORE_DAYS: 30,
  TERM_DAYS: { moment: 7, keepsake: 14, signature: 30, premiere: 60 },
  restingHoldMonths: 12,
  restoreWindowDays: 30,
  /* CC3 (PROVISIONAL, listed to the owner): a wish's content is at most this many bytes. The web app's catalog gives no chapters
     limit per ticket (only lists of chapter names), so none is seeded. */
  wishContentMaxBytes: 262144,
};

/* EE1: the time limit of one run of each kind of job, in seconds. A kind with no row runs under 60. PROVISIONAL. */
const JOB_TIME_LIMITS = {
  "open-wish": 60, "rest-wish": 60, "erase-wish": 60, "erase-now": 60, "restore-window-end": 60, "send-notice": 60,
  "abandon-payment": 60, "upload-cleanup": 120, "make-image-sizes": 120,
};

/* Q11: the config tables no route writes, from the web app's constants (prisma/seed-data, named in schema-map seedFrom). */
const SEED_DATA = ["EndingPurpose", "OpeningDef", "ChapterSpec", "Moment", "Template", "SavedReply", "Provider", "MessageTemplate"];

async function seedCatalogues(db) {
  for (const table of SEED_DATA) {
    const doc = JSON.parse(readFileSync(join(ROOT, `prisma/seed-data/${table}.json`), "utf8"));
    const model = db[table[0].toLowerCase() + table.slice(1)];
    for (const { seedKey, ...r } of doc.rows) {
      const row = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined));
      const id = seedId(`${table}:${seedKey}`);
      await model.upsert({ where: { id }, create: { id, ...row }, update: row });
    }
  }
}

/* B14: the styles the web app registers today (prisma/seed-data/Style.json), each with the level the app shows now and its
   first level row. Created once: a re-run never undoes a level staff moved or a style staff switched off. */
export async function seedStyles(db) {
  const doc = JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/Style.json"), "utf8"));
  const at = new Date(SEED_MS);
  for (const { seedKey, ...r } of doc.rows) {
    const row = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined));
    const id = seedId(`Style:${seedKey}`);
    await db.style.upsert({ where: { slug: row.slug }, create: { id, ...row, on: true, addedAt: at, record: [] }, update: {} });
    const lid = seedId(`StyleLevel:${seedKey}`);
    await db.styleLevel.upsert({ where: { id: lid }, create: { id: lid, styleSlug: row.slug, slug: row.slug, level: row.level, since: at, by: "seed" }, update: {} });
  }
}

export async function seed(db) {
  const version = 1;
  const effectiveFrom = new Date(SEED_MS);
  await db.priceBookVersion.upsert({
    where: { version },
    create: { id: seedId("price-book:1"), version, effectiveFrom, createdBy: "seed", note: "Seed from the app (R5)", createdAt: effectiveFrom },
    update: {},
  });
  for (const p of SOLD_PRICES) {
    const row = {
      sku: p.sku,
      name: p.name,
      listKobo: BigInt(p.listKobo),
      promoKobo: p.promoKobo === null ? null : BigInt(p.promoKobo),
      discountable: p.promoKobo !== null,
      vatIncluded: /VAT included/i.test(p.name),
      version,
    };
    await db.price.upsert({ where: { sku_version: { sku: p.sku, version } }, create: { id: seedId(`price:${p.sku}:${version}`), ...row }, update: row });
  }
  const promo = priceBook.seed.promotion;
  const promoRow = {
    label: promo.label,
    percentOff: promo.percentOff,
    endsAt: new Date(promo.endsAt),
    appliesTo: SOLD_PRICES.filter((p) => p.promoKobo !== null).map((p) => p.sku),
  };
  await db.price.deleteMany({ where: { sku: { in: [...NOT_SOLD] }, version } });
  await db.promotion.upsert({ where: { id: seedId("promotion:launch-40") }, create: { id: seedId("promotion:launch-40"), ...promoRow }, update: promoRow });
  await db.entitlements.upsert({ where: { id: seedId("entitlements:1") }, create: { id: seedId("entitlements:1"), ...ENTITLEMENTS }, update: ENTITLEMENTS });
  for (const [kind, timeLimitSeconds] of Object.entries(JOB_TIME_LIMITS)) {
    const id = seedId(`job-kind:${kind}`);
    await db.jobKindConfig.upsert({ where: { kind }, create: { id, kind, timeLimitSeconds }, update: { timeLimitSeconds } });
  }
  await db.lifecycleConfig.upsert({ where: { id: seedId("lifecycle:1") }, create: { id: seedId("lifecycle:1"), ...LIFECYCLE }, update: LIFECYCLE });
  for (const [role, sections] of Object.entries(ROLE_SECTIONS)) {
    const id = seedId(`role:${role}`);
    await db.roleAccess.upsert({ where: { id }, create: { id, role, sections }, update: { role, sections } });
  }
  const threshold = royalties.provisional.find((x) => x.key === "payout.thresholdKobo");
  const setting = priceBook.seed.settings.find((x) => x.key === "payout.thresholdKobo");
  const choice = { value: threshold.value, unit: threshold.unit, schedule: setting.schedule, status: "PROVISIONAL", source: setting.source };
  await db.settings.upsert({
    where: { id: seedId("setting:payout.thresholdKobo") },
    create: { id: seedId("setting:payout.thresholdKobo"), key: "payout.thresholdKobo", choice },
    update: { key: "payout.thresholdKobo", choice },
  });
  await seedCatalogues(db);
  await seedStyles(db);
  await seedHouse(db);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = new PrismaClient();
  // One seeder at a time: specs seed the same database from several processes, and an upsert is a read then a write, so two at
  // once race on the same new row. The transaction-level advisory lock makes the second wait for the first to commit.
  const run = () =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(748201)`;
        return process.argv[2] === "styles" ? seedStyles(tx) : seed(tx);
      },
      { timeout: 120_000, maxWait: 120_000 },
    );
  run()
    .then(() => console.log("seed: reference rows in place"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
