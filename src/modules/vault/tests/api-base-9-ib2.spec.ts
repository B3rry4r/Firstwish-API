import { useKit } from "./ab9-kit";

describe("API-BASE-9 case 5 (IB2): download addresses for finals at the reveal link", () => {
  const k = useKit();
  const make = async (set: "proofs" | "finals", reveal: object = {}, passcode?: string) => {
    const o = await k.owner();
    const s = await k.shootWith(o, set, 2);
    const r = await k.post("/v1/business/reveals", o.token, { shoot: s.shoot, set, reveal: k.revealBody({ ...reveal, ...(passcode ? { passcode } : {}) }) });
    expect(r.status).toBe(200);
    const code = k.codeOf(r.body.link);
    const id = (await k.db.$queryRaw<{ id: string }[]>`SELECT "linkId"::text AS id FROM reveal_access WHERE code = ${code}`)[0].id;
    return { o, ...s, code, id };
  };
  const read = (code: string, token?: string) => k.t.http().get(`/v1/r/${code}`).set(token ? { "x-unlock-token": token } : {});

  it("finals give one named, signed download address for each photo by default; the addresses are signed reads of the files", async () => {
    const x = await make("finals");
    const r = await read(x.code);
    expect(r.body.state).toBe("open");
    expect(r.body.photos).toHaveLength(2);
    expect(r.body.downloads).toHaveLength(2);
    for (const [i, d] of (r.body.downloads as { name: string; url: string }[]).entries()) {
      expect(d.name).toBe(`vault-${x.files[i].slice(-12)}.jpg`);
      expect(d.url).toEqual(expect.any(String));
      expect(d.url).toContain(x.files[i]);
    }
    expect(await k.db.signedUrl.count({ where: { fileId: { in: x.files } } })).toBeGreaterThanOrEqual(4);
  });

  it("a proof never has a download address, whatever the switch says", async () => {
    const x = await make("proofs", { downloads: true });
    expect((await read(x.code)).body.downloads).toBeUndefined();
    expect((await k.post(`/v1/business/reveal-links/${x.id}/downloads`, x.o.token, { on: true })).body.downloads).toBe(true);
    expect((await read(x.code)).body.downloads).toBeUndefined();
    // a copied link of proofs and of finals
    const copy = JSON.parse((await k.post(`/v1/business/reveal-links/${x.shoot}/copy-link`, x.o.token, { set: "proofs" })).text) as string;
    expect((await read(k.codeOf(copy))).body.downloads).toBeUndefined();
  });

  it("the switch on the reveal: off at the send, or switched later by the business; the read of the link says which; another business and a bad value are refused", async () => {
    const off = await make("finals", { downloads: false });
    expect((await read(off.code)).body.downloads).toBeUndefined();
    expect((await k.get(`/v1/business/reveal-links/${off.id}`, off.o.token)).body.downloads).toBe(false);
    const on = await k.post(`/v1/business/reveal-links/${off.id}/downloads`, off.o.token, { on: true });
    expect(on.status).toBe(200);
    expect(on.body.downloads).toBe(true);
    expect((await read(off.code)).body.downloads).toHaveLength(2);
    expect((await k.post(`/v1/business/reveal-links/${off.id}/downloads`, off.o.token, { on: false })).body.downloads).toBe(false);
    expect((await read(off.code)).body.downloads).toBeUndefined();
    const other = await k.owner();
    expect((await k.post(`/v1/business/reveal-links/${off.id}/downloads`, other.token, { on: true })).status).toBe(404);
    expect((await k.post(`/v1/business/reveal-links/${off.id}/downloads`, off.o.token, { on: "yes" })).status).toBe(422);
    expect((await k.post("/v1/business/reveal-links/nope/downloads", off.o.token, { on: true })).status).toBe(404);
    const bad = await k.post("/v1/business/reveals", off.o.token, { shoot: off.shoot, set: "finals", again: true, reveal: k.revealBody({ downloads: "yes" }) });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(["reveal.downloads"]);
  });

  it("nothing before the passcode: the locked link answers the passcode step with no address; a good unlock then gives them; a link switched off gives none", async () => {
    const x = await make("finals", {}, "blue-door");
    const locked = await read(x.code);
    expect(locked.body).toEqual({ state: "passcode" });
    const good = await k.t.http().post(`/v1/r/${x.code}/unlock`).send({ passcode: "blue-door" });
    expect((await read(x.code, good.body.token)).body.downloads).toHaveLength(2);
    // a link copied for the finals is gated with the same passcode, so it gives none before it either
    const copy = JSON.parse((await k.post(`/v1/business/reveal-links/${x.shoot}/copy-link`, x.o.token, { set: "finals" })).text) as string;
    expect((await read(k.codeOf(copy))).body).toEqual({ state: "passcode" });
    expect((await k.post(`/v1/business/reveal-links/${x.id}/off`, x.o.token)).status).toBe(200);
    expect((await read(x.code, good.body.token)).status).toBe(410);
  });

  it("a reveal naming a subset gives downloads for that subset only, in the order named", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "finals", 3);
    const r = await k.post("/v1/business/reveals", o.token, { shoot: s.shoot, set: "finals", files: [s.files[2], s.files[0]], reveal: k.revealBody() });
    expect(r.status).toBe(200);
    const v = await read(k.codeOf(r.body.link));
    expect((v.body.downloads as { name: string }[]).map((d) => d.name)).toEqual([s.files[2], s.files[0]].map((f) => `vault-${f.slice(-12)}.jpg`));
  });
});
