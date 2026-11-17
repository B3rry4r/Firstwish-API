import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useKit } from "./ab9-kit";

describe("IC1 and IC2: a copied or re-sent link is never more open than its reveal; a heart belongs to a file", () => {
  const k = useKit();
  let n = 0;
  const addr = () => `pab9-ic12-${process.pid}-${++n}-${Date.now() % 100000}@example.com`;
  const copy = async (o: { token: string }, shoot: string, set = "proofs"): Promise<string> => {
    const r = await k.post(`/v1/business/reveal-links/${shoot}/copy-link`, o.token, { set });
    expect(r.status).toBe(200);
    return JSON.parse(r.text) as string;
  };
  const read = (link: string, token?: string) => k.t.http().get(`/v1/r/${k.codeOf(link)}`).set(token ? { "x-unlock-token": token } : {});
  const send = (o: { token: string }, shoot: string, rev: Record<string, unknown> = {}, over: Record<string, unknown> = {}, set = "proofs") =>
    k.post("/v1/business/reveals", o.token, { shoot, set, reveal: k.revealBody({ email: addr(), ...rev }), ...over });
  const idOf = async (link: string) => (await k.db.$queryRaw<{ id: string }[]>`SELECT "linkId"::text AS id FROM reveal_access WHERE code = ${k.codeOf(link)}`)[0].id;

  it("(a) stays as designed: another client's reveal of the same shoot without a passcode opens without one, and the copied link keeps the passcode", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 2);
    const a = await send(o, s.shoot, { passcode: "blue-door", client: "Ada Obi" });
    const b = await send(o, s.shoot, { client: "Bola Eze" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect((await read(b.body.link)).body.state).toBe("open");
    expect((await read(a.body.link)).body.state).toBe("passcode");
    expect((await read(await copy(o, s.shoot))).body.state).toBe("passcode");
  });

  it("(b) again without a passcode keeps the passcode on the client's link and on the copied link; a new passcode replaces it on both", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 2);
    const first = await send(o, s.shoot, { passcode: "blue-door" });
    const link = await copy(o, s.shoot);
    const again = await send(o, s.shoot, {}, { again: true });
    expect(again.status).toBe(200);
    expect(again.body.link).toBe(first.body.link);
    expect((await read(first.body.link)).body.state).toBe("passcode");
    expect((await read(link)).body.state).toBe("passcode");
    expect((await k.get(`/v1/business/reveal-links/${await idOf(first.body.link)}`, o.token)).body.passcode).toBe(true);
    const old = await k.t.http().post(`/v1/r/${k.codeOf(link)}/unlock`).send({ passcode: "blue-door" });
    expect(old.body.ok).toBe(true);
    const fresh = await send(o, s.shoot, { passcode: "red-door" }, { again: true });
    expect(fresh.status).toBe(200);
    expect((await k.t.http().post(`/v1/r/${k.codeOf(first.body.link)}/unlock`).send({ passcode: "blue-door" })).body.ok).toBe(false);
    expect((await k.t.http().post(`/v1/r/${k.codeOf(first.body.link)}/unlock`).send({ passcode: "red-door" })).body.ok).toBe(true);
    expect((await k.t.http().post(`/v1/r/${k.codeOf(link)}/unlock`).send({ passcode: "red-door" })).body.ok).toBe(true);
    // the older send call keeps it too
    const w = await k.clientWish(o, "Ife Bello");
    const s2 = await k.shootWith(o, "proofs", 1);
    const body = { shoot: s2.shoot, set: "proofs", reveal: k.revealBody({ passcode: "gold-door" }) };
    const sent = await k.post(`/v1/business/client-wishes/${w}/send-reveal`, o.token, body);
    expect(sent.status).toBe(200);
    await k.post(`/v1/business/client-wishes/${w}/send-reveal`, o.token, { ...body, reveal: k.revealBody() });
    const row = (await k.db.$queryRaw<{ code: string }[]>`SELECT code FROM reveal_access WHERE "wishId" = ${w}::uuid`)[0];
    expect((await k.t.http().get(`/v1/r/${row.code}`)).body.state).toBe("passcode");
  });

  it("(c) a link copied after the reveal was switched off, or after it ended, is not open and still asks for the passcode it had", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 1);
    const first = await copy(o, s.shoot);
    const r = await send(o, s.shoot, { passcode: "blue-door" });
    expect((await k.post(`/v1/business/reveal-links/${await idOf(r.body.link)}/off`, o.token)).status).toBe(200);
    expect((await k.post(`/v1/business/reveal-links/${await idOf(first)}/off`, o.token)).status).toBe(200);
    const made = await copy(o, s.shoot);
    expect(made).not.toBe(first);
    expect((await read(made)).status).toBe(410);
    const row = (await k.db.$queryRaw<{ pass: boolean; off: boolean }[]>`SELECT ("passcodeHash" IS NOT NULL) AS pass, ("offAt" IS NOT NULL) AS off FROM reveal_access WHERE code = ${k.codeOf(made)}`)[0];
    expect(row).toEqual({ pass: true, off: true });
    // ended
    const o2 = await k.owner();
    const s2 = await k.shootWith(o2, "proofs", 1);
    await send(o2, s2.shoot, { passcode: "end-door", endsOn: "2027-03-02" });
    const live = await copy(o2, s2.shoot);
    expect((await read(live)).body.state).toBe("passcode");
    k.t.clock.set(new Date("2027-03-03T10:00:00.000Z"));
    expect((await read(live)).status).toBe(410);
    const after = await copy(o2, s2.shoot);
    expect((await read(after)).status).toBe(410);
  });

  it("(d) the downloads switch of a finals reveal carries to a copied link, made before or after, and to a re-send without a switch", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "finals", 2);
    const before = await copy(o, s.shoot, "finals");
    expect((await read(before)).body.downloads).toHaveLength(2);
    const off = await send(o, s.shoot, { downloads: false }, {}, "finals");
    expect(off.status).toBe(200);
    expect((await read(off.body.link)).body.downloads).toBeUndefined();
    expect((await read(before)).body.downloads).toBeUndefined();
    const same = await copy(o, s.shoot, "finals");
    expect(same).toBe(before);
    expect((await read(same)).body.downloads).toBeUndefined();
    const s2 = await k.shootWith(o, "finals", 2);
    const r2 = await send(o, s2.shoot, { downloads: false }, {}, "finals");
    const fresh = await copy(o, s2.shoot, "finals");
    expect((await read(fresh)).body.downloads).toBeUndefined();
    const resent = await send(o, s2.shoot, {}, { again: true }, "finals");
    expect(resent.body.link).toBe(r2.body.link);
    expect((await read(r2.body.link)).body.downloads).toBeUndefined();
    expect((await k.get(`/v1/business/reveal-links/${await idOf(r2.body.link)}`, o.token)).body.downloads).toBe(false);
  });

  it("IC2: a heart stays on its file when another file is removed and the link is copied or re-sent; the removed file's heart goes; shoot.hearts agrees", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 3);
    const link = await copy(o, s.shoot);
    const code = k.codeOf(link);
    const mark = (c: string, pos: number, on = true) => k.t.http().post(`/v1/r/${c}/favourites`).send({ position: pos, marked: on });
    expect((await mark(code, 1)).body).toEqual({ hearts: [1] });
    expect((await mark(code, 2)).body).toEqual({ hearts: [1, 2] });
    const hearts = async () => ((await k.get(`/v1/business/shoots/${s.shoot}`, o.token)).body.hearts as string[]).sort();
    expect(await hearts()).toEqual([s.files[1], s.files[2]].sort());
    // file 0 is removed: nothing moves under the marks until the link is copied, and then the hearts are still on files 1 and 2
    expect((await k.t.http().delete(`/v1/uploads/${s.files[0]}`).set({ authorization: `Bearer ${o.token}` })).status).toBe(204);
    expect(await hearts()).toEqual([s.files[1], s.files[2]].sort());
    expect(await copy(o, s.shoot)).toBe(link);
    const view = (await read(link)).body;
    expect(view.photos).toHaveLength(2);
    expect(view.hearts).toEqual([0, 1]);
    expect((await k.t.http().get(`/v1/r/${code}/favourites`)).body).toEqual({ hearts: [0, 1] });
    // the heart of file 2 is removed with the file
    expect((await k.t.http().delete(`/v1/uploads/${s.files[2]}`).set({ authorization: `Bearer ${o.token}` })).status).toBe(204);
    expect(await hearts()).toEqual([s.files[1]]);
    expect(await copy(o, s.shoot)).toBe(link);
    expect((await k.t.http().get(`/v1/r/${code}/favourites`)).body).toEqual({ hearts: [0] });
    expect(await hearts()).toEqual([s.files[1]]);
    // a re-sent reveal and a second copy show the same hearts for the same files
    const r = await send(o, s.shoot);
    const rc = k.codeOf(r.body.link);
    expect((await mark(rc, 0)).body).toEqual({ hearts: [0] });
    const again = await send(o, s.shoot, {}, { again: true });
    expect(again.body.link).toBe(r.body.link);
    expect((await k.t.http().get(`/v1/r/${rc}/favourites`)).body).toEqual({ hearts: [0] });
    expect(again.body.wish.hearts).toEqual([0]);
    expect(again.body.shoot.hearts).toEqual([s.files[1]]);
  });

  it("IC2: positions already stored by the old column are moved to the file ids at those places by the migration's own statement", async () => {
    const sql = readFileSync(join(__dirname, "../../../../prisma/migrations/20261129090000_hearts_by_file_pab9/migration.sql"), "utf8");
    const update = /UPDATE "reveal_access" a[\s\S]*?;/.exec(sql)?.[0];
    expect(update).toBeTruthy();
    const [f0, f1, f2] = [k.ids.next(), k.ids.next(), k.ids.next()];
    await k.db.$executeRawUnsafe(`CREATE TABLE pab9_old (id int, "fileIds" jsonb, hearts int[], "heartFiles" uuid[] NOT NULL DEFAULT '{}')`);
    await k.db.$executeRawUnsafe(`INSERT INTO pab9_old (id, "fileIds", hearts) VALUES (1, '${JSON.stringify([f0, f1, f2])}', '{2,0}'), (2, '${JSON.stringify([f0, f1])}', '{1,5}'), (3, '[]', '{}'), (4, '${JSON.stringify([f0])}', '{0,0}')`);
    await k.db.$executeRawUnsafe(update!.replace('"reveal_access"', "pab9_old"));
    const rows = await k.db.$queryRawUnsafe<{ id: number; files: string[] }[]>(`SELECT id, "heartFiles"::text[] AS files FROM pab9_old ORDER BY id`);
    expect(rows.map((r) => [r.id, [...r.files].sort()])).toEqual([[1, [f0, f2].sort()], [2, [f1]], [3, []], [4, [f0]]]);
    await k.db.$executeRawUnsafe("DROP TABLE pab9_old");
    const m = await k.db.$queryRaw<{ t: string }[]>`SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid = 'reveal_access'::regclass AND attname = 'hearts'`;
    expect(m[0].t).toBe("uuid[]");
  });
});
