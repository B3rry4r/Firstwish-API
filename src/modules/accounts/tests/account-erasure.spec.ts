import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { IdGenerator } from "../../../common/ports/ids.port";
import { bearer, signIn, SignInApp, signInApp, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { AccountErasureService, ERASE_LINKS, FRESH_SIGN_IN_MS, NOT_THIS_ACCOUNT } from "../account-erasure.service";
import { newCreator, uniqueHandle } from "./sides.kit";

type Rules = Record<string, { erase?: Record<string, { rule: "blank" | "keep" }> }>;
const schemaMap = JSON.parse(readFileSync(join(__dirname, "../../../../.pipeline/schema-map.json"), "utf8")) as { resources: Rules };
const BLANK: Record<string, string[]> = {};
for (const [name, r] of Object.entries(schemaMap.resources)) {
  const cols = Object.entries(r.erase ?? {}).filter(([, v]) => v.rule === "blank").map(([k]) => k);
  if (cols.length) BLANK[name] = cols;
}

type Delegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  findMany(args: { where: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
};
const models = Prisma.dmmf.datamodel.models;
const enums = Prisma.dmmf.datamodel.enums;
const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1);

describe("erase on request (Q9): every 'blank' column in schema-map, in one transaction", () => {
  let t: SignInApp;
  let erasure: AccountErasureService;
  let id: () => string;
  beforeAll(async () => {
    t = await signInApp();
    erasure = t.app.get(AccountErasureService);
    const ids = t.app.get(IdGenerator);
    id = () => ids.id();
  });
  afterAll(() => t.close());

  const db = (model: string) => (t.db as unknown as Record<string, Delegate>)[delegateName(model)];
  const actor = { type: "account" as const, id: null, requestId: "test-erase" };

  /** A personal value for a column of this type: what an erase must remove. */
  function personal(type: string, isList: boolean): unknown {
    const one = type === "String" ? "personal value" : type === "Json" ? { who: "personal value" } : type === "DateTime" ? new Date("1990-05-01T00:00:00Z") : null;
    if (one === null) throw new Error(`no personal value for ${type}`);
    return isList ? [one] : one;
  }

  /** A row of the model with every required column filled, every 'blank' column personal, and `link` on top. */
  async function seed(model: string, link: Record<string, unknown>): Promise<string> {
    const m = models.find((x) => x.name === model);
    if (!m) throw new Error(`no model ${model}`);
    const data: Record<string, unknown> = {};
    for (const f of m.fields) {
      if (f.kind === "object" || f.isUpdatedAt) continue;
      if (BLANK[model]?.includes(f.name)) {
        data[f.name] = personal(f.type, f.isList);
        continue;
      }
      if (!f.isRequired || f.hasDefaultValue || f.isList) continue;
      if (f.kind === "enum") data[f.name] = enums.find((e) => e.name === f.type)?.values[0].name;
      else if (f.name === "id" || f.name.endsWith("Id")) data[f.name] = id();
      else if (f.type === "String") data[f.name] = `x-${id()}`;
      else data[f.name] = ({ Int: 0, BigInt: BigInt(500), Boolean: false, DateTime: new Date(), Json: {} } as Record<string, unknown>)[f.type];
    }
    Object.assign(data, link);
    return (await db(model).create({ data })).id;
  }

  it("ERASE_LINKS covers every resource schema-map gives a 'blank' rule (or says why not)", () => {
    const covered = [...Object.keys(ERASE_LINKS), ...Object.keys(NOT_THIS_ACCOUNT)].sort();
    expect(covered).toEqual(Object.keys(BLANK).sort());
  });

  it("blanks every 'blank' column for this account, keeps money and other accounts' rows, ends sessions and pages", async () => {
    const email = uniqueEmail("erase");
    const s = await signIn(t, email);
    const handle = uniqueHandle("er");
    await t.http().post("/v1/me/creator").set(bearer(s.accessToken)).send({ handle, name: "Ada", bio: "Weddings", contact: "0803 147 2093" });
    await t.http().post("/v1/me/business").set(bearer(s.accessToken)).send({ business: "Ada Frames", name: "Ada Obi" });
    await t.http().patch("/v1/me").set(bearer(s.accessToken)).send({ name: "Ada Obi", dates: [{ name: "Mum", date: "2027-03-14" }] });
    await t.db.account.update({ where: { id: s.accountId }, data: { dates: { personal: "value" } } });
    await t.db.session.updateMany({ where: { accountId: s.accountId }, data: { ip: "10.1.2.3", userAgent: "Phone" } });
    await t.db.authCode.updateMany({ where: { destination: email }, data: { ip: "10.1.2.3", canonical: email, triedFrom: ["10.1.2.3"] } });
    const other = await signIn(t, uniqueEmail("keep"));
    const fan = await signIn(t, uniqueEmail("fan"));
    await t.http().put(`/v1/creators/${handle}/follow`).set(bearer(fan.accessToken));
    const otherCreator = await newCreator(t, "oc");
    await t.http().put(`/v1/creators/${otherCreator.handle}/follow`).set(bearer(s.accessToken));

    const accountId = s.accountId;
    const creatorId = (await t.db.creator.findUniqueOrThrow({ where: { accountId } })).id;
    const businessId = (await t.db.business.findFirstOrThrow({ where: { accountId } })).id;
    const wishId = await seed("Wish", { accountId, status: "live" });
    const threadId = await seed("SupportThread", { accountId });
    const where: Record<string, Record<string, unknown>> = {
      Account: { id: accountId },
      AuthCode: { OR: [{ destination: email }, { canonical: email }, { destination: "" }] },
      BankAccount: { creatorId },
      Business: { accountId },
      ClientWish: { businessId },
      Creator: { accountId },
      DateRow: { accountId },
      ExternalIdentity: { accountId },
      Login: { businessId },
      Notice: { accountId },
      Payment: { accountId },
      Person: { businessId },
      PublishedWish: { wish: wishId },
      QrCard: { wishId },
      Report: { accountId },
      Session: { accountId },
      SupportMessage: { threadId },
      SupportThread: { accountId },
      Wish: { accountId },
    };
    await seed("BankAccount", { creatorId });
    await seed("ClientWish", { businessId });
    await seed("DateRow", { accountId });
    await seed("ExternalIdentity", { accountId, subject: `google-${id()}`, email });
    await seed("Login", { businessId });
    await seed("Notice", { accountId });
    const paymentId = await seed("Payment", { accountId, amountKobo: BigInt(250000) });
    await seed("Person", { businessId });
    await seed("PublishedWish", { wish: wishId });
    await seed("QrCard", { wishId });
    await seed("Report", { accountId });
    await seed("SupportMessage", { threadId });
    const deliveryId = await seed("MessageDelivery", { to: email });
    // Another account's rows: never touched.
    const keptDate = await seed("DateRow", { accountId: other.accountId });
    const keptPayment = await seed("Payment", { accountId: other.accountId });

    await erasure.erase(accountId, { actor: { ...actor, id: accountId }, reason: null, freshFamilyId: undefined });

    const blanked = (v: unknown) => v === null || v === "" || (Array.isArray(v) && v.length === 0);
    for (const [model, cols] of Object.entries(BLANK)) {
      if (model in NOT_THIS_ACCOUNT) continue;
      const rows = model === "MessageDelivery" ? await db(model).findMany({ where: { id: deliveryId } }) : await db(model).findMany({ where: where[model] });
      expect({ model, rows: rows.length > 0 }).toEqual({ model, rows: true });
      for (const row of rows) for (const c of cols) expect({ model, column: c, blank: blanked(row[c]) }).toEqual({ model, column: c, blank: true });
    }

    const acct = await t.db.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(acct.erasedAt).not.toBeNull();
    expect(acct.sides).toEqual(["person"]);
    expect(await t.db.session.count({ where: { accountId, revokedAt: null } })).toBe(0);
    expect((await t.http().get("/v1/me").set(bearer(s.accessToken))).status).toBe(401);
    expect((await t.db.payment.findUniqueOrThrow({ where: { id: paymentId } })).amountKobo).toBe(BigInt(250000));
    expect((await t.db.wish.findUniqueOrThrow({ where: { id: wishId } })).status).toBe("removed");
    expect(await t.db.wishTransition.count({ where: { wishId, to: "removed", cause: "account.erase" } })).toBe(1);
    expect(await t.db.follow.count({ where: { OR: [{ accountId }, { handle }] } })).toBe(0);
    expect((await t.db.dateRow.findUniqueOrThrow({ where: { id: keptDate } })).name).toBe("personal value");
    expect((await t.db.payment.findUniqueOrThrow({ where: { id: keptPayment } })).payerContact).toBe("personal value");
    expect(await t.db.auditEntry.count({ where: { subjectId: accountId, action: "account.erase" } })).toBe(1);

    // Its public pages are gone; the handle is free; the email signs up again as a new, empty account.
    const list = await t.http().get("/v1/creators?limit=50");
    expect(JSON.stringify(list.body)).not.toContain(handle);
    expect((await t.http().put(`/v1/creators/${handle}/follow`).set(bearer(fan.accessToken))).status).toBe(404);
    expect((await t.http().patch("/v1/me").set(bearer(other.accessToken)).send({ handle })).status).toBe(200);
    const again = await signIn(t, email);
    expect(again.accountId).not.toBe(accountId);
    expect((await t.http().get("/v1/me").set(bearer(again.accessToken))).body).toMatchObject({ email, name: null, handle: null, sides: ["person"], dates: [], wishCount: 0 });

    // Erasing again changes nothing.
    await erasure.erase(accountId, { actor, reason: null });
    expect(await t.db.auditEntry.count({ where: { subjectId: accountId, action: "account.erase" } })).toBe(1);
  });

  it("a person's own erase needs a sign-in younger than 10 minutes, else 403 saying so", async () => {
    const s = await signIn(t, uniqueEmail("fresh"));
    const familyId = (await t.db.session.findUniqueOrThrow({ where: { id: s.sessionId } })).familyId;
    t.clock.advance(FRESH_SIGN_IN_MS + 1000);
    type Refusal = { getStatus(): number; code: string; message: string };
    const err = (await erasure.erase(s.accountId, { actor, reason: null, freshFamilyId: familyId }).then(
      () => null,
      (e: unknown) => e,
    )) as Refusal;
    expect(err).toMatchObject({ code: "fresh_sign_in_needed" });
    expect(err.getStatus()).toBe(403);
    expect(err.message).toMatch(/last 10 minutes/);
    expect((await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } })).erasedAt).toBeNull();
    // Another account's family never counts as fresh for this one.
    const o = await signIn(t, uniqueEmail("fresh2"));
    const otherFamily = (await t.db.session.findUniqueOrThrow({ where: { id: o.sessionId } })).familyId;
    await expect(erasure.erase(s.accountId, { actor, reason: null, freshFamilyId: otherFamily })).rejects.toMatchObject({ code: "fresh_sign_in_needed" });
    const fresh = await signIn(t, uniqueEmail("fresh3"));
    const fam = (await t.db.session.findUniqueOrThrow({ where: { id: fresh.sessionId } })).familyId;
    await erasure.erase(fresh.accountId, { actor, reason: null, freshFamilyId: fam });
    expect((await t.db.account.findUniqueOrThrow({ where: { id: fresh.accountId } })).erasedAt).not.toBeNull();
  });

  it("one transaction: when a step fails, nothing is blanked", async () => {
    const s = await newCreator(t, "atom");
    await expect(erasure.erase(s.accountId, { actor: { type: "staff", id: null, requestId: "t" }, reason: "x" })).rejects.toMatchObject({ code: "validation_failed" });
    const row = await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } });
    expect(row).toMatchObject({ erasedAt: null, handle: s.handle });
    expect(row.contact).not.toBeNull();
    expect(await t.db.session.count({ where: { accountId: s.accountId, revokedAt: null } })).toBeGreaterThan(0);
  });

  it("two erases at once: one runs, one audit row", async () => {
    const s = await signIn(t, uniqueEmail("twice"));
    await Promise.all([erasure.erase(s.accountId, { actor, reason: null }), erasure.erase(s.accountId, { actor, reason: null })]);
    expect(await t.db.auditEntry.count({ where: { subjectId: s.accountId, action: "account.erase" } })).toBe(1);
  });
});
