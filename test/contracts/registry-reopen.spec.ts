// The registry reopened for P1 to P4 (DEC-132..135): the contracts refuse what the rulings removed.
import { HttpException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { UuidV7Maker } from "../../src/common/ids/uuidv7";
import { makeValidationPipe } from "../../src/common/validation/validation.pipe";
import {
  PatchMeNoticePrefsBodyDto,
  PostAuthCodesBodyDto,
  PostPaymentsBodyDto,
  PostWishesByIdKeepBodyDto,
  PutAdminNumbersTargetsBodyDto,
} from "../../src/contracts";

const pipe = makeValidationPipe();

async function check(metatype: new () => object, body: Record<string, unknown>) {
  try {
    await pipe.transform(body, { type: "body", metatype });
    return { status: 200, fields: {} as Record<string, string> };
  } catch (e) {
    const ex = e as HttpException;
    const res = ex.getResponse() as { fields?: Record<string, string> };
    return { status: ex.getStatus(), fields: res.fields ?? {} };
  }
}

describe("P3 (DEC-134): a payment start carries no amount or price", () => {
  it("refuses amount on POST /v1/payments as an unknown field (422)", async () => {
    const r = await check(PostPaymentsBodyDto, { purpose: "pass", subjectId: "x", amount: "₦20,000" });
    expect(r.status).toBe(422);
    expect(r.fields.amount).toBe("Not a known field.");
  });
  it("refuses price on POST /v1/payments and on keep longer", async () => {
    expect((await check(PostPaymentsBodyDto, { purpose: "pass", price: 3000 })).fields.price).toBe("Not a known field.");
    expect((await check(PostWishesByIdKeepBodyDto, { keep: "month", price: "₦1,500" })).fields.price).toBe("Not a known field.");
  });
  it("takes a payment start without them", async () => {
    expect((await check(PostPaymentsBodyDto, { purpose: "pass", subjectId: "x" })).status).toBe(200);
  });
});

describe("P4 (DEC-135, R11): email is the only channel", () => {
  it("refuses a code request with channel sms (422)", async () => {
    const r = await check(PostAuthCodesBodyDto, { contact: "ada@example.com", channel: "sms" });
    expect(r.status).toBe(422);
    expect(r.fields.channel).toBe("Not a known field.");
  });
  it("takes a code request without a channel", async () => {
    expect((await check(PostAuthCodesBodyDto, { contact: "ada@example.com" })).status).toBe(200);
  });
  it("refuses a channel on notice choices", async () => {
    expect((await check(PatchMeNoticePrefsBodyDto, { channel: "whatsapp" })).status).toBe(422);
  });
});

describe("P1 (DEC-132): numbers targets", () => {
  const ok = { line: "tickets", period: "month", targetKobo: 50_000_000, reason: "monthly plan" };
  it("takes a line, the month, a target in kobo and a reason", async () => {
    expect((await check(PutAdminNumbersTargetsBodyDto, ok)).status).toBe(200);
  });
  it("refuses an unknown line, another period, a non-integer target and no reason", async () => {
    expect((await check(PutAdminNumbersTargetsBodyDto, { ...ok, line: "ads" })).fields.line).toBeDefined();
    expect((await check(PutAdminNumbersTargetsBodyDto, { ...ok, period: "week" })).fields.period).toBeDefined();
    expect((await check(PutAdminNumbersTargetsBodyDto, { ...ok, targetKobo: 12.5 })).fields.targetKobo).toBeDefined();
    const { reason: _r, ...noReason } = ok;
    expect((await check(PutAdminNumbersTargetsBodyDto, noReason)).fields.reason).toBeDefined();
  });
});

describe("P1 (DEC-132): NumbersTarget stores one target per line and month", () => {
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const ids = new UuidV7Maker();
  afterAll(async () => {
    await db.$disconnect();
  });
  it("keeps targetKobo as a whole kobo BigInt and refuses a second row for the same line and period", async () => {
    const staff = ids.next();
    await db.staffAccount.create({ data: { id: staff, email: `int7-target-${process.pid}-${Date.now()}@example.com`, name: "Staff", roles: ["finance"], status: "active" } });
    const row = { line: "extras" as const, period: "month" as const, targetKobo: 12_000_000n, setBy: staff, setAt: new Date() };
    const made = await db.numbersTarget.create({ data: { id: ids.next(), ...row } });
    expect(made.targetKobo).toBe(12_000_000n);
    const e: unknown = await db.numbersTarget.create({ data: { id: ids.next(), ...row } }).catch((x: unknown) => x);
    expect(e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined).toBe("P2002");
  });
  it("INT-7: refuses a target whose setBy is no staff account (the foreign key)", async () => {
    const e: unknown = await db.numbersTarget.create({ data: { id: ids.next(), line: "keeps", period: "month", targetKobo: 1n, setBy: ids.next(), setAt: new Date() } }).catch((x: unknown) => x);
    expect(e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined).toBe("P2003");
  });
});
