import { useKit } from "./ab9-kit";

describe("API-BASE-9 cases 7 and 8 (IB4 a reveal of named files, IB5 plays set openedAt)", () => {
  const k = useKit();
  const one = (o: { token: string }, shoot: string, over: Record<string, unknown> = {}) => k.post("/v1/business/reveals", o.token, { shoot, set: "proofs", reveal: k.revealBody(), ...over });
  const photos = async (link: string) => (await k.t.http().get(`/v1/r/${k.codeOf(link)}`)).body;

  it("IB4: a reveal names the files it shows (in the order named); with none named every ready file of the set shows, as before", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 4);
    const some = await one(o, s.shoot, { files: [s.files[3], s.files[1]] });
    expect(some.status).toBe(200);
    const v = await photos(some.body.link);
    expect(v.photos).toHaveLength(2);
    expect(v.index).toEqual([0, 1]);
    const row = (await k.db.$queryRaw<{ ids: string[] }[]>`SELECT "fileIds" AS ids FROM reveal_access WHERE code = ${k.codeOf(some.body.link)}`)[0];
    expect(row.ids).toEqual([s.files[3], s.files[1]]);
    const all = await one(o, s.shoot, { reveal: k.revealBody({ client: "Bola Eze" }) });
    expect((await photos(all.body.link)).photos).toHaveLength(4);
    const empty = await one(o, s.shoot, { reveal: k.revealBody({ client: "Chi Okoro" }), files: [] });
    expect(empty.status).toBe(200);
    expect((await photos(empty.body.link)).photos).toHaveLength(4);
    // a repeat in the list counts once
    const dup = await one(o, s.shoot, { reveal: k.revealBody({ client: "Dayo" }), files: [s.files[0], s.files[0]] });
    expect((await photos(dup.body.link)).photos).toHaveLength(1);
    // the older call takes the list too, and a reveal sent again can change it
    const wish = await k.clientWish(o);
    const older = await k.post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot: s.shoot, set: "proofs", reveal: k.revealBody(), files: [s.files[2]] });
    expect(older.status).toBe(200);
    const link = (await k.db.$queryRaw<{ code: string }[]>`SELECT code FROM reveal_access WHERE "wishId" = ${wish}::uuid`)[0].code;
    expect((await k.t.http().get(`/v1/r/${link}`)).body.photos).toHaveLength(1);
  });

  it("IB4: a file of another shoot's set, another business's file or a file not ready is 422 with words, and nothing is taken", async () => {
    const o = await k.owner({ allowance: 0, used: 0, rolled: 0, pack: 3 });
    const s = await k.shootWith(o, "proofs", 2);
    const other = await k.shootWith(o, "proofs", 1);
    const screening = await k.vaultFile(o, 1000, "screening");
    await k.post(`/v1/business/shoots/${s.shoot}/files`, o.token, { files: [screening], set: "proofs", shoot: s.shoot });
    const stranger = await k.owner();
    const theirs = await k.vaultFile(stranger);
    for (const files of [[other.files[0]], [theirs], [screening], [s.files[0], other.files[0]], [k.ids.next()]]) {
      const r = await one(o, s.shoot, { files });
      expect(r.status).toBe(422);
      expect(r.body.error.fields.files).toMatch(/not ready photos of this shoot's set/);
    }
    expect((await one(o, s.shoot, { files: "x" })).status).toBe(422);
    expect((await one(o, s.shoot, { files: ["not-an-id"] })).status).toBe(422);
    expect((await one(o, s.shoot, { files: Array.from({ length: 201 }, () => k.ids.next()) })).status).toBe(422);
    const [st] = await k.db.$queryRaw<{ pack: number; wishes: number }[]>`SELECT pack::int, (SELECT count(*) FROM client_wish WHERE "businessId" = ${o.businessId}::uuid)::int AS wishes FROM business WHERE id = ${o.businessId}::uuid`;
    expect(st).toEqual({ pack: 3, wishes: 0 });
    // the copied link keeps working with every ready file; a finals set cannot name a proof
    const finals = await k.shootWith(o, "finals", 1);
    expect((await one(o, finals.shoot, { set: "finals", files: [s.files[0]] })).status).toBe(422);
  });

  it("IB5: the first play sets openedAt, a later play leaves it, plays are counted on the reveal, and the shoot read carries them", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 2);
    const r = await one(o, s.shoot);
    const wish = r.body.wish.id as string;
    expect(r.body.wish.openedAt).toBeUndefined();
    expect(r.body.shoot.proofsReveal.plays).toEqual({ count: 0, first: null, last: null });
    const first = new Date("2027-03-02T10:00:00.000Z");
    k.t.clock.set(first);
    expect((await k.t.http().get(`/v1/r/${k.codeOf(r.body.link)}`).set("x-reveal-session", "visit-one-aaaa")).body.state).toBe("open");
    const later = new Date("2027-03-05T10:00:00.000Z");
    k.t.clock.set(later);
    await k.t.http().get(`/v1/r/${k.codeOf(r.body.link)}`).set("x-reveal-session", "visit-two-bbbb");
    await k.t.http().get(`/v1/r/${k.codeOf(r.body.link)}`).set("x-reveal-session", "visit-two-bbbb");
    const wishRead = await k.get(`/v1/business/client-wishes/${wish}`, o.token);
    expect(wishRead.body.openedAt).toBe(first.toISOString());
    const shoot = await k.get(`/v1/business/shoots/${s.shoot}`, o.token);
    expect(shoot.body.proofsReveal.plays).toEqual({ count: 2, first: first.toISOString(), last: later.toISOString() });
    expect(shoot.body.proofsReveal.openedAt).toBe(first.toISOString());
    expect((await k.get(`/v1/business/reveal-links/${(await k.db.$queryRaw<{ id: string }[]>`SELECT "linkId"::text AS id FROM reveal_access WHERE "wishId" = ${wish}::uuid`)[0].id}`, o.token)).body.plays.count).toBe(2);
    const list = await k.get("/v1/business/shoots", o.token);
    expect(list.body.items[0].proofsReveal.plays.count).toBe(2);
  });

  it("IB5: a locked link's first look is not a play; the play comes with the unlock; a link switched off does not play", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 1);
    const r = await one(o, s.shoot, { reveal: k.revealBody({ passcode: "blue-door" }) });
    const code = k.codeOf(r.body.link);
    expect((await k.t.http().get(`/v1/r/${code}`)).body.state).toBe("passcode");
    expect((await k.get(`/v1/business/client-wishes/${r.body.wish.id}`, o.token)).body.openedAt).toBeUndefined();
    const good = await k.t.http().post(`/v1/r/${code}/unlock`).send({ passcode: "blue-door" });
    await k.t.http().get(`/v1/r/${code}`).set("x-unlock-token", good.body.token);
    expect((await k.get(`/v1/business/client-wishes/${r.body.wish.id}`, o.token)).body.openedAt).toBe("2027-03-01T09:00:00.000Z");
    // a copied link (no client wish) counts its plays and sets no openedAt anywhere
    const w2 = await k.owner();
    const s2 = await k.shootWith(w2, "proofs", 1);
    const copy = JSON.parse((await k.post(`/v1/business/reveal-links/${s2.shoot}/copy-link`, w2.token, { set: "proofs" })).text) as string;
    expect((await k.t.http().get(`/v1/r/${k.codeOf(copy)}`)).body.state).toBe("open");
    expect(await k.db.clientWish.count({ where: { businessId: w2.businessId } })).toBe(0);
  });
});
