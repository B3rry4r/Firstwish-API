import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, GB, ids, JPEG, makeAccount, makeBusiness, MB, stage } from "./files-kit";

describe("EA3 (wave 6 join): the Vault's limit counts the plan's space only while the plan is live; the peak is lifted on confirm", () => {
  let t: TestApp;
  let db: PrismaService;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db } = await filesApp());
  });
  afterAll(() => t.close());

  const ticket = (token: string, bytes: number) => t.http().post("/v1/uploads").set(auth(token)).send({ purpose: "vault", contentType: "image/jpeg", bytes });
  const confirm = (token: string, id: string) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth(token)).send({ fileId: id });
  const month = () => t.clock.now().toISOString().slice(0, 7);

  it("a lapsed plan is refused at the ticket; a live plan is not; a live pack grant alone gives its own space", async () => {
    const live = await makeAccount(db, t, ["person", "business"]);
    await makeBusiness(db, live.id, { plan: "starter", renews: new Date(t.clock.now().getTime() + 86_400_000) });
    expect((await ticket(live.token, 1000)).status).toBe(201);

    const lapsed = await makeAccount(db, t, ["person", "business"]);
    const bizId = await makeBusiness(db, lapsed.id, { plan: "starter", renews: new Date(t.clock.now().getTime() - 1000) });
    const refused = await ticket(lapsed.token, 1000);
    expect(refused.status).toBe(403);

    // a pack's 20 GB counts alone: 19.99 GB used leaves room for a small file and not for a 100 MB one
    const at = t.clock.now();
    const payId = ids.next();
    await db.payment.create({ data: { id: payId, purpose: "wish_pack", lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `j6-${payId}`, idempotencyKey: `j6-${payId}`, updatedAt: at } });
    await db.purchaseGrant.create({ data: { id: ids.next(), paymentId: payId, sku: "pro.pack", kind: "wish-pack", businessId: bizId, detail: { vaultGb: 20 }, startsAt: at, endsAt: new Date(at.getTime() + 86_400_000), createdAt: at } });
    await db.business.update({ where: { id: bizId }, data: { vault: BigInt(20 * GB - 50 * MB) } });
    expect((await ticket(lapsed.token, 10 * MB)).status).toBe(201);
    const over = await ticket(lapsed.token, 60 * MB);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("vault_full");
    // the same business with its plan renewed: the plan's 100 GB counts again
    await db.business.update({ where: { id: bizId }, data: { renews: new Date(at.getTime() + 30 * 86_400_000) } });
    expect((await ticket(lapsed.token, 60 * MB)).status).toBe(201);
  });

  it("a plan that lapses between the ticket and the confirm is refused at the confirm too (vault_full, file removed)", async () => {
    const o = await makeAccount(db, t, ["person", "business"]);
    const bizId = await makeBusiness(db, o.id, { plan: "starter", renews: new Date(t.clock.now().getTime() + 86_400_000) });
    const r = await ticket(o.token, 4000);
    expect(r.status).toBe(201);
    await stage(t, db, r.body.id as string, JPEG(4000), "image/jpeg");
    await db.business.update({ where: { id: bizId }, data: { renews: new Date(t.clock.now().getTime() - 1000) } });
    const c = await confirm(o.token, r.body.id as string);
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe("vault_full");
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(0);
  });

  it("the file-confirm path lifts the month's peak, in step with the count, and a delete never lowers it", async () => {
    const o = await makeAccount(db, t, ["person", "business"]);
    const bizId = await makeBusiness(db, o.id, { plan: "starter" });
    expect(await db.vaultPeak.count({ where: { businessId: bizId } })).toBe(0);
    const ids2: string[] = [];
    for (const n of [5000, 3000]) {
      const r = await ticket(o.token, n);
      await stage(t, db, r.body.id as string, JPEG(n), "image/jpeg");
      expect((await confirm(o.token, r.body.id as string)).status).toBe(200);
      ids2.push(r.body.id as string);
    }
    const peak = async () => (await db.vaultPeak.findUniqueOrThrow({ where: { businessId_month: { businessId: bizId, month: month() } } })).bytes;
    expect(await peak()).toBe(8000n);
    expect((await t.http().delete(`/v1/uploads/${ids2[0]}`).set(auth(o.token))).status).toBe(204);
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(3000);
    expect(await peak()).toBe(8000n);
    // 10 at once: the peak ends at the exact total of the count
    const made: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await ticket(o.token, 1000 + i);
      await stage(t, db, r.body.id as string, JPEG(1000 + i), "image/jpeg");
      made.push(r.body.id as string);
    }
    expect((await Promise.all(made.map((id) => confirm(o.token, id)))).every((r) => r.status === 200)).toBe(true);
    const used = Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault);
    expect(used).toBe(3000 + 10 * 1000 + 45);
    expect(Number(await peak())).toBe(used);
  });
});
