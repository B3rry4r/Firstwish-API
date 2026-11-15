import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UuidV7Maker } from "../../src/common/ids/uuidv7";
import { PostAdminRefundsBodyDto, PostAuthCodesBodyDto, PutAdminPricesByKeyBodyDto } from "../../src/contracts";

/*
 * The second reopen's rulings (build/rulings-phase3.md Q4 to Q10), proved against a real database: nothing is granted twice,
 * amounts and counters never go negative, email and handle are unique in any case, the audit log keeps its rows, a calendar
 * date has no time, and a payment with ledger rows cannot be deleted. Plus the contracts Q3, Q6 and Q13 fixed.
 */
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const ids = new UuidV7Maker();
const ROOT = join(__dirname, "../..");

afterAll(async () => {
  await db.$disconnect();
});

function payment(over: Partial<Prisma.PaymentUncheckedCreateInput> = {}): Prisma.PaymentUncheckedCreateInput {
  return {
    id: ids.next(),
    purpose: "ticket",
    lines: [{ sku: "pass.year", kobo: 2000000 }],
    amountKobo: 2000000n,
    currency: "NGN",
    priceBookVersion: 1,
    status: "succeeded",
    provider: "paystack",
    providerReference: `fw_${ids.next()}`,
    idempotencyKey: ids.next(),
    ...over,
  };
}

const code = (e: unknown) => (e instanceof Prisma.PrismaClientKnownRequestError ? e.code : String(e));
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return `${code(e)} ${String((e as Error).message)}`;
  }
  return "accepted";
}

describe("nothing is granted twice (Q5)", () => {
  it("refuses a second pass_membership for one payment", async () => {
    const p = await db.payment.create({ data: payment() });
    await db.passMembership.create({ data: { id: ids.next(), paymentId: p.id } });
    expect(await refusal(db.passMembership.create({ data: { id: ids.next(), paymentId: p.id } }))).toMatch(/^P2002/);
  });

  it("refuses a second payout for one creator and month", async () => {
    const creator = await db.creator.create({ data: { id: ids.next() } });
    const bank = await db.bankAccount.create({ data: { id: ids.next(), creatorId: creator.id } });
    const row = () => ({ id: ids.next(), creatorId: creator.id, month: "2026-10", amountKobo: 500000n, status: "pending" as const, bankAccountId: bank.id });
    await db.payout.create({ data: row() });
    expect(await refusal(db.payout.create({ data: row() }))).toMatch(/^P2002/);
  });

  it("refuses a second royalty accrual for one payment and creator", async () => {
    const creator = await db.creator.create({ data: { id: ids.next() } });
    const p = await db.payment.create({ data: payment() });
    const row = () => ({ id: ids.next(), creatorId: creator.id, styleSlug: "noir", paymentId: p.id, basis: "premium_style" as const, amountKobo: 80000n, month: "2026-10" });
    await db.royaltyAccrual.create({ data: row() });
    expect(await refusal(db.royaltyAccrual.create({ data: row() }))).toMatch(/^P2002/);
  });

  it("sets payment.fulfilledAt once", async () => {
    const p = await db.payment.create({ data: payment({ fulfilledAt: new Date("2026-10-01T10:00:00Z") }) });
    expect(await refusal(db.payment.update({ where: { id: p.id }, data: { fulfilledAt: new Date() } }))).toMatch(/set once/);
  });
});

describe("amounts and counters are never negative (Q5 CHECK)", () => {
  it("refuses a negative amount", async () => {
    expect(await refusal(db.payment.create({ data: payment({ amountKobo: -1n }) }))).toMatch(/payment_amountKobo_nonneg/);
  });

  it("refuses negative credits", async () => {
    expect(await refusal(db.creatorState.create({ data: { id: ids.next(), credits: -1 } }))).toMatch(/creator_state_credits_nonneg/);
  });
});

describe("email and handle are unique in any case (Q7)", () => {
  it("lets Ada@Example.com and ada@example.com not both be accounts", async () => {
    await db.account.create({ data: { id: ids.next(), lastSide: "me", contact: "ada@example.com" } });
    expect(await refusal(db.account.create({ data: { id: ids.next(), lastSide: "me", contact: "Ada@Example.com" } }))).toMatch(/account_contact_lower/);
    expect(await refusal(db.account.create({ data: { id: ids.next(), lastSide: "me", contact: " ada@example.com " } }))).toMatch(/account_contact_lower/);
    expect(await refusal(db.account.create({ data: { id: ids.next(), lastSide: "me", contact: "ada@example.com" } }))).toMatch(/^P2002/);
  });

  it("lets one handle be taken once, in any case, in one namespace", async () => {
    await db.account.create({ data: { id: ids.next(), lastSide: "me", handle: "ada.o" } });
    for (const h of ["ADA.O", "Ada.O", "@ada.o"]) {
      expect(await refusal(db.account.create({ data: { id: ids.next(), lastSide: "me", handle: h } }))).toMatch(/account_handle_canon/);
    }
    expect(await refusal(db.account.create({ data: { id: ids.next(), lastSide: "me", handle: "ada.o" } }))).toMatch(/^P2002/);
    expect(Object.keys(Prisma.CreatorScalarFieldEnum)).not.toContain("handle");
  });
});

describe("the audit log keeps its rows (Q9)", () => {
  it("refuses deleting an audit row", async () => {
    const row = await db.auditEntry.create({
      data: { id: ids.next(), actorType: "system", action: "price.change", subjectType: "Price", subjectId: ids.next(), requestId: ids.next(), after: { changed: ["listKobo"] } },
    });
    expect(await refusal(db.auditEntry.delete({ where: { id: row.id } }))).toMatch(/append-only/);
    expect(await refusal(db.$executeRawUnsafe(`DELETE FROM audit_entry WHERE id = '${row.id}'`))).toMatch(/append-only/);
  });
});

