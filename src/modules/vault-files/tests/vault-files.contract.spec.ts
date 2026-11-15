import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, JPEG, makeAccount, makeBusiness, ScoredScreening } from "../../stored-files/tests/files-kit";

describe("E-214 Vault files (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  let owner: { id: string; token: string };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db, scored } = await filesApp());
    owner = await makeAccount(db, t, ["business"]);
    await makeBusiness(db, owner.id, { plan: "studio" });
  });
  afterAll(() => t.close());

  async function vaultFile(bytes: number, score = 0): Promise<string> {
    const r = await t.http().post("/v1/uploads").set(auth(owner.token)).send({ purpose: "vault-file", contentType: "image/png", bytes });
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    t.storage.put((await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey, JPEG(bytes), "image/png");
    scored.next.push(score);
    await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(owner.token)).send({ fileId: id });
    return id;
  }

  it("lists the business's confirmed Vault files newest first, with sizes and signed reads, paged by cursor", async () => {
    const a = await vaultFile(100);
    const b = await vaultFile(200);
    const c = await vaultFile(300);
    const rejected = await vaultFile(400, 0.99);
    await t.http().post("/v1/uploads").set(auth(owner.token)).send({ purpose: "vault", contentType: "image/png", bytes: 10 });
    const p1 = await t.http().get("/v1/business/vault-files?limit=2").set(auth(owner.token));
    expect(p1.status).toBe(200);
    expect((p1.body.items as { id: string }[]).map((i) => i.id)).toEqual([c, b]);
    expect(p1.body.items[0]).toMatchObject({ id: c, size: 300 });
    expect(p1.body.items[0].name).toMatch(/\.png$/);
    expect(p1.body.items[0].url).toContain("storage.standin.invalid");
    const p2 = await t.http().get(`/v1/business/vault-files?limit=2&cursor=${p1.body.nextCursor as string}`).set(auth(owner.token));
    expect((p2.body.items as { id: string }[]).map((i) => i.id)).toEqual([a]);
    expect(p2.body.nextCursor).toBeNull();
    expect(JSON.stringify(p2.body)).not.toContain(rejected);
  });

  it("401 without a token, 403 without a business side, 422 for a bad limit or cursor", async () => {
    const person = await makeAccount(db, t, ["person"]);
    expect((await t.http().get("/v1/business/vault-files")).status).toBe(401);
    expect((await t.http().get("/v1/business/vault-files").set(auth(person.token))).status).toBe(403);
    expect((await t.http().get("/v1/business/vault-files?limit=0").set(auth(owner.token))).status).toBe(422);
    expect((await t.http().get("/v1/business/vault-files?limit=51").set(auth(owner.token))).status).toBe(422);
    expect((await t.http().get("/v1/business/vault-files?cursor=zzz").set(auth(owner.token))).status).toBe(422);
  });

  it("a business side with no business row is 403", async () => {
    const lone = await makeAccount(db, t, ["business"]);
    expect((await t.http().get("/v1/business/vault-files").set(auth(lone.token))).status).toBe(403);
  });
});
