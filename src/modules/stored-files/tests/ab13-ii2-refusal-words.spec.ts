import type { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { createTestApp } from "../../../../test/kit/app";
import { PrismaService as Prisma } from "../../../common/db/prisma.service";
import { parseScreeningRules } from "../../../common/env/env";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { holdSettingLock } from "../../../../test/kit/setting-lock";
import { NOT_ACCEPTED, REFUSAL_WORDS, refusalWords } from "../refusal-words";
import { filesApp, makeAccount, makeBusiness, PNG, JPEG, ScoredScreening, stage } from "./files-kit";

/* API-BASE-13 case 3 (II2): a refused file carries the reason in the server's plain words, from a fixed list by the screening result's own kind. */
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const ids = new UuidV7Maker();

describe("API-BASE-13 case 3 (II2): the words of a refused file", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  // the upload checks read the price book's file limits, which the Prices specs change: this spec holds the same lock they do
  let releaseSetting: () => Promise<void>;
  beforeAll(async () => {
    releaseSetting = await holdSettingLock();
    ({ t, db, scored } = await filesApp());
  });
  afterAll(async () => {
    await t.close();
    await releaseSetting();
  });

  async function creatorWithStyle() {
    const a = await makeAccount(db, t, ["person", "creator"]);
    await db.creator.create({ data: { id: ids.next(), accountId: a.id, name: "Maker" } });
    const style = ids.next();
    await db.studioStyle.create({ data: { id: style, accountId: a.id, status: "draft", document: { id: style, name: "Style" }, version: 0 } });
    return { ...a, style };
  }
  async function send(token: string, body: Record<string, unknown>, bytes: Buffer, type: string, screen?: { score: number; labels: string[] }) {
    const tk = await t.http().post("/v1/uploads").set(auth(token)).send({ contentType: type, bytes: bytes.length, ...body });
    expect(tk.status).toBe(201);
    await stage(t, db, tk.body.id, bytes, type);
    if (screen) {
      scored.next.push(screen.score);
      scored.nextLabels.push(screen.labels);
    }
    const cf = await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(auth(token)).send({ fileId: tk.body.id });
    expect(cf.status).toBe(200);
    return { id: tk.body.id as string, body: cf.body as Record<string, unknown> };
  }

  it("a style's files, read by the creator (list and one): each refused file carries the words of its kind; a held, a ready file carry null; the public never reads a refused file", async () => {
    const c = await creatorWithStyle();
    const cases: [string[], string][] = [
      [["type not taken"], REFUSAL_WORDS["type not taken"]],
      [["empty"], REFUSAL_WORDS.empty],
      [["too large"], REFUSAL_WORDS["too large"]],
      [["type mismatch"], REFUSAL_WORDS["type mismatch"]],
      [["stand-in"], NOT_ACCEPTED],
      [[], NOT_ACCEPTED],
    ];
    const made: { id: string; words: string }[] = [];
    for (const [labels, words] of cases) {
      const f = await send(c.token, { purpose: "picture", styleId: c.style }, PNG(60), "image/png", { score: 1, labels });
      expect(f.body).toMatchObject({ status: "rejected", reason: words });
      made.push({ id: f.id, words });
    }
    const held = await send(c.token, { purpose: "picture", styleId: c.style }, PNG(60), "image/png", { score: 0.6, labels: ["stand-in"] });
    expect(held.body).toMatchObject({ status: "screening", reason: null });
    const ok = await send(c.token, { purpose: "picture", styleId: c.style }, PNG(60), "image/png");
    expect(ok.body).toMatchObject({ status: "ready", reason: null });

    const list = await t.http().get(`/v1/studio/styles/${c.style}/files`).set(auth(c.token)).query({ limit: 50 });
    expect(list.status).toBe(200);
    const by = new Map((list.body.items as { fileId: string; status: string; reason: string | null; url: string | null }[]).map((i) => [i.fileId, i]));
    for (const m of made) {
      expect(by.get(m.id)).toMatchObject({ status: "rejected", reason: m.words, url: null });
      const one = await t.http().get(`/v1/studio/styles/${c.style}/files/${m.id}`).set(auth(c.token));
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ fileId: m.id, status: "rejected", reason: m.words, url: null });
    }
    expect(by.get(held.id)).toMatchObject({ status: "screening", reason: null });
    expect(by.get(ok.id)).toMatchObject({ status: "ready", reason: null });
    // no provider wording and no label text is passed through
    for (const i of by.values()) if (i.reason) expect(i.reason).not.toMatch(/stand-in|provider|reason/i);
    // another creator reads none of it
    const other = await makeAccount(db, t, ["person", "creator"]);
    expect((await t.http().get(`/v1/studio/styles/${c.style}/files/${made[0].id}`).set(auth(other.token))).status).toBe(404);
  });

  it("a business upload that is screened (a Vault photo, the brand logo) carries the words on its confirm and on a repeat of it; a clean one carries null", async () => {
    const a = await makeAccount(db, t, ["person", "business"]);
    await makeBusiness(db, a.id, { plan: "starter" });
    for (const purpose of ["vault", "brand"]) {
      const bad = await send(a.token, { purpose }, JPEG(60), "image/jpeg", { score: 1, labels: ["type mismatch"] });
      expect(bad.body).toMatchObject({ status: "rejected", reason: REFUSAL_WORDS["type mismatch"] });
      const again = await t.http().post(`/v1/uploads/${bad.id}/confirm`).set(auth(a.token)).send({ fileId: bad.id });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ status: "rejected", reason: REFUSAL_WORDS["type mismatch"] });
      const unnamed = await send(a.token, { purpose }, JPEG(60), "image/jpeg", { score: 1, labels: [] });
      expect(unnamed.body).toMatchObject({ status: "rejected", reason: NOT_ACCEPTED });
      const good = await send(a.token, { purpose }, JPEG(60), "image/jpeg");
      expect(good.body).toMatchObject({ status: "ready", reason: null });
    }
  });

  it("the fixed list: the first kind the result names picks the line; an unknown or customer text never does", () => {
    expect(refusalWords(["stand-in", "too large"])).toBe(REFUSAL_WORDS["too large"]);
    expect(refusalWords(["a photo of my cousin", "Files of type image/x are not taken."])).toBe(NOT_ACCEPTED);
    expect(refusalWords(null)).toBe(NOT_ACCEPTED);
    expect(refusalWords({})).toBe(NOT_ACCEPTED);
    expect(refusalWords(["toString", "constructor"])).toBe(NOT_ACCEPTED);
    for (const words of [...Object.values(REFUSAL_WORDS), NOT_ACCEPTED]) expect(words).toMatch(/^This (file|kind of file) /);
  });

  it("the stand-in's reject rule can name the kind; a hold rule cannot; an unknown kind is refused", async () => {
    expect(parseScreeningRules("reject:big:too-large,reject:odd:type-mismatch,hold:held,reject:plain")).toEqual([
      { action: "reject", text: "big", kind: "too-large" },
      { action: "reject", text: "odd", kind: "type-mismatch" },
      { action: "hold", text: "held" },
      { action: "reject", text: "plain" },
    ]);
    for (const bad of ["hold:held:empty", "reject:x:huge", "reject:x:", "reject:x:Too-Large"]) expect(parseScreeningRules(bad)).toBeNull();

    const saved = process.env.STANDIN_SCREENING;
    process.env.STANDIN_SCREENING = "reject:big:too-large,reject:odd:type-mismatch,reject:blank:empty,reject:nope:type-not-taken,reject:plain,hold:held";
    const t2 = await createTestApp();
    try {
      const db2 = t2.app.get(Prisma);
      const a = await makeAccount(db2, t2, ["person", "creator"]);
      await db2.creator.create({ data: { id: ids.next(), accountId: a.id, name: "Maker" } });
      const go = async (fileName?: string) => {
        const bytes = PNG(60);
        const tk = await t2.http().post("/v1/uploads").set(auth(a.token)).send({ purpose: "profile", contentType: "image/png", bytes: bytes.length, ...(fileName ? { fileName } : {}) });
        expect(tk.status).toBe(201);
        const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
        expect(t2.storage.putSigned(key, bytes, "image/png")).toBe(true);
        const cf = await t2.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(auth(a.token)).send({ fileId: tk.body.id });
        expect(cf.status).toBe(200);
        return cf.body as { status: string; reason: string | null };
      };
      expect(await go("Big-Photo.png")).toMatchObject({ status: "rejected", reason: REFUSAL_WORDS["too large"] });
      expect(await go("odd.png")).toMatchObject({ status: "rejected", reason: REFUSAL_WORDS["type mismatch"] });
      expect(await go("blank.png")).toMatchObject({ status: "rejected", reason: REFUSAL_WORDS.empty });
      expect(await go("nope.png")).toMatchObject({ status: "rejected", reason: REFUSAL_WORDS["type not taken"] });
      expect(await go("plain.png")).toMatchObject({ status: "rejected", reason: NOT_ACCEPTED });
      expect(await go("held.png")).toMatchObject({ status: "screening", reason: null });
      expect(await go("holiday.png")).toMatchObject({ status: "ready", reason: null });
    } finally {
      if (saved === undefined) delete process.env.STANDIN_SCREENING;
      else process.env.STANDIN_SCREENING = saved;
      await t2.close();
    }
  }, 60000);
});
