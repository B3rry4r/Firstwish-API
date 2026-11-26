import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, makeAccount, makeBusiness, PNG, ScoredScreening, stage, WEBM } from "../../stored-files/tests/files-kit";
import { SignedUrlsService } from "../../stored-files/signed-urls.service";
import { IMAGE_WIDTHS } from "../../stored-files/file-rules";

/** IM4 (DEC-330): a read that hands out a person's photo carries its sizes; a file that is not a picture carries none; another account's read is still refused. */
type Size = { width: number; variant: string; sized: boolean; url: string; expiresAt: string };

describe("IM4: the Vault's files and the shared photo read carry their sizes", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  let signed: SignedUrlsService;
  let owner: { id: string; token: string };
  let other: { id: string; token: string };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db, scored } = await filesApp());
    signed = t.app.get(SignedUrlsService);
    owner = await makeAccount(db, t, ["business"]);
    await makeBusiness(db, owner.id, { plan: "studio" });
    other = await makeAccount(db, t, ["business"]);
    await makeBusiness(db, other.id, { plan: "studio" });
  });
  afterAll(() => t.close());

  async function vaultFile(me: { token: string }, bytes: Buffer, type: string): Promise<string> {
    const r = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose: "vault-file", contentType: type, bytes: bytes.length });
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    await stage(t, db, id, bytes, type);
    scored.next.push(0);
    expect((await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id })).status).toBe(200);
    return id;
  }
  const item = async (id: string) => ((await t.http().get("/v1/business/vault-files?limit=50").set(auth(owner.token))).body.items as { id: string; url: string; variants?: Size[] }[]).find((i) => i.id === id);
  const size = async (id: string) => {
    const f = await db.storedFile.findUniqueOrThrow({ where: { id } });
    await db.storedFile.update({ where: { id }, data: { variants: IMAGE_WIDTHS.map((w) => ({ width: w, key: `${f.objectKey}.w${w}` })) } });
  };

  it("a picture: three sizes that are the clean full copy until they are made, then their own addresses; the list and the rename agree", async () => {
    const id = await vaultFile(owner, PNG(300), "image/png");
    const before = await item(id);
    expect((before?.variants ?? []).map((v) => [v.width, v.variant, v.sized])).toEqual([[320, "w320", false], [768, "w768", false], [1600, "w1600", false]]);
    for (const v of before?.variants ?? []) expect(v.url).toBe(before?.url);
    await size(id);
    const after = await item(id);
    expect((after?.variants ?? []).map((v) => [v.width, v.sized])).toEqual([[320, true], [768, true], [1600, true]]);
    expect(new Set([after?.url, ...(after?.variants ?? []).map((v) => v.url)]).size).toBe(4);
    for (const v of after?.variants ?? []) expect(v.url).toContain(`.w${v.width}`);
    const renamed = await t.http().patch(`/v1/business/vault-files/${id}`).set(auth(owner.token)).send({ name: "front.png" });
    expect(renamed.status).toBe(200);
    expect((renamed.body.variants as Size[]).map((v) => v.sized)).toEqual([true, true, true]);
  });

  it("a file that is not a picture carries none", async () => {
    const id = await vaultFile(owner, WEBM(200), "video/webm");
    const got = await item(id);
    expect(got?.url).toContain("storage.standin.invalid");
    expect(got).not.toHaveProperty("variants");
    expect((await signed.signedPhoto({ fileId: id }, { type: "vault", accountId: owner.id })).variants).toBeUndefined();
  });

  it("another account's read is still refused: a list never shows it, a rename is 404, the shared read is 404 for a wrong reader", async () => {
    const id = await vaultFile(owner, PNG(120), "image/png");
    await size(id);
    expect(JSON.stringify((await t.http().get("/v1/business/vault-files?limit=50").set(auth(other.token))).body)).not.toContain(id);
    expect((await t.http().patch(`/v1/business/vault-files/${id}`).set(auth(other.token)).send({ name: "mine.png" })).status).toBe(404);
    await expect(signed.signedPhoto({ fileId: id }, { type: "vault", accountId: other.id })).rejects.toMatchObject({ status: 404 });
    await expect(signed.signedPhoto({ fileId: id }, { type: "owner", accountId: other.id })).rejects.toMatchObject({ status: 404 });
    const staff = await signed.signedPhoto({ fileId: id }, { type: "staff" });
    expect(staff.variants?.every((v) => v.sized)).toBe(true);
  });
});
