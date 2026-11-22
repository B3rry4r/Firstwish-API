import { EnvError, loadEnv } from "../../env/env";
import { PrismaService } from "../../db/prisma.service";
import { UuidV7Maker } from "../../ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { standinEnv } from "../../../../test/kit/env";
import { PNG } from "../../../modules/stored-files/tests/files-kit";

const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-12 case 4 (API-BASE-12 case 4): the stand-in screening can hold a file in "screening" or refuse it, by file name, on a stack that turns the setting on. */
describe("API-BASE-12 case 4 STANDIN_SCREENING", () => {
  const saved = process.env.STANDIN_SCREENING;
  afterAll(() => {
    if (saved === undefined) delete process.env.STANDIN_SCREENING;
    else process.env.STANDIN_SCREENING = saved;
  });

  async function creatorOn(t: TestApp) {
    const db = t.app.get(PrismaService);
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab12s-${run}-${++seq}@example.com`, name: "Maker", handle: `ab12s${run}${seq}`.toLowerCase().slice(0, 20), sides: ["person", "creator"], lastSide: "creator" } });
    await db.creator.create({ data: { id: ids.next(), accountId: id, name: "Maker" } });
    t.tokens.set(`s-${id}`, { kind: "user", accountId: id, sides: ["person", "creator"] });
    return { id, auth: { authorization: `Bearer s-${id}` } };
  }
  async function send(t: TestApp, c: { auth: Record<string, string> }, fileName?: string) {
    const bytes = PNG(60);
    const tk = await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "profile", contentType: "image/png", bytes: bytes.length, ...(fileName === undefined ? {} : { fileName }) });
    expect(tk.status).toBe(201);
    const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
    expect(t.storage.putSigned(key, bytes, "image/png")).toBe(true);
    const cf = await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(c.auth).send({ fileId: tk.body.id });
    expect(cf.status).toBe(200);
    return { id: tk.body.id as string, status: cf.body.status as string };
  }

  it("a file whose name matches hold: waits in screening; reject: is refused; any other name, or none, passes", async () => {
    process.env.STANDIN_SCREENING = "hold:held,reject:refused";
    const t = await createTestApp();
    try {
      const db = t.app.get(PrismaService);
      const c = await creatorOn(t);
      const held = await send(t, c, "My-Held-Photo.PNG");
      expect(held.status).toBe("screening");
      expect((await db.screeningResult.findFirstOrThrow({ where: { fileId: held.id } })).verdict).toBe("review");
      const refused = await send(t, c, "REFUSED.png");
      expect(refused.status).toBe("rejected");
      expect((await db.screeningResult.findFirstOrThrow({ where: { fileId: refused.id } })).verdict).toBe("reject");
      expect((await send(t, c, "holiday.png")).status).toBe("ready");
      expect((await send(t, c)).status).toBe("ready");
      // the name is read by the stand-in alone: too long a name is refused in words, and the key of an unnamed file is as it was
      const long = await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "profile", contentType: "image/png", bytes: 10, fileName: "x".repeat(201) });
      expect(long.status).toBe(422);
      expect(long.body.error.fields.fileName).toBe("At most 200 characters.");
    } finally {
      await t.close();
    }
  }, 60000);

  it("with the setting off, a name changes nothing", async () => {
    delete process.env.STANDIN_SCREENING;
    const t = await createTestApp();
    try {
      const c = await creatorOn(t);
      expect((await send(t, c, "held.png")).status).toBe("ready");
      expect((await send(t, c, "refused.png")).status).toBe("ready");
    } finally {
      await t.close();
    }
  }, 60000);

  const problems = (raw: Record<string, string | undefined>): string[] => {
    try {
      loadEnv(raw);
      return [];
    } catch (e) {
      if (!(e instanceof EnvError)) throw e;
      return e.problems.map((p) => p.name);
    }
  };

  it("the setting is refused unless PROVIDERS is standin and NODE_ENV is not production; a rule of another shape is refused", async () => {
    const on = { ...standinEnv(), STANDIN_SCREENING: "hold:held,reject:refused" };
    expect(problems(on)).toEqual([]);
    expect(problems({ ...on, PROVIDERS: "live" })).toContain("STANDIN_SCREENING");
    expect(problems({ ...on, NODE_ENV: "production" })).toContain("STANDIN_SCREENING");
    for (const bad of ["held", "hold:", "pass:x", "hold:a b", "hold:x,", "reject:" + "x".repeat(41)]) expect(problems({ ...standinEnv(), STANDIN_SCREENING: bad })).toContain("STANDIN_SCREENING");
    // the app itself fails to boot where the setting is refused
    process.env.STANDIN_SCREENING = "hold:held";
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(createTestApp()).rejects.toThrow(/STANDIN_SCREENING/);
    } finally {
      process.env.NODE_ENV = was;
    }
  }, 60000);
});
