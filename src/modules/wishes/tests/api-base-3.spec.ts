import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-01-09T09:00:00.000Z");
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** API-BASE-3: HM1 (makerNote read back), HM3 (a start is safe to repeat), HM4 (Wish.content is an object in the contracts). */
describe("API-BASE-3 HM1 HM3 HM4 (through the real routes)", () => {
  let t: TestApp;
  let db: PrismaService;
  let nid: () => string;
  let seq = 0;
  const run = RUN;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    nid = () => t.app.get(IdGenerator).id();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  async function user() {
    const accountId = nid();
    await db.account.create({ data: { id: accountId, contact: `ab3-${run}-${++seq}@example.com`, sides: ["person"] as never, lastSide: "person" } });
    const token = `tok-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] as never });
    return { accountId, token };
  }
  type W = { id: string; version: number; kind: string; occasion: string; style: string; makerNote: Record<string, unknown> | null; content: Record<string, unknown> };
  const start = (u: { token: string }, body: Record<string, unknown> = {}, key?: string) => {
    const r = t.http().post("/v1/wishes").set(bearer(u.token));
    if (key) r.set("Idempotency-Key", key);
    return r.send({ from: "Ada", name: "Chidi", studio: "", ...body });
  };
  const carry = { kind: "love", occasion: "birthday", style: "noir" };
  const save = (u: { token: string }, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send(body);
  const read = (u: { token: string }, id: string) => t.http().get(`/v1/wishes/${id}`).set(bearer(u.token));
  const drafts = (accountId: string) => db.wish.count({ where: { accountId } });
  const k = (tag: string) => `ab3-${tag}-${run}-${++seq}`;

  describe("HM1 makerNote", () => {
    it("GET /v1/wishes/:id and the list give back exactly what PATCH saved (null before); the maker's note merges as it did", async () => {
      const u = await user();
      const made = (await start(u)).body as W;
      expect(made.makerNote).toBeNull();
      expect((await read(u, made.id)).body.makerNote).toBeNull();
      const note = { chosen: { kind: true, occasion: false }, given: { kind: false, occasion: false }, note: "She likes the sea.", now: false, wedding: "2027-06-12", voice: 2 };
      const saved = await save(u, made.id, { version: made.version, makerNote: note });
      expect(saved.status).toBe(200);
      const got = (await read(u, made.id)).body as W;
      expect(got.makerNote).toEqual(note);
      const listed = (await t.http().get("/v1/wishes").set(bearer(u.token))).body.items as W[];
      expect(listed.find((w) => w.id === made.id)?.makerNote).toEqual(note);
      const again = await save(u, made.id, { version: saved.body.version, makerNote: { note: "Changed." } });
      expect(again.status).toBe(200);
      expect(((await read(u, made.id)).body as W).makerNote).toEqual({ ...note, note: "Changed." });
    });

    it("another person never sees it: the wish is 404 to them and absent from their list", async () => {
      const u = await user();
      const other = await user();
      const made = (await start(u)).body as W;
      await save(u, made.id, { version: made.version, makerNote: { note: "Private words ab3." } });
      expect((await read(other, made.id)).status).toBe(404);
      const theirs = await t.http().get("/v1/wishes").set(bearer(other.token));
      expect(JSON.stringify(theirs.body)).not.toContain("Private words ab3.");
      expect((await t.http().get(`/v1/wishes/${made.id}`)).status).toBe(401);
    });

    it("erase still covers it: after the owner erases, the column is blank (the AA2 rule)", async () => {
      const u = await user();
      const made = (await start(u)).body as W;
      await save(u, made.id, { version: made.version, makerNote: { note: "Gone soon." } });
      expect((await t.http().delete(`/v1/wishes/${made.id}`).set(bearer(u.token)).send({})).status).toBe(200);
      expect((await t.http().post(`/v1/wishes/${made.id}/erase`).set(bearer(u.token))).status).toBe(204);
      const row = await db.wish.findUniqueOrThrow({ where: { id: made.id } });
      expect(row.makerNote).toBeNull();
    });
  });

  describe("HM3 starting a wish", () => {
    it("the same Idempotency-Key twice answers the same draft: 201 then 200, one row", async () => {
      const u = await user();
      const key = k("same");
      const a = await start(u, carry, key);
      const b = await start(u, carry, key);
      expect([a.status, b.status]).toEqual([201, 200]);
      expect(b.body.id).toBe(a.body.id);
      expect(await drafts(u.accountId)).toBe(1);
      expect(await db.wishStart.count({ where: { accountId: u.accountId } })).toBe(1);
    });

    it("the same key keeps answering that draft after it was touched and after the person started others", async () => {
      const u = await user();
      const key = k("later");
      const a = (await start(u, carry, key)).body as W;
      await save(u, a.id, { version: a.version, content: { letter: { paras: ["Hello."] } } });
      expect((await start(u, carry)).body.id).not.toBe(a.id);
      const again = await start(u, carry, key);
      expect([again.status, again.body.id]).toEqual([200, a.id]);
    });

    it("10 at once with the same key answer the SAME draft (one row, one 201)", async () => {
      const u = await user();
      const key = k("ten");
      const rs = await Promise.all(Array.from({ length: 10 }, () => start(u, carry, key)));
      expect(new Set(rs.map((r) => String(r.body.id))).size).toBe(1);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
      expect(await drafts(u.accountId)).toBe(1);
    });

    it("10 bare starts at once, each with its own key, make one draft", async () => {
      const u = await user();
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => start(u, {}, k(`own${i}`))));
      expect(new Set(rs.map((r) => String(r.body.id))).size).toBe(1);
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await drafts(u.accountId)).toBe(1);
    });

    it("a different key makes another draft when the start carries a kind, occasion or style", async () => {
      const u = await user();
      const a = await start(u, carry, k("a"));
      const b = await start(u, carry, k("b"));
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body.id).not.toBe(a.body.id);
      expect(await drafts(u.accountId)).toBe(2);
      expect((a.body as W).makerNote).toEqual({ chosen: { kind: true, occasion: true, style: true } });
    });

    it("HO1 bare start twice (with or without a key): the same draft, byte for byte unchanged, name and cover too", async () => {
      const u = await user();
      const a = await start(u);
      expect(a.status).toBe(201);
      const b = await start(u, { name: "Someone Else", from: "Zed", studio: "Zed Studio" });
      const c = await start(u, {}, k("c"));
      expect([b.status, b.body.id, c.status, c.body.id]).toEqual([200, a.body.id, 200, a.body.id]);
      expect(b.body).toEqual(a.body);
      expect(c.body).toEqual(a.body);
      expect(await drafts(u.accountId)).toBe(1);
    });

    it("HO1 PATCH kind then a start with another kind: a NEW draft, the old one unchanged", async () => {
      const u = await user();
      const a = (await start(u)).body as W;
      expect((await save(u, a.id, { version: a.version, kind: "celebration", style: "grace" })).status).toBe(200);
      const before = (await read(u, a.id)).body;
      const b = await start(u, { kind: "love" });
      expect([b.status, b.body.id === a.id, b.body.kind]).toEqual([201, false, "love"]);
      expect((await read(u, a.id)).body).toEqual(before);
      expect(before.kind).toBe("celebration");
    });

    it("HO1 PATCH style then a start with another style: a new draft, the PATCHed style kept", async () => {
      const u = await user();
      const a = (await start(u)).body as W;
      expect((await save(u, a.id, { version: a.version, style: "noir" })).status).toBe(200);
      const b = await start(u, { style: a.style === "noir" ? "golden" : a.style });
      expect([b.status, b.body.id === a.id]).toEqual([201, false]);
      expect((await read(u, a.id)).body.style).toBe("noir");
    });

    it("HO1 the web's usual PATCH (makerNote.chosen replaced whole) then a start: a new draft, the old one unchanged", async () => {
      const u = await user();
      const a = (await start(u, { kind: "celebration", style: "noir" })).body as W;
      const note = { chosen: { kind: false, occasion: false }, given: { kind: false, occasion: false }, note: "", now: false, wedding: null };
      expect((await save(u, a.id, { version: a.version, makerNote: note })).status).toBe(200);
      const b = await start(u, { kind: "love" });
      expect([b.status, b.body.id === a.id]).toEqual([201, false]);
      const old = (await read(u, a.id)).body as W;
      expect([old.kind, old.style]).toEqual(["celebration", "noir"]);
      const c = await start(u);
      expect([c.status, c.body.id === a.id]).toEqual([201, false]);
    });

    it("HO1 bare, then PATCH name, then bare: a new draft; the PATCHed name stays", async () => {
      const u = await user();
      const a = (await start(u)).body as W;
      expect((await save(u, a.id, { version: a.version, name: "Mine" })).status).toBe(200);
      const b = await start(u);
      expect([b.status, b.body.id === a.id]).toEqual([201, false]);
      expect((await read(u, a.id)).body.name).toBe("Mine");
    });

    it("HO1 a touched draft (note, open time, passcode, even cleared again) is never handed back", async () => {
      const u = await user();
      const a = (await start(u)).body as W;
      const s1 = await save(u, a.id, { version: a.version, content: { letter: { paras: ["Dear Chidi."] } } });
      expect(s1.status).toBe(200);
      await save(u, a.id, { version: s1.body.version, content: { letter: null } });
      const b = await start(u);
      expect([b.status, b.body.id === a.id]).toEqual([201, false]);
      const v = await user();
      const c = (await start(v)).body as W;
      expect((await save(v, c.id, { version: c.version, opensAt: "2027-03-01T09:00" })).status).toBe(200);
      expect((await start(v)).body.id).not.toBe(c.id);
    });

    it("HO1 a start with a kind never hands back a bare draft", async () => {
      const u = await user();
      const a = (await start(u)).body as W;
      const b = await start(u, { kind: "celebration" });
      expect([b.status, b.body.id === a.id]).toEqual([201, false]);
      const same = (await read(u, a.id)).body as W;
      expect([same.version, same.kind, same.makerNote, same.content]).toEqual([a.version, a.kind, a.makerNote, a.content]);
    });

    it("another person's bare draft is never handed over, and a removed draft is not handed back", async () => {
      const u = await user();
      const other = await user();
      const a = (await start(u)).body as W;
      const theirs = await start(other);
      expect([theirs.status, theirs.body.id === a.id]).toEqual([201, false]);
      expect((await t.http().delete(`/v1/wishes/${a.id}`).set(bearer(u.token)).send({})).status).toBe(200);
      const after = await start(u);
      expect([after.status, after.body.id === a.id]).toEqual([201, false]);
    });

    it("HO2 a remembered key whose wish is removed, sealed or erased is 409 key_spent with words; while a draft it is 200", async () => {
      const u = await user();
      const key = k("spent");
      const a = (await start(u, {}, key)).body as W;
      expect((await start(u, {}, key)).status).toBe(200);
      expect((await t.http().delete(`/v1/wishes/${a.id}`).set(bearer(u.token)).send({})).status).toBe(200);
      const r = await start(u, {}, key);
      expect([r.status, r.body.error.code]).toEqual([409, "key_spent"]);
      expect(String(r.body.error.message).length).toBeGreaterThan(10);
      const k2 = k("spent2");
      const b = (await start(u, { kind: "love" }, k2)).body as W;
      await db.wish.update({ where: { id: b.id }, data: { status: "sealed" as never } });
      expect((await start(u, { kind: "love" }, k2)).status).toBe(409);
      const k3 = k("spent3");
      const c = (await start(u, { kind: "love" }, k3)).body as W;
      await db.wish.update({ where: { id: c.id }, data: { erasedAt: new Date() } });
      expect((await start(u, { kind: "love" }, k3)).body.error.code).toBe("key_spent");
    });

    it("HO3 a makerNote over the limit is 422 naming makerNote, with or without a wedding", async () => {
      const u = await user();
      const a = (await start(u)).body as W;
      const big = await save(u, a.id, { version: a.version, makerNote: { note: "x".repeat(9000) } });
      expect([big.status, big.body.error.fields.makerNote !== undefined]).toEqual([422, true]);
      const withWedding = await save(u, a.id, { version: a.version, makerNote: { note: "x".repeat(9000), wedding: "2027-06-12" } });
      expect(withWedding.status).toBe(422);
      expect((await save(u, a.id, { version: a.version, makerNote: { note: "ok" } })).status).toBe(200);
    });

    it("a bad key is 422 naming the header; a start with a bad kind is still 422", async () => {
      const u = await user();
      const bad = await start(u, carry, "short");
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields["Idempotency-Key"]).toBeDefined();
      const kind = await start(u, { kind: "no way!" });
      expect(kind.status).toBe(422);
      expect(await drafts(u.accountId)).toBe(0);
    });
  });

  describe("HM4 Wish.content is an object", () => {
    it("the registry and the contracts file type it as an object; the wire still answers an object", async () => {
      const reg = JSON.parse(readFileSync(join(ROOT, ".pipeline/registry.json"), "utf8")) as { resources: { name: string; fields: { name: string; type: string }[] }[] };
      const wish = reg.resources.find((r) => r.name === "Wish")!;
      expect(wish.fields.find((f) => f.name === "content")?.type).toBe("object");
      // every field with named children is an object in the registry (the fault was only ever Wish.content)
      for (const r of reg.resources) {
        for (const f of r.fields) {
          if (r.fields.some((c) => c.name.startsWith(`${f.name}.`) || c.name.startsWith(`${f.name}[`))) expect([r.name, f.name, f.type]).toEqual([r.name, f.name, "object"]);
        }
      }
      const dts = readFileSync(join(ROOT, "contracts/firstwish-contracts.d.ts"), "utf8");
      const body = dts.slice(dts.indexOf("export interface Wish {"));
      expect(body.slice(0, body.indexOf("\n}")).match(/^\s+content\?: .*$/m)?.[0].trim()).toBe("content?: Record<string, unknown> | null;");
      const u = await user();
      const made = (await start(u, carry)).body as W;
      expect(made.content).toEqual({ cover: { from: "Ada" } });
    });
  });
});
