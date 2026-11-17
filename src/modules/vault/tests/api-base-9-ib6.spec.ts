import { auth, useKit } from "./ab9-kit";

describe("API-BASE-9 case 3 (IB6): a live login gets Vault upload tickets", () => {
  const k = useKit();
  const ticket = (token: string, headers: Record<string, string> = {}) =>
    k.t.http().post("/v1/uploads").set(auth(token)).set(headers).send({ purpose: "vault", contentType: "image/jpeg", bytes: 1000 });

  it("the owner and a live login (active or invited) get a ticket for the business's Vault; the file is that business's", async () => {
    const o = await k.owner();
    expect((await ticket(o.token)).status).toBe(201);
    const active = await k.login(o, "active");
    const invited = await k.login(o, "invited");
    for (const l of [active, invited]) {
      const r = await ticket(l.token);
      expect(r.status).toBe(201);
      const row = await k.db.storedFile.findUniqueOrThrow({ where: { id: r.body.id } });
      expect(row).toMatchObject({ businessId: o.businessId, ownerAccountId: l.accountId, purpose: "vault_file" });
    }
    // naming the business with the header works for a login of it
    expect((await ticket(active.token, { "x-business-id": o.businessId })).status).toBe(201);
  });

  it("a removed login does not (login_removed, with words); another business's login and a person of no business do not", async () => {
    const o = await k.owner();
    const other = await k.owner();
    const gone = await k.login(o, "removed");
    const r = await ticket(gone.token);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("login_removed");
    expect(r.body.error.message).toMatch(/removed/i);
    const theirs = await k.login(other, "active");
    // a login of another business gets that business's Vault only, never this one's, whatever it names
    const named = await ticket(theirs.token, { "x-business-id": o.businessId });
    expect(named.status).toBe(403);
    const own = await ticket(theirs.token);
    expect(own.status).toBe(201);
    expect((await k.db.storedFile.findUniqueOrThrow({ where: { id: own.body.id } })).businessId).toBe(other.businessId);
    const nobody = await k.who();
    const none = await ticket(nobody.token);
    expect(none.status).toBe(403);
    expect(none.body.error.message).toBe("Vault files need a business.");
    // the owner naming a business that is not theirs
    expect((await ticket(o.token, { "x-business-id": other.businessId })).status).toBe(403);
    // removal at once: the same login that worked is refused the next minute
    const live = await k.login(o, "active");
    expect((await ticket(live.token)).status).toBe(201);
    await k.db.login.updateMany({ where: { businessId: o.businessId, contact: live.email }, data: { status: "removed" } });
    expect((await ticket(live.token)).status).toBe(403);
  });

  it("the login's ticket obeys the business's Vault space; a login's file goes with its shoot and gives the space back", async () => {
    const o = await k.owner({ vault: 0n });
    const l = await k.login(o, "active");
    await k.db.business.update({ where: { id: o.businessId }, data: { renews: new Date("2027-01-01T09:00:00.000Z") } });
    const lapsed = await ticket(l.token);
    expect(lapsed.status).toBe(403);
    await k.db.business.update({ where: { id: o.businessId }, data: { renews: new Date("2027-06-01T09:00:00.000Z") } });
    const s = await k.shootWith(o, "proofs", 1);
    const mine = await k.vaultFile({ ...o, accountId: l.accountId }, 4000);
    await k.db.storedFile.update({ where: { id: mine }, data: { businessId: o.businessId } });
    await k.db.business.update({ where: { id: o.businessId }, data: { vault: 5000n } });
    expect((await k.post(`/v1/business/shoots/${s.shoot}/files`, o.token, { files: [mine], set: "proofs", shoot: s.shoot })).status).toBe(201);
    expect((await k.t.http().delete(`/v1/business/shoots/${s.shoot}`).set(auth(o.token))).status).toBe(204);
    expect(await k.db.storedFile.findUnique({ where: { id: mine } })).toBeNull();
    expect(Number((await k.db.business.findUniqueOrThrow({ where: { id: o.businessId } })).vault)).toBe(0);
  });
});
