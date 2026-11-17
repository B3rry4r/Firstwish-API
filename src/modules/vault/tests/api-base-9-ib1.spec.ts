import { useKit } from "./ab9-kit";

describe("API-BASE-9 case 4 (IB1): favourites at the reveal link and the business's read", () => {
  const k = useKit();
  const send = (o: { token: string }, wish: string, shoot: string, reveal: object, extra: Record<string, unknown> = {}) =>
    k.post(`/v1/business/client-wishes/${wish}/send-reveal`, o.token, { shoot, set: "proofs", reveal, ...extra });
  const linkOf = async (wish: string) => (await k.db.$queryRaw<{ id: string; code: string }[]>`SELECT "linkId"::text AS id, code FROM reveal_access WHERE "wishId" = ${wish}::uuid`)[0];
  const mark = (code: string, position: unknown, marked: unknown, token?: string, address?: string) => {
    const r = k.t.http().post(`/v1/r/${code}/favourites`).send({ position, marked });
    return token ? r.set("x-unlock-token", token) : address ? r.set("x-forwarded-for", address) : r;
  };
  const hearts = (code: string, token?: string) => k.t.http().get(`/v1/r/${code}/favourites`).set(token ? { "x-unlock-token": token } : {});
  const setup = async (passcode?: string) => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 3);
    const wish = await k.clientWish(o);
    expect((await send(o, wish, s.shoot, k.revealBody(passcode ? { passcode } : {}))).status).toBe(200);
    return { o, ...s, wish, ...(await linkOf(wish)) };
  };

  it("mark, unmark and read at the link: positions, the same mark twice changes nothing, marks stay for the next visit and for another visitor", async () => {
    const x = await setup();
    expect((await hearts(x.code)).body).toEqual({ hearts: [] });
    expect((await mark(x.code, 1, true)).body).toEqual({ hearts: [1] });
    expect((await mark(x.code, 1, true)).body).toEqual({ hearts: [1] });
    expect((await mark(x.code, 0, true)).body).toEqual({ hearts: [0, 1] });
    expect((await mark(x.code, 1, false)).body).toEqual({ hearts: [0] });
    expect((await mark(x.code, 2, false)).body).toEqual({ hearts: [0] });
    expect((await hearts(x.code)).body).toEqual({ hearts: [0] });
    const view = await k.t.http().get(`/v1/r/${x.code}`).set("x-forwarded-for", "203.0.113.77");
    expect(view.body).toMatchObject({ state: "open", hearts: [0], index: [0, 1, 2] });
    expect((await k.t.http().get(`/v1/r/${x.code}/favourites`).set("x-forwarded-for", "203.0.113.78")).body).toEqual({ hearts: [0] });
  });

  it("the business reads the marks per reveal, on the client wish and on the shoot (as file ids); it cannot change them; another business sees nothing", async () => {
    const x = await setup();
    const w2 = await k.clientWish(x.o, "Bola Eze");
    expect((await send(x.o, w2, x.shoot, k.revealBody({ client: "Bola Eze" }))).status).toBe(200);
    const second = await linkOf(w2);
    await mark(x.code, 2, true);
    await mark(x.code, 0, true);
    await mark(second.code, 0, true);
    const link = await k.get(`/v1/business/reveal-links/${x.id}`, x.o.token);
    expect(link.body).toMatchObject({ hearts: [0, 2], downloads: true });
    expect((await k.get(`/v1/business/client-wishes/${x.wish}`, x.o.token)).body.hearts).toEqual([0, 2]);
    expect((await k.get(`/v1/business/client-wishes/${w2}`, x.o.token)).body.hearts).toEqual([0]);
    const shoot = await k.get(`/v1/business/shoots/${x.shoot}`, x.o.token);
    expect([...shoot.body.hearts].sort()).toEqual([x.files[0], x.files[2]].sort());
    expect(shoot.body.wishState).toBe("favourites");
    const list = await k.get("/v1/business/shoots", x.o.token);
    expect(list.body.items[0].hearts).toHaveLength(2);
    // unmarking at the link takes the heart off the shoot only when no other link of the shoot still holds it
    await mark(x.code, 0, false);
    expect((await k.get(`/v1/business/shoots/${x.shoot}`, x.o.token)).body.hearts).toHaveLength(2);
    await mark(second.code, 0, false);
    expect((await k.get(`/v1/business/shoots/${x.shoot}`, x.o.token)).body.hearts).toEqual([x.files[2]]);
    // the business has no way to write them
    expect((await k.post(`/v1/business/reveal-links/${x.id}/favourites`, x.o.token, { position: 1, marked: true })).status).toBe(404);
    const other = await k.owner();
    expect((await k.get(`/v1/business/reveal-links/${x.id}`, other.token)).status).toBe(404);
    // a link copied for the shoot takes marks too, and they show on the shoot
    const copy = JSON.parse((await k.post(`/v1/business/reveal-links/${x.shoot}/copy-link`, x.o.token, { set: "proofs" })).text) as string;
    expect((await mark(k.codeOf(copy), 1, true)).body).toEqual({ hearts: [1] });
    expect((await k.get(`/v1/business/shoots/${x.shoot}`, x.o.token)).body.hearts).toHaveLength(2);
    // IC2: sending the reveal again with other files keeps the hearts of the files that stay; the one marked file (the third) left the list, so its heart went
    expect((await send(x.o, x.wish, x.shoot, k.revealBody(), { files: [x.files[1], x.files[0]], again: true })).status).toBe(200);
    expect((await hearts(x.code)).body).toEqual({ hearts: [] });
    expect((await k.get(`/v1/business/client-wishes/${x.wish}`, x.o.token)).body.hearts).toEqual([]);
  });

  it("nothing before the passcode: reads and marks are 403 with words until the unlock token is given; a wrong token is no better", async () => {
    const x = await setup("blue-door");
    for (const r of [await hearts(x.code), await mark(x.code, 0, true), await hearts(x.code, "junk"), await mark(x.code, 0, true, "junk")]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("passcode_required");
    }
    expect((await k.get(`/v1/business/reveal-links/${x.id}`, x.o.token)).body.hearts).toEqual([]);
    const good = await k.t.http().post(`/v1/r/${x.code}/unlock`).send({ passcode: "blue-door" });
    expect((await mark(x.code, 0, true, good.body.token)).body).toEqual({ hearts: [0] });
    expect((await hearts(x.code, good.body.token)).body).toEqual({ hearts: [0] });
    expect((await mark(x.code, 0, true)).status).toBe(403);
  });

  it("the limits: a position must be a photo of the link (422 with words), 200 marks at most, 60 marks an hour for a link and address (429, and again an hour later), an ended or switched-off link is 410, no such link 404", async () => {
    const x = await setup();
    for (const bad of [-1, 1.5, "1", null, 10000]) expect((await mark(x.code, bad, true)).status).toBe(422);
    expect((await mark(x.code, 0, "yes")).status).toBe(422);
    const out = await mark(x.code, 3, true);
    expect(out.status).toBe(422);
    expect(out.body.error.fields.position).toMatch(/3 photos/);
    // the cap: a link of 201 photos with 200 marked refuses the 201st mark (and still accepts an unmark)
    const many = Array.from({ length: 201 }, () => k.ids.next());
    await k.db.$executeRaw`UPDATE reveal_access SET "fileIds" = ${JSON.stringify(many)}::jsonb, hearts = ${many.slice(0, 200)}::text[]::uuid[] WHERE "linkId" = ${x.id}::uuid`;
    const full = await mark(x.code, 200, true);
    expect(full.status).toBe(422);
    expect(full.body.error.fields.position).toMatch(/At most 200/);
    expect((await mark(x.code, 199, false)).body.hearts).toHaveLength(199);
    expect((await mark(x.code, 200, true)).body.hearts).toHaveLength(200);
    // the rate
    const y = await setup();
    const addr = "203.0.113.90";
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await mark(y.code, 0, i % 2 === 0, undefined, addr)).status;
    expect(last).toBe(429);
    k.t.clock.set(new Date(k.t.clock.now().getTime() + 3_700_000));
    expect((await mark(y.code, 1, true, undefined, addr)).status).toBe(200);
    k.t.clock.set(new Date("2027-03-01T09:00:00.000Z"));
    // gone and unknown
    expect((await k.post(`/v1/business/reveal-links/${y.id}/off`, y.o.token)).status).toBe(200);
    expect((await mark(y.code, 0, true)).status).toBe(410);
    expect((await hearts(y.code)).status).toBe(410);
    expect((await mark("A".repeat(22), 0, true)).status).toBe(404);
    expect((await mark("short", 0, true)).status).toBe(404);
  });
});
