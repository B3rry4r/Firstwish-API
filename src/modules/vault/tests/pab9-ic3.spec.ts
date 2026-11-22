import { useKit } from "./ab9-kit";

/** IC3: for one shoot and one client there is one reveal; the older send call answers already_sent like the one call, unless asked again. */
describe("IC3: one reveal for a shoot and a client, whichever call order", () => {
  const k = useKit();
  let n = 0;
  const addr = () => `pab9-ic3-${process.pid}-${++n}-${Date.now() % 100000}@example.com`;
  const pack = async (businessId: string) => (await k.db.business.findUniqueOrThrow({ where: { id: businessId }, select: { pack: true } })).pack;
  const reveals = (businessId: string) => k.db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM reveal_access WHERE "businessId" = ${businessId}::uuid`.then((r) => r[0].n);
  const one = (o: { token: string }, shoot: string, over: Record<string, unknown> = {}) => k.post("/v1/business/reveals", o.token, { shoot, set: "proofs", reveal: k.revealBody({ email: addr() }), ...over });
  const e30 = (o: { token: string }) => k.post("/v1/business/client-wishes", o.token, { client: "Ada Obi", kind: "photographers", occasion: "Wedding", day: "2027-03-04" });
  const e33 = (o: { token: string }, wish: string, shoot: string, over: Record<string, unknown> = {}) =>
    k.post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set: "proofs", reveal: k.revealBody({ email: addr() }), ...over });

  it("order E-30, E-33, one call: the one call is 409 already_sent with when and the link; the pack is 9 (E-30 took one); again sends on the same wish and takes none", async () => {
    const o = await k.owner({ allowance: 0, pack: 10 });
    const s = await k.shootWith(o);
    const w = await e30(o);
    expect(w.status).toBe(201);
    expect((await e33(o, w.body.id, s.shoot)).status).toBe(200);
    const again = await one(o, s.shoot);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_sent");
    expect(again.body.error.fields).toMatchObject({ sentAt: "2027-03-01T09:00:00.000Z", link: expect.stringContaining("/r/") });
    expect(await pack(o.businessId)).toBe(9);
    const asked = await one(o, s.shoot, { again: true });
    expect(asked.status).toBe(200);
    expect(asked.body.wish.id).toBe(w.body.id);
    expect(await pack(o.businessId)).toBe(9);
    expect(await reveals(o.businessId)).toBe(1);
  });

  it("order one call, E-30, E-33: E-33 is 409 already_sent with when and the link and sends nothing; the pack is 8 (the one call and E-30 took one each); E-33 again sends and takes none", async () => {
    const o = await k.owner({ allowance: 0, pack: 10 });
    const s = await k.shootWith(o);
    const first = await one(o, s.shoot);
    expect(first.status).toBe(200);
    const w = await e30(o);
    expect(w.status).toBe(201);
    const late = await e33(o, w.body.id, s.shoot);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("already_sent");
    expect(late.body.error.fields).toMatchObject({ sentAt: "2027-03-01T09:00:00.000Z", link: first.body.link });
    expect(await pack(o.businessId)).toBe(8);
    expect(await reveals(o.businessId)).toBe(1);
    expect(await k.db.messageDelivery.count({ where: { templateKey: "reveal", idempotencyKey: { startsWith: `reveal:${w.body.id}:` } } })).toBe(0);
    const asked = await e33(o, w.body.id, s.shoot, { again: true });
    expect(asked.status).toBe(200);
    expect(await pack(o.businessId)).toBe(8);
    expect(await reveals(o.businessId)).toBe(2);
  });

  it("order E-30 only, then one call: the one call makes its own client wish and takes its own wish (the E-30 wish is an ordinary client wish with no reveal); the pack is 8", async () => {
    const o = await k.owner({ allowance: 0, pack: 10 });
    const s = await k.shootWith(o);
    expect((await e30(o)).status).toBe(201);
    const r = await one(o, s.shoot);
    expect(r.status).toBe(200);
    expect(await pack(o.businessId)).toBe(8);
    expect(await reveals(o.businessId)).toBe(1);
  });

  it("E-33 on the same wish twice is 409 the second time (when, the link); another shoot, another set or another client is not already sent; a bad `again` is 422", async () => {
    const o = await k.owner({ allowance: 0, pack: 10 });
    const s = await k.shootWith(o);
    const s2 = await k.shootWith(o);
    const w = await e30(o);
    expect((await e33(o, w.body.id, s.shoot)).status).toBe(200);
    const twice = await e33(o, w.body.id, s.shoot);
    expect(twice.status).toBe(409);
    expect(twice.body.error.fields.link).toContain("/r/");
    expect((await e33(o, w.body.id, s2.shoot)).status).toBe(200);
    const other = await k.clientWish(o, "Bola Eze");
    expect((await e33(o, other, s.shoot, { reveal: k.revealBody({ client: "Bola Eze", email: addr() }) })).status).toBe(200);
    expect((await e33(o, w.body.id, s.shoot, { again: "yes" })).status).toBe(422);
  });
});