describe("a calendar date has no time (Q4)", () => {
  it("round-trips a birthday as the same day", async () => {
    const id = ids.next();
    await db.person.create({ data: { id, birthday: new Date("1990-05-17") } });
    const back = await db.person.findUniqueOrThrow({ where: { id } });
    expect(back.birthday?.toISOString()).toBe("1990-05-17T00:00:00.000Z");
    const [raw] = await db.$queryRawUnsafe<{ d: string; t: string }[]>(`SELECT birthday::text AS d, pg_typeof(birthday)::text AS t FROM person WHERE id = '${id}'`);
    expect(raw).toEqual({ d: "1990-05-17", t: "date" });
  });
});

describe("the ledger holds its payments (Q10)", () => {
  it("refuses deleting a payment that has ledger rows", async () => {
    const p = await db.payment.create({ data: payment() });
    await db.ledgerEntry.create({
      data: { id: ids.next(), journalId: ids.next(), account: "customer_cash", direction: "debit", amountKobo: 2000000n, currency: "NGN", paymentId: p.id, memo: "pass.year" },
    });
    expect(await refusal(db.payment.delete({ where: { id: p.id } }))).toMatch(/^P2003|ledger_entry_paymentId_fkey|append-only/);
    expect(await db.payment.count({ where: { id: p.id } })).toBe(1);
  });
});

describe("erase rules name real columns (Q9)", () => {
  it("every column an erase rule names exists, and the personal columns have one", () => {
    const map = JSON.parse(readFileSync(join(ROOT, ".pipeline/schema-map.json"), "utf8")).resources as Record<string, { erase?: Record<string, { rule: string }> }>;
    const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]));
    const missing: string[] = [];
    for (const [name, m] of Object.entries(map)) {
      for (const [c, r] of Object.entries(m.erase ?? {})) {
        if (!models.get(name)?.has(c)) missing.push(`${name}.${c}`);
        if (!["blank", "keep"].includes(r.rule)) missing.push(`${name}.${c}: rule ${r.rule}`);
      }
    }
    expect(missing).toEqual([]);
    const personal = ["Payment.payerContact", "MessageDelivery.to", "AuthCode.destination", "AuthCode.ip", "ExternalIdentity.email", "SupportThread.contact",
      "SupportMessage.body", "Report.contact", "Report.reporterContact", "Login.contact", "Person.name", "Person.phone", "Person.birthday", "DateRow.name",
      "DateRow.who", "DateRow.person", "BankAccount.accountNumber", "Business.ownerName", "Creator.name", "PublishedWish.forName", "PublishedWish.from",
      "QrCard.names", "ClientWish.from", "Session.ip", "Wish.name", "Wish.letter", "Wish.content", "Account.name", "Account.contact", "Account.phone"];
    expect(personal.filter((p) => { const [n, c] = p.split("."); return !map[n]?.erase?.[c]; })).toEqual([]);
  });
});

describe("contracts the rulings fixed", () => {
  const errs = async (cls: new () => object, body: object) => (await validate(plainToInstance(cls, body))).map((e) => e.property);

  it("E-145 refund: amount is positive safe kobo, reason 4 or more (Q6)", async () => {
    const ok = { paymentId: ids.next(), amountKobo: 50000, reason: "duplicate charge" };
    expect(await errs(PostAdminRefundsBodyDto, ok)).toEqual([]);
    expect(await errs(PostAdminRefundsBodyDto, { ...ok, amountKobo: -50000 })).toEqual(["amountKobo"]);
    expect(await errs(PostAdminRefundsBodyDto, { ...ok, amountKobo: 0 })).toEqual(["amountKobo"]);
    expect(await errs(PostAdminRefundsBodyDto, { ...ok, amountKobo: 9007199254740992 })).toEqual(["amountKobo"]);
    expect(await errs(PostAdminRefundsBodyDto, { ...ok, reason: "r" })).toEqual(["reason"]);
  });

  it("E-124 price change: a price in kobo can be sent; one of the three is needed (Q3)", async () => {
    expect(await errs(PutAdminPricesByKeyBodyDto, { sku: "ticket.moment", priceKobo: 500000, reason: "new list" })).toEqual([]);
    expect(await errs(PutAdminPricesByKeyBodyDto, { sku: "ticket.moment", promotionEndsAt: "2026-12-31T23:00:00.000Z", reason: "extend promo" })).toEqual([]);
    expect(await errs(PutAdminPricesByKeyBodyDto, { sku: "ticket.moment", reason: "nothing sent" })).toEqual(["reason"]);
    expect(await errs(PutAdminPricesByKeyBodyDto, { sku: "ticket.moment", priceKobo: 5000.5, reason: "a float" })).toEqual(["priceKobo"]);
  });

  it("E-19 sign-in code: email only (Q13, R11)", async () => {
    expect(await errs(PostAuthCodesBodyDto, { contact: "Ada@Example.com", via: "email", mode: "in" })).toEqual([]);
    expect(await errs(PostAuthCodesBodyDto, { contact: "+234 803 000 0000", via: "phone", mode: "in" })).toEqual(["contact", "via"]);
  });

  it("the receiver's read carries no passcode or answer (Q8)", () => {
    const types = readFileSync(join(ROOT, "src/contracts/types.ts"), "utf8");
    const view = types.slice(types.indexOf("export interface PublicWishView {"), types.indexOf("}", types.indexOf("export interface PublicWishView {")));
    expect(view).not.toMatch(/^\s+(passcode|answer)\??:/m);
  });
});
