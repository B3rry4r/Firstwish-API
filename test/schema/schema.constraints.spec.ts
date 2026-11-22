import { Prisma, PrismaClient } from "@prisma/client";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UuidV7Maker } from "../../src/common/ids/uuidv7";
import { PostAdminPaymentsByReferenceRefundBodyDto } from "../../src/contracts";
import { RUN } from "../kit/unique";

/*
 * The database refuses what the money rules forbid, whatever a service does: the ledger is append-only (a trigger), and a
 * repeated idempotency key, payment reference or webhook event id is refused by a unique index.
 */
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const ids = new UuidV7Maker();

afterAll(async () => {
  await db.$disconnect();
});

function payment(over: Partial<Prisma.PaymentUncheckedCreateInput> = {}): Prisma.PaymentUncheckedCreateInput {
  return {
    id: ids.next(),
    purpose: "ticket",
    lines: [{ sku: "ticket.moment", kobo: 300000 }],
    amountKobo: 300000n,
    currency: "NGN",
    priceBookVersion: 1,
    status: "started",
    provider: "paystack",
    providerReference: `fw_${ids.next()}`,
    idempotencyKey: ids.next(),
    ...over,
  };
}

function uniqueRefusal(e: unknown): string | undefined {
  return e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
}

describe("ledger is append-only", () => {
  let entryId: string;

  beforeAll(async () => {
    const p = await db.payment.create({ data: payment() });
    const row = await db.ledgerEntry.create({
      data: { id: ids.next(), journalId: ids.next(), account: "customer_cash", direction: "debit", amountKobo: 300000n, currency: "NGN", paymentId: p.id, memo: "ticket.moment" },
    });
    entryId = row.id;
  });

  it("refuses an update", async () => {
    await expect(db.ledgerEntry.update({ where: { id: entryId }, data: { memo: "changed" } })).rejects.toThrow(/append-only/);
  });

  it("refuses a delete", async () => {
    await expect(db.ledgerEntry.delete({ where: { id: entryId } })).rejects.toThrow(/append-only/);
    await expect(db.ledgerEntry.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it("refuses a truncate", async () => {
    await expect(db.$executeRawUnsafe('TRUNCATE "ledger_entry"')).rejects.toThrow(/append-only/);
  });

  it("keeps the row as written", async () => {
    const row = await db.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.memo).toBe("ticket.moment");
    expect(row.amountKobo).toBe(300000n);
  });
});

describe("INT-7: an account row is never deleted", () => {
  it("refuses a hard delete at the database, and the row is still there", async () => {
    const id = ids.next();
    await db.account.create({ data: { id, lastSide: "person", contact: `int7-del-${RUN}-${Date.now()}@example.com` } });
    await expect(db.account.delete({ where: { id } })).rejects.toThrow(/never deleted/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "account" WHERE id = '${id}'::uuid`)).rejects.toThrow(/never deleted/);
    expect(await db.account.count({ where: { id } })).toBe(1);
  });
});

describe("audit rows are never edited", () => {
  it("refuses an update", async () => {
    const a = await db.auditEntry.create({
      data: { id: ids.next(), actorType: "staff", actorId: ids.next(), action: "payment.refund", subjectType: "Payment", subjectId: ids.next(), requestId: "req-1" },
    });
    await expect(db.auditEntry.update({ where: { id: a.id }, data: { action: "other" } })).rejects.toThrow(/append-only/);
  });
});

describe("repeats are refused", () => {
  it("refuses a second payment with the same idempotency key", async () => {
    const key = ids.next();
    await db.payment.create({ data: payment({ idempotencyKey: key }) });
    const e: unknown = await db.payment.create({ data: payment({ idempotencyKey: key }) }).catch((x: unknown) => x);
    expect(uniqueRefusal(e)).toBe("P2002");
  });

  it("refuses a second payment with the same reference", async () => {
    const ref = `fw_${ids.next()}`;
    await db.payment.create({ data: payment({ providerReference: ref }) });
    const e: unknown = await db.payment.create({ data: payment({ providerReference: ref }) }).catch((x: unknown) => x);
    expect(uniqueRefusal(e)).toBe("P2002");
  });

  it("refuses a second webhook event with the same provider event id", async () => {
    const event = { provider: "paystack", eventId: `evt_${ids.next()}`, type: "charge.success", signatureValid: true, payload: { event: "charge.success" } };
    await db.webhookEvent.create({ data: { id: ids.next(), ...event } });
    const e: unknown = await db.webhookEvent.create({ data: { id: ids.next(), ...event } }).catch((x: unknown) => x);
    expect(uniqueRefusal(e)).toBe("P2002");
  });
});

describe("contracts validate in the skeleton's way", () => {
  it("refuses an admin reason under 4 characters after trimming (DEC-125)", async () => {
    const short = await validate(plainToInstance(PostAdminPaymentsByReferenceRefundBodyDto, { reason: "  ab  " }));
    expect(short.map((x) => x.property)).toEqual(["reason"]);
    const ok = await validate(plainToInstance(PostAdminPaymentsByReferenceRefundBodyDto, { reason: "duplicate charge" }));
    expect(ok).toEqual([]);
  });
});
