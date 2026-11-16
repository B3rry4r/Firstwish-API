import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { StandinClock } from "../../../common/ports/clock.port";
import { loadEnv } from "../../../common/env/env";
import { STANDIN_STORAGE } from "../../../common/ports/standin-storage";
import type { StandinStorage } from "../../../common/ports/adapters/standins";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-01-09T09:00:00.000Z");
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** API-BASE-4: HP2 (save checks), HP3 (signed reads on the owner's read), HP5 (video state), item 9 (note bound, depth), HP6 (clock offset). */
describe("API-BASE-4 wishes (through the real routes)", () => {
  let t: TestApp;
  let db: PrismaService;
  let nid: () => string;
  let seq = 0;
  const run = `${process.pid}${Date.now() % 100000}`;

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
    await db.account.create({ data: { id: accountId, contact: `ab4-${run}-${++seq}@example.com`, sides: ["person"] as never, lastSide: "person" } });
    const token = `tok-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] as never });
    return { accountId, token };
  }
  type U = { accountId: string; token: string };
  type W = { id: string; version: number; pictures: { fileId: string; role: string; status: string; url: string | null; expiresAt: string | null }[]; video: string; content: Record<string, unknown> };
  const start = async (u: U) => (await t.http().post("/v1/wishes").set(bearer(u.token)).send({ from: "Ada", name: "Chidi", studio: "", kind: "love", occasion: "birthday", style: "noir" })).body as W;
  const save = (u: U, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send(body);
  const read = (u: U, id: string) => t.http().get(`/v1/wishes/${id}`).set(bearer(u.token));

  describe("HP2 a save refuses what the kind does not have", () => {
    it("422 on occasion for an occasion the kind lacks or that is unknown; 422 on step below 0, past 5 or not whole; valid ones save", async () => {
      const u = await user();
      const w = await start(u);
      const lacks = await save(u, w.id, { version: w.version, occasion: "save-the-date" });
      expect(lacks.status).toBe(422);
      expect(JSON.stringify(lacks.body)).toContain("occasion");
      const unknown = await save(u, w.id, { version: w.version, occasion: "no-such-day" });
      expect(unknown.status).toBe(422);
      expect(JSON.stringify(unknown.body)).toContain("occasion");
      for (const step of [-1, 6, 2.5]) {
        const r = await save(u, w.id, { version: w.version, step });
        expect(r.status).toBe(422);
        expect(JSON.stringify(r.body)).toContain("step");
      }
      const ok = await save(u, w.id, { version: w.version, occasion: "anniversary", step: 5 });
      expect(ok.status).toBe(200);
      expect(((await read(u, w.id)).body as { occasion: string; step: number })).toMatchObject({ occasion: "anniversary", step: 5 });
      const both = await save(u, w.id, { version: ok.body.version, kind: "wedding", occasion: "save-the-date", step: 0 });
      expect(both.status).toBe(200);
      const back = await save(u, w.id, { version: both.body.version, occasion: "birthday" });
      expect(back.status).toBe(422);
    });
  });

  describe("HP3 and HP5 the owner's read", () => {
    async function file(u: U, status: "ready" | "screening" | "rejected", bytes: string) {
      const id = nid();
      const objectKey = `files/${id}`;
      t.storage.put(objectKey, Buffer.from(bytes), "image/png");
      await db.storedFile.create({ data: { id, ownerAccountId: u.accountId, purpose: "wish_photo", objectKey, contentType: "image/png", bytes: BigInt(bytes.length), status, variants: [], driver: "r2" } });
      await db.uploadTicket.create({ data: { id, bytes: BigInt(bytes.length), contentType: "image/png", purpose: "wish-photo" } });
      return { id, objectKey };
    }

    it("gives a short-lived signed url beside the cover's and each photo's id; none for a refused or screening photo; none to another person; the url serves the bytes", async () => {
      const u = await user();
      const w = await start(u);
      const cover = await file(u, "ready", "COVERBYTES");
      const p1 = await file(u, "ready", "PHOTOBYTES");
      const p2 = await file(u, "screening", "HELD");
      const p3 = await file(u, "screening", "BAD");
      const saved = await save(u, w.id, { version: w.version, content: { cover: { photoId: cover.id }, story: { photos: [{ photoId: p1.id }, { photoId: p2.id }, { photoId: p3.id }] } } });
      expect(saved.status).toBe(200);
      await db.storedFile.update({ where: { id: p3.id }, data: { status: "rejected" } }); // screening later refused it
      const got = (await read(u, w.id)).body as W;
      const by = new Map(got.pictures.map((p) => [p.fileId, p]));
      expect(by.get(cover.id)).toMatchObject({ status: "ready", role: "photo" });
      expect(by.get(cover.id)?.url).toContain(cover.objectKey);
      expect(by.get(p1.id)?.url).toContain(p1.objectKey);
      expect(by.get(p2.id)).toEqual({ fileId: p2.id, role: "photo", status: "screening", url: null, expiresAt: null });
      expect(by.get(p3.id)).toEqual({ fileId: p3.id, role: "photo", status: "refused", url: null, expiresAt: null });
      const life = new Date(by.get(p1.id)?.expiresAt as string).getTime() - t.clock.now().getTime();
      expect(life).toBeGreaterThan(0);
      expect(life).toBeLessThanOrEqual(15 * 60 * 1000);
      const listed = ((await t.http().get("/v1/wishes").set(bearer(u.token))).body.items as W[]).find((x) => x.id === w.id) as W;
      expect(listed.pictures.find((p) => p.fileId === p1.id)?.url).toContain(p1.objectKey);
      expect(listed.pictures.find((p) => p.fileId === p2.id)?.url).toBeNull();
      const other = await user();
      expect((await read(other, w.id)).status).toBe(404);
      expect(((await t.http().get("/v1/wishes").set(bearer(other.token))).body.items as W[]).length).toBe(0);
      // the stand-in storage's url serves the bytes (a stack points it at /v1/standin-storage; here the host is rewritten to the app)
      const url = new URL(by.get(p1.id)?.url as string);
      const served = await t.http().get(`/v1/standin-storage${url.pathname.replace(/^\/standin-bucket/, "/standin-bucket")}${url.search}`);
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toContain("image/png");
      expect(Buffer.from(served.body as Buffer).toString()).toBe("PHOTOBYTES");
      expect((await t.http().get(`/v1/standin-storage${url.pathname}?expires=${url.searchParams.get("expires")}&signature=0000`)).status).toBe(404);
      expect(t.app.get<StandinStorage | null>(STANDIN_STORAGE)).not.toBeNull();
    });

    it("HP5: the wish read carries the video's state (none, asked, rendering, ready, failed); GET /wishes/:id/video keeps its answers", async () => {
      const u = await user();
      const w = await start(u);
      expect((await read(u, w.id)).body.video).toBe("none");
      expect((await t.http().get(`/v1/wishes/${w.id}/video`).set(bearer(u.token))).status).toBe(404);
      const states: [string, string][] = [["queued", "asked"], ["rendering", "rendering"], ["done", "ready"], ["failed", "failed"]];
      for (const [stored, shown] of states) {
        const jobId = nid();
        await db.renderJob.create({ data: { id: jobId, wishId: w.id, kind: "status_video", status: stored as never, width: 1080, height: 1920, seconds: 30 } });
        expect((await read(u, w.id)).body.video).toBe(shown);
        const listed = ((await t.http().get("/v1/wishes").set(bearer(u.token))).body.items as W[]).find((x) => x.id === w.id) as W;
        expect(listed.video).toBe(shown);
        const v = await t.http().get(`/v1/wishes/${w.id}/video`).set(bearer(u.token));
        expect(v.status).toBe(200);
        expect(v.body).toMatchObject({ id: jobId, status: stored, wishId: w.id });
      }
      const other = await user();
      expect((await t.http().get(`/v1/wishes/${w.id}/video`).set(bearer(other.token))).status).toBe(404);
    });
  });

  describe("item 9 the maker's note and nesting", () => {
    it("the stored note is bounded: small saves cannot pile past the limit (422, the stored note unchanged)", async () => {
      const u = await user();
      const w = await start(u);
      let version = w.version;
      let refused = 0;
      for (let i = 0; i < 8; i++) {
        const r = await save(u, w.id, { version, makerNote: { [`k${i}`]: "x".repeat(2000) } });
        if (r.status === 200) version = r.body.version;
        else {
          refused++;
          expect(r.status).toBe(422);
          expect(JSON.stringify(r.body)).toContain("makerNote");
        }
      }
      expect(refused).toBeGreaterThan(0);
      const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
      expect(JSON.stringify(row.makerNote).length).toBeLessThanOrEqual(8192);
    });

    it("a body nested too deep is 422, never 500, and nothing is stored", async () => {
      const u = await user();
      const w = await start(u);
      let deep: unknown = "x";
      for (let i = 0; i < 3000; i++) deep = { a: deep };
      const raw = JSON.stringify({ version: w.version, makerNote: { n: deep } });
      const r = await t.http().patch(`/v1/wishes/${w.id}`).set(bearer(u.token)).set("content-type", "application/json").send(raw);
      expect(r.status).toBe(422);
      expect(JSON.stringify(r.body)).toMatch(/Nested too deeply/);
      expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).makerNote).toEqual({ chosen: { kind: true, occasion: true, style: true } });
    });
  });

  describe("HP6 the clock offset", () => {
    it("moves the stand-in clock's now by the seconds given and is refused with production or live providers", () => {
      const before = Date.now();
      const c = new StandinClock(undefined, 86400);
      expect(c.now().getTime() - before).toBeGreaterThanOrEqual(86400 * 1000 - 5);
      expect(c.now().getTime() - before).toBeLessThan(86400 * 1000 + 5000);
      expect(new StandinClock(undefined, -60).now().getTime()).toBeLessThan(before - 59000);
      const base = {
        DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/x", REDIS_URL: "redis://127.0.0.1:6379", JWT_ACCESS_SECRET: "a".repeat(32), REFRESH_TOKEN_PEPPER: "b".repeat(32),
        AUTH_CODE_PEPPER: "c".repeat(32), INTERNAL_TOKEN: "d".repeat(32), COOKIE_DOMAIN: "localhost", WEB_ORIGINS: "http://localhost:3000",
        PUBLIC_SITE_URL: "http://localhost:3000", API_PUBLIC_URL: "http://localhost:3001", PROVIDERS: "standin", NODE_ENV: "development",
      };
      expect(loadEnv({ ...base, STANDIN_CLOCK_OFFSET: "3600" }).STANDIN_CLOCK_OFFSET).toBe("3600");
      expect(() => loadEnv({ ...base, STANDIN_CLOCK_OFFSET: "3600", NODE_ENV: "production" })).toThrow(/STANDIN_CLOCK_OFFSET/);
      expect(() => loadEnv({ ...base, STANDIN_CLOCK_OFFSET: "3600", PROVIDERS: "live" })).toThrow(/STANDIN_CLOCK_OFFSET/);
      expect(() => loadEnv({ ...base, STANDIN_CLOCK_OFFSET: "soon" })).toThrow(/whole number/);
    });
  });
});
