import { useKit } from "./ab9-kit";

/** IC5: plays are counted by the server's own view (the link and the address); a refusal names the real wait; a key used again for another shoot or client is refused. */
describe("IC5: plays by link and address, the real wait, and an Idempotency-Key for one shoot and client", () => {
  const k = useKit();
  let n = 0;
  const one = (o: { token: string }, shoot: string, over: Record<string, unknown> = {}, key?: string) =>
    k.post("/v1/business/reveals", o.token, { shoot, set: "proofs", reveal: k.revealBody({ email: `pab9-ic5-${process.pid}-${++n}-${Date.now() % 100000}@example.com` }), ...over }, key ? { "Idempotency-Key": key } : {});
  const linkOf = async (wish: string) => (await k.db.$queryRaw<{ id: string }[]>`SELECT "linkId"::text AS id FROM reveal_access WHERE "wishId" = ${wish}::uuid`)[0].id;

  it("twenty made-up x-reveal-session ids from one address are one play; another address and the next hour are one each", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 1);
    const r = await one(o, s.shoot);
    const code = k.codeOf(r.body.link);
    const id = await linkOf(r.body.wish.id);
    for (let i = 0; i < 20; i++) expect((await k.t.http().get(`/v1/r/${code}`).set("x-reveal-session", `made-up-${process.pid}-${i}-abcdef`)).body.state).toBe("open");
    const plays = async (): Promise<number> => ((await k.get(`/v1/business/reveal-links/${id}`, o.token)).body as { plays: { count: number } }).plays.count;
    expect(await plays()).toBe(1);
    await k.t.http().get(`/v1/r/${code}`).set("x-forwarded-for", `198.51.100.${(process.pid % 200) + 1}`);
    expect(await plays()).toBe(2);
    k.t.clock.advance(3600 * 1000);
    await k.t.http().get(`/v1/r/${code}`);
    await k.t.http().get(`/v1/r/${code}`).set("x-reveal-session", "another-made-up-id");
    expect(await plays()).toBe(3);
  });

  it("the 61st mark in an hour is 429 and names the real wait, in the message and in Retry-After", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 2);
    const r = await one(o, s.shoot);
    const code = k.codeOf(r.body.link);
    const addr = `203.0.113.${(process.pid % 200) + 20}`; // its own address: the minute's read count of the other tests is not this one's
    const mark = (pos: number, on: boolean) => k.t.http().post(`/v1/r/${code}/favourites`).set("x-forwarded-for", addr).send({ position: pos, marked: on });
    for (let i = 0; i < 60; i++) expect((await mark(i % 2, i % 4 < 2)).status).toBe(200);
    let refused = await mark(0, true);
    expect(refused.status).toBe(429);
    expect(refused.body.error.message).toBe("Too many tries. Try again in 3600 seconds.");
    expect(refused.headers["retry-after"]).toBe("3600");
    k.t.clock.advance(1800 * 1000);
    refused = await mark(0, true);
    expect(refused.status).toBe(429);
    expect(refused.body.error.message).toBe("Too many tries. Try again in 1800 seconds.");
    expect(refused.headers["retry-after"]).toBe("1800");
    k.t.clock.advance(1801 * 1000);
    expect((await mark(0, true)).status).toBe(200);
  });

  it("an Idempotency-Key used again for another shoot or another client is 409; for the same shoot and client it answers the first result", async () => {
    const o = await k.owner();
    const a = await k.shootWith(o, "proofs", 1);
    const b = await k.shootWith(o, "proofs", 1);
    const key = `pab9-key-${process.pid}-${Date.now() % 100000}`;
    const first = await one(o, a.shoot, { reveal: k.revealBody({ client: "Ife Bello" }) }, key);
    expect(first.status).toBe(200);
    const same = await one(o, a.shoot, { reveal: k.revealBody({ client: "Ife Bello" }) }, key);
    expect(same.status).toBe(200);
    expect(same.body.link).toBe(first.body.link);
    const otherShoot = await one(o, b.shoot, { reveal: k.revealBody({ client: "Ife Bello" }) }, key);
    expect(otherShoot.status).toBe(409);
    expect(otherShoot.body.error.code).toBe("idempotency_key_reused");
    const otherClient = await one(o, a.shoot, { reveal: k.revealBody({ client: "Kemi Ade" }) }, key);
    expect(otherClient.status).toBe(409);
    expect(otherClient.body.error.code).toBe("idempotency_key_reused");
    expect(await k.db.clientWish.count({ where: { businessId: o.businessId } })).toBe(1);
    // the older send call: the key for one wish and shoot, used for another shoot
    const w = await k.clientWish(o, "Zane Ola");
    const key2 = `pab9-key2-${process.pid}-${Date.now() % 100000}`;
    expect((await k.post(`/v1/business/client-wishes/${w}/send-reveal`, o.token, { shoot: a.shoot, set: "proofs", reveal: k.revealBody() }, { "Idempotency-Key": key2 })).status).toBe(200);
    expect((await k.post(`/v1/business/client-wishes/${w}/send-reveal`, o.token, { shoot: b.shoot, set: "proofs", reveal: k.revealBody() }, { "Idempotency-Key": key2 })).status).toBe(409);
  });
});
