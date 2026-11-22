import { useKit } from "./ab9-kit";

describe("API-BASE-9 case 6 (IB3): rename a shoot and a file", () => {
  const k = useKit();

  it("the owner and a live login rename a shoot (title, client or both); a field left out stays; the files and reveals are untouched", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 2);
    const r = await k.patch(`/v1/business/shoots/${s.shoot}`, o.token, { title: "  Lagos   wedding " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: s.shoot, title: "Lagos wedding", client: "Ada Obi" });
    expect(r.body.proofs).toHaveLength(2);
    const login = await k.login(o);
    const both = await k.patch(`/v1/business/shoots/${s.shoot}`, login.token, { title: "Wedding", client: "Ada and Ben" });
    expect(both.body).toMatchObject({ title: "Wedding", client: "Ada and Ben" });
    expect((await k.get(`/v1/business/shoots/${s.shoot}`, o.token)).body).toMatchObject({ title: "Wedding", client: "Ada and Ben" });
    expect((await k.get("/v1/business/shoots", o.token)).body.items[0].title).toBe("Wedding");
    const stored = await k.db.shoot.findUniqueOrThrow({ where: { id: s.shoot } });
    expect(stored.shoot).toBe(`shoot-${s.shoot.slice(-8)}`);
  });

  it("a shoot rename of another business is 404, a removed login 403, and bad names 422 with the field", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 1);
    const other = await k.owner();
    expect((await k.patch(`/v1/business/shoots/${s.shoot}`, other.token, { title: "Mine now" })).status).toBe(404);
    expect((await k.get(`/v1/business/shoots/${s.shoot}`, o.token)).body.title).toBe("Wedding");
    const gone = await k.login(o, "removed");
    expect((await k.patch(`/v1/business/shoots/${s.shoot}`, gone.token, { title: "x" })).status).toBe(403);
    expect((await k.patch("/v1/business/shoots/not-a-uuid", o.token, { title: "x" })).status).toBe(404);
    expect((await k.t.http().patch(`/v1/business/shoots/${s.shoot}`).send({ title: "x" })).status).toBe(401);
    for (const [body, field] of [[{ title: "" }, "title"], [{ title: "x".repeat(41) }, "title"], [{ client: "   " }, "client"], [{ client: "c".repeat(61) }, "client"], [{}, "title"], [{ title: 5 }, "title"]] as [object, string][]) {
      const bad = await k.patch(`/v1/business/shoots/${s.shoot}`, o.token, body);
      expect(bad.status).toBe(422);
      expect(Object.keys(bad.body.error.fields)).toContain(field);
    }
    expect((await k.get(`/v1/business/shoots/${s.shoot}`, o.token)).body.title).toBe("Wedding");
  });

  it("the owner and a live login rename a file: the new name shows in the shoot, the file list and the download addresses; the stored object keeps its own name", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "finals", 2);
    const before = await k.db.storedFile.findUniqueOrThrow({ where: { id: s.files[0] } });
    const r = await k.patch(`/v1/business/vault-files/${s.files[0]}`, o.token, { name: "  Ada   first-dance.jpg " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: s.files[0], name: "Ada first-dance.jpg", size: 1000 });
    expect(r.body.url).toEqual(expect.any(String));
    const login = await k.login(o);
    expect((await k.patch(`/v1/business/vault-files/${s.files[1]}`, login.token, { name: "Cake.jpg" })).body.name).toBe("Cake.jpg");
    const shoot = await k.get(`/v1/business/shoots/${s.shoot}`, o.token);
    expect((shoot.body.finals as { id: string; name: string }[]).map((f) => f.name)).toEqual(["Ada first-dance.jpg", "Cake.jpg"]);
    const list = await k.get("/v1/business/vault-files", o.token);
    expect((list.body.items as { id: string; name: string }[]).find((f) => f.id === s.files[0])?.name).toBe("Ada first-dance.jpg");
    const sent = await k.post("/v1/business/reveals", o.token, { shoot: s.shoot, set: "finals", reveal: k.revealBody() });
    const view = await k.t.http().get(`/v1/r/${k.codeOf(sent.body.link)}`);
    expect((view.body.downloads as { name: string }[]).map((d) => d.name)).toEqual(["Ada first-dance.jpg", "Cake.jpg"]);
    const after = await k.db.storedFile.findUniqueOrThrow({ where: { id: s.files[0] } });
    expect(after.objectKey).toBe(before.objectKey);
    expect(after.shownName).toBe("Ada first-dance.jpg");
  });

  it("a file of another business, a held file for a login, a file that is no Vault file, and bad names are refused", async () => {
    const o = await k.owner();
    const s = await k.shootWith(o, "proofs", 1);
    const other = await k.owner();
    expect((await k.patch(`/v1/business/vault-files/${s.files[0]}`, other.token, { name: "Mine.jpg" })).status).toBe(404);
    expect((await k.get("/v1/business/vault-files", o.token)).body.items[0].name).toMatch(/^vault-/);
    const held = await k.vaultFile(o, 1000, "screening");
    expect((await k.patch(`/v1/business/vault-files/${held}`, o.token, { name: "Held.jpg" })).status).toBe(200);
    const login = await k.login(o);
    expect((await k.patch(`/v1/business/vault-files/${held}`, login.token, { name: "Nope.jpg" })).status).toBe(404);
    const gone = await k.login(o, "removed");
    const refused = await k.patch(`/v1/business/vault-files/${s.files[0]}`, gone.token, { name: "x.jpg" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("login_removed");
    const nobody = await k.who();
    expect((await k.patch(`/v1/business/vault-files/${s.files[0]}`, nobody.token, { name: "x.jpg" })).status).toBe(403);
    expect((await k.patch("/v1/business/vault-files/nope", o.token, { name: "x.jpg" })).status).toBe(404);
    const wishFile = k.ids.next();
    await k.db.storedFile.create({ data: { id: wishFile, ownerAccountId: o.accountId, businessId: o.businessId, purpose: "brand_logo", objectKey: `b/${wishFile}`, contentType: "image/png", bytes: 10n, status: "ready", variants: [], driver: "r2" } });
    expect((await k.patch(`/v1/business/vault-files/${wishFile}`, o.token, { name: "Logo.png" })).status).toBe(404);
    for (const name of ["", "   ", "a/b.jpg", "a\\b.jpg", "x".repeat(101), "bad\u0001name"]) expect((await k.patch(`/v1/business/vault-files/${s.files[0]}`, o.token, { name })).status).toBe(422);
    expect((await k.patch(`/v1/business/vault-files/${s.files[0]}`, o.token, {})).status).toBe(422);
  });
});
