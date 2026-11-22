import { useKit } from "./ab9-kit";
import { RUN } from "../../../../test/kit/unique";

describe("API-BASE-9 case 2 (IA1): one call sends a reveal", () => {
  const k = useKit();
  let n = 0;
  const packOwner = (pack: number) => k.owner({ allowance: 0, used: 0, rolled: 0, pack });
  const addr = () => `ia1-${RUN}-${++n}-${Date.now() % 100000}@example.com`;
  const one = (o: { token: string }, shoot: string, over: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    k.post("/v1/business/reveals", o.token, { shoot, set: "proofs", reveal: k.revealBody({ email: addr() }), ...over }, headers);
  const state = async (businessId: string) => {
    const [r] = await k.db.$queryRaw<{ wishes: number; access: number; pack: number; used: number }[]>`
      SELECT (SELECT count(*) FROM client_wish WHERE "businessId" = ${businessId}::uuid)::int AS wishes,
             (SELECT count(*) FROM reveal_access WHERE "businessId" = ${businessId}::uuid)::int AS access,
             COALESCE((SELECT pack FROM business WHERE id = ${businessId}::uuid), 0)::int AS pack, COALESCE((SELECT used FROM business WHERE id = ${businessId}::uuid), 0)::int AS used`;
    return r;
  };
  const mails = async (to: string) => (await k.db.messageDelivery.count({ where: { templateKey: "reveal", to: to.toLowerCase() } }));

  it("one call makes the client wish and the reveal, takes one wish from the pack, sends one email, and the link plays", async () => {
    const o = await packOwner(3);
    const { shoot } = await k.shootWith(o);
    const email = addr();
    const r = await one(o, shoot, { reveal: k.revealBody({ email }) });
    expect(r.status).toBe(200);
    expect(r.body.wish).toMatchObject({ client: "Ada Obi", shoot, set: "proofs", kind: "photographers" });
    expect(r.body.shoot.proofsReveal).toMatchObject({ wish: r.body.wish.id });
    expect(await state(o.businessId)).toEqual({ wishes: 1, access: 1, pack: 2, used: 0 });
    expect(await mails(email)).toBe(1);
    const open = await k.t.http().get(`/v1/r/${k.codeOf(r.body.link)}`);
    expect(open.body.state).toBe("open");
    expect(open.body.photos).toHaveLength(2);
  });

  it("30 identical calls at once with one key: one wish, one reveal, one email, the pack down by one, every call answers the same wish", async () => {
    const o = await packOwner(5);
    const { shoot } = await k.shootWith(o);
    const body = { shoot, set: "proofs", reveal: k.revealBody({ email: addr() }) };
    const all = await Promise.all(Array.from({ length: 30 }, () => k.post("/v1/business/reveals", o.token, body, { "idempotency-key": "same-key-1" })));
    expect(all.map((r) => r.status)).toEqual(Array(30).fill(200));
    expect(new Set(all.map((r) => (r.body as { wish: { id: string } }).wish.id)).size).toBe(1);
    expect(new Set(all.map((r) => (r.body as { link: string }).link)).size).toBe(1);
    expect(await state(o.businessId)).toEqual({ wishes: 1, access: 1, pack: 4, used: 0 });
    expect(await mails((body.reveal as { email: string }).email)).toBe(1);
  });

  it("30 identical calls at once with no key: one goes through and the rest answer 409 already_sent; the pack is down by one", async () => {
    const o = await packOwner(5);
    const { shoot } = await k.shootWith(o);
    const body = { shoot, set: "proofs", reveal: k.revealBody({ email: addr() }) };
    const all = await Promise.all(Array.from({ length: 30 }, () => k.post("/v1/business/reveals", o.token, body)));
    expect(all.filter((r) => r.status === 200)).toHaveLength(1);
    expect(all.filter((r) => r.status === 409)).toHaveLength(29);
    expect(all.find((r) => r.status === 409)?.body.error.code).toBe("already_sent");
    expect(await state(o.businessId)).toEqual({ wishes: 1, access: 1, pack: 4, used: 0 });
    expect(await mails((body.reveal as { email: string }).email)).toBe(1);
  });

  it("a shoot already revealed to that client answers 409 already_sent with when and the link; again sends once more on the same wish and takes no second wish", async () => {
    const o = await packOwner(4);
    const { shoot } = await k.shootWith(o);
    const email = addr();
    const first = await one(o, shoot, { reveal: k.revealBody({ email }) });
    expect(first.status).toBe(200);
    const dup = await one(o, shoot, { reveal: k.revealBody({ email }) });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: "already_sent", fields: { link: first.body.link } });
    expect(dup.body.error.fields.sentAt).toMatch(/^2027-03-01T/);
    expect(dup.body.error.message).toContain("2027-03-01");
    // the client's name is compared without case or extra spaces; another client is a new send
    expect((await one(o, shoot, { reveal: k.revealBody({ client: "  ADA   obi ", email }) })).status).toBe(409);
    expect((await state(o.businessId)).pack).toBe(3);
    const again = await one(o, shoot, { again: true, reveal: k.revealBody({ email }) });
    expect(again.status).toBe(200);
    expect(again.body.wish.id).toBe(first.body.wish.id);
    expect(again.body.link).toBe(first.body.link);
    expect(await state(o.businessId)).toEqual({ wishes: 1, access: 1, pack: 3, used: 0 });
    expect(await mails(email)).toBe(2);
    const other = await one(o, shoot, { reveal: k.revealBody({ client: "Bola Eze", email: addr() }) });
    expect(other.status).toBe(200);
    expect(other.body.wish.id).not.toBe(first.body.wish.id);
    expect((await state(o.businessId)).pack).toBe(2);
    // the finals of the same shoot to the same client are a different send
    const finals = await k.shootWith(o, "finals");
    expect((await one(o, finals.shoot, { set: "finals" })).status).toBe(200);
  });

  it("a refused email takes nothing: the sixth reveal to one address in a day is 429 with the pack, the wishes and the links as they were; a bad address is 422", async () => {
    const o = await packOwner(10);
    const email = addr();
    for (let i = 0; i < 5; i++) {
      const s = await k.shootWith(o);
      expect((await one(o, s.shoot, { reveal: k.revealBody({ email }) })).status).toBe(200);
    }
    const before = await state(o.businessId);
    expect(before).toEqual({ wishes: 5, access: 5, pack: 5, used: 0 });
    const s6 = await k.shootWith(o);
    const refused = await one(o, s6.shoot, { reveal: k.revealBody({ email }) });
    expect(refused.status).toBe(429);
    expect(await state(o.businessId)).toEqual(before);
    const bad = await one(o, s6.shoot, { reveal: k.revealBody({ email: "not-an-email" }) });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(["reveal.email"]);
    expect(await state(o.businessId)).toEqual(before);
    // a key spent on a refused call is not spent: the same key works once the cause is gone
    expect((await one(o, s6.shoot, { reveal: k.revealBody({ email: addr() }) }, { "idempotency-key": "after-refusal" })).status).toBe(200);
    expect((await state(o.businessId)).pack).toBe(4);
  });

  it("an empty pack answers 402 and nothing is made; a lapsed plan draws from the pack, and with no pack is 402 too; a set with no files and another business's shoot take nothing", async () => {
    const empty = await packOwner(0);
    const s0 = await k.shootWith(empty);
    const r0 = await one(empty, s0.shoot);
    expect(r0.status).toBe(402);
    expect(r0.body.error.code).toBe("no_wishes");
    expect(await state(empty.businessId)).toEqual({ wishes: 0, access: 0, pack: 0, used: 0 });
    const lapsed = await k.owner({ allowance: 10, used: 0, rolled: 0, pack: 0 });
    const sl = await k.shootWith(lapsed);
    await k.db.business.update({ where: { id: lapsed.businessId }, data: { renews: new Date("2027-01-01T09:00:00.000Z") } });
    expect((await one(lapsed, sl.shoot)).status).toBe(402);
    expect(await state(lapsed.businessId)).toEqual({ wishes: 0, access: 0, pack: 0, used: 0 });
    await k.db.business.update({ where: { id: lapsed.businessId }, data: { pack: 2 } });
    expect((await one(lapsed, sl.shoot)).status).toBe(200);
    expect(await state(lapsed.businessId)).toEqual({ wishes: 1, access: 1, pack: 1, used: 0 });
    const live = await k.owner();
    const sv = await k.shootWith(live);
    expect((await one(live, sv.shoot)).status).toBe(200);
    expect((await state(live.businessId)).used).toBe(1);
    const noFiles = await k.t.http().post("/v1/business/shoots").set({ authorization: `Bearer ${live.token}` }).send({ client: "Bo", date: "2027-02-20", title: "T" });
    expect((await one(live, noFiles.body.id)).status).toBe(422);
    expect((await state(live.businessId)).used).toBe(1);
    const stranger = await k.owner();
    expect((await one(stranger, sv.shoot)).status).toBe(404);
    expect(await state(stranger.businessId)).toMatchObject({ wishes: 0, pack: 0 });
  });

  it("a live login of the business sends too; a removed login and a person with no business do not; the body is checked", async () => {
    const o = await k.owner();
    const { shoot } = await k.shootWith(o);
    const login = await k.login(o);
    expect((await one(login, shoot)).status).toBe(200);
    await k.db.login.updateMany({ where: { businessId: o.businessId }, data: { status: "removed" } });
    expect((await one(login, shoot, { reveal: k.revealBody({ client: "Bola", email: addr() }) })).status).toBe(403);
    const nobody = await k.who();
    expect((await one(nobody, shoot)).status).toBe(403);
    expect((await k.t.http().post("/v1/business/reveals").send({})).status).toBe(401);
    const bad = await k.post("/v1/business/reveals", o.token, { shoot: "x", set: "photos", reveal: [] });
    expect(bad.status).toBe(422);
    const files = await one(o, shoot, { files: ["nope"] });
    expect(files.status).toBe(422);
  });

  it("the two older calls keep working: a client wish made by E-30 and a reveal sent on it by E-33 take one wish and show the same link", async () => {
    const o = await k.owner();
    const { shoot } = await k.shootWith(o);
    const made = await k.post("/v1/business/client-wishes", o.token, { client: "Ada Obi", kind: "photographers", occasion: "Wedding", day: "2027-03-04" });
    expect(made.status).toBe(201);
    const sent = await k.post(`/v1/business/client-wishes/${made.body.id}/send-reveal`, o.token, { shoot, set: "proofs", reveal: k.revealBody({ email: addr() }) });
    expect(sent.status).toBe(200);
    expect(sent.body.wish.shoot).toBe(shoot);
    expect((await state(o.businessId)).used).toBe(1);
  });
});
