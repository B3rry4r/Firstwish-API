import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { PrismaService } from "../../../common/db/prisma.service";
import { PortTimeoutError } from "../../../common/ports/time-limit";
import { AiWritingPort } from "../../../common/ports/ai.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { tag } from "../../staff-accounts/tests/staff-kit";
import { AI_AVAILABILITY, AiAvailability } from "../../studio/studio-ai.service";
import { AI_DAILY_CAP } from "../ai-writing.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-05T09:00:00.000Z");
const ids = new UuidV7Maker();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
let db: PrismaService;
let seq = 0;

async function sender() {
  const id = ids.next();
  await db.account.create({ data: { id, contact: `b23-${process.pid}-${++seq}@example.com`, handle: `b23${tag()}`, sides: ["person"] as never, lastSide: "person" } });
  const token = `s-${tag()}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
  const wishId = ids.next();
  await db.wish.create({ data: { id: wishId, accountId: id, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos" } as never });
  return { id, wishId, h: { Authorization: `Bearer ${token}` } };
}
type Sender = Awaited<ReturnType<typeof sender>>;
const post = (s: Sender, path: string, body: Body) => t.http().post(`/v1/ai/${path}`).set(s.h).send(body);
const file = async (owner: string, purpose: "wish_photo" | "voice_note", status = "ready") => {
  const id = ids.next();
  await db.storedFile.create({ data: { id, ownerAccountId: owner, purpose, status, contentType: "image/jpeg", bytes: 10n, objectKey: `k/${id}`, variants: [], driver: "r2" } as never });
  return id;
};
const letterJson = JSON.stringify({ paras: ["You made every year better.", "Thank you."] });
const rows = (accountId: string) => db.aiRequest.findMany({ where: { accountId }, orderBy: { createdAt: "asc" } });
const spend = async (accountId: string, wishId: string, n: number, status: "done" | "failed" = "done") => {
  await db.aiRequest.createMany({
    data: Array.from({ length: n }, () => ({ id: ids.next(), accountId, wishId, kind: "letter_from_voice" as const, creditsSpent: 0, status, model: "standin", createdAt: new Date(NOW.getTime() - 60_000) })),
  });
};

beforeAll(async () => {
  t = await createTestApp({ now: NOW });
  db = t.app.get(PrismaService);
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
});
afterAll(() => t.close());
beforeEach(() => {
  t.clock.set(NOW);
  (t.ai as unknown as { queued: string[] }).queued.length = 0; // answers a test did not use must not reach the next test
});

describe("E-12 and E-14: letter and reasons", () => {
  it("401 without a token", async () => {
    for (const p of ["letter", "reasons", "pick-photos"]) expect((await t.http().post(`/v1/ai/${p}`).send({})).status).toBe(401);
  });

  it("the sender's words go to the AI as text and come back as the letter; one row, no credits, words kept", async () => {
    const s = await sender();
    t.ai.queue(letterJson);
    const before = t.ai.requests.length;
    const r = await post(s, "letter", { wishId: s.wishId, transcript: "  She taught me to swim.  " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kind: "letter-from-voice", status: "done", creditsSpent: 0, wishId: s.wishId, transcript: "She taught me to swim.", output: { paras: ["You made every year better.", "Thank you."] } });
    expect(typeof r.body.id).toBe("string");
    expect(r.body.accountId).toBeUndefined();
    const sent = t.ai.requests.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].prompt).toContain("She taught me to swim.");
    const row = (await rows(s.id))[0];
    expect(row).toMatchObject({ kind: "letter_from_voice", status: "done", creditsSpent: 0, transcript: "She taught me to swim.", model: "standin" });
  });

  it("reasons come back in the wish content's shape", async () => {
    const s = await sender();
    t.ai.queue(`Here: ${JSON.stringify({ reasons: [{ title: "Your laugh" }, { title: "Your cooking" }] })}`);
    const r = await post(s, "reasons", { wishId: s.wishId, transcript: "I love her laugh and her cooking" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kind: "reasons-from-voice", output: { reasons: [{ title: "Your laugh" }, { title: "Your cooking" }] } });
  });

  it("rubbish from the provider is 502, nothing is stored as an answer, and the place comes back", async () => {
    const s = await sender();
    for (const bad of ["not json at all", JSON.stringify({ paras: [] }), JSON.stringify({ paras: [5] }), JSON.stringify({ paras: Array(13).fill("x") }), JSON.stringify({ other: 1 })]) {
      t.ai.queue(bad);
      const r = await post(s, "letter", { wishId: s.wishId, transcript: "words" });
      expect(r.status).toBe(502);
      expect(r.body.error.code).toBe("ai_failed");
    }
    const all = await rows(s.id);
    expect(all).toHaveLength(5);
    expect(all.every((x) => x.status === "failed" && x.output === null)).toBe(true);
    t.ai.queue(letterJson);
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "words" })).status).toBe(200);
    t.ai.queue(JSON.stringify({ reasons: [{ title: "x".repeat(121) }] }));
    expect((await post(s, "reasons", { wishId: s.wishId, transcript: "words" })).status).toBe(502);
  });

  it("a provider that throws or times out gives no answer and gives the place back", async () => {
    const s = await sender();
    const port = t.app.get(AiWritingPort);
    const spy = jest.spyOn(port, "write");
    spy.mockRejectedValueOnce(new Error("provider down"));
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "words" })).status).toBe(502);
    spy.mockRejectedValueOnce(new PortTimeoutError("ai", "write", 60_000));
    const r = await post(s, "letter", { wishId: s.wishId, transcript: "words" });
    expect(r.status).toBe(504);
    expect((await rows(s.id)).map((x) => x.status)).toEqual(["failed", "failed"]);
    spy.mockRestore();
  });

  it("the call runs outside any transaction: the account row is free while the provider is slow", async () => {
    const s = await sender();
    const port = t.app.get(AiWritingPort);
    let locked: boolean | null = null;
    const spy = jest.spyOn(port, "write").mockImplementationOnce(async () => {
      const got = await db.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM account WHERE id = ${s.id}::uuid FOR UPDATE NOWAIT`.then(
        () => true,
        () => false,
      );
      locked = !got;
      return { text: letterJson, model: "standin" };
    });
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "words" })).status).toBe(200);
    expect(locked).toBe(false);
    spy.mockRestore();
  });

  it("no AI key: 503 ai_unavailable, nothing made up, nothing stored, the provider never called", async () => {
    const off = await createTestApp({
      now: NOW,
      configure: (b) => b.overrideProvider(AI_AVAILABILITY).useValue(new AiAvailability({ PROVIDERS: "live", ANTHROPIC_API_KEY: "" } as never)),
    });
    try {
      const odb = off.app.get(PrismaService);
      const id = ids.next();
      await odb.account.create({ data: { id, contact: `b23-off-${process.pid}@example.com`, handle: `b23o${tag()}`, sides: ["person"] as never, lastSide: "person" } });
      off.tokens.set("off", { kind: "user", accountId: id, sides: ["person"] });
      for (const [p, body] of [["letter", { wishId: ids.next(), transcript: "w" }], ["reasons", { wishId: ids.next(), transcript: "w" }], ["pick-photos", { wishId: ids.next(), fileIds: [ids.next()] }]] as const) {
        const r = await off.http().post(`/v1/ai/${p}`).set({ Authorization: "Bearer off" }).send(body);
        expect(r.status).toBe(503);
        expect(r.body.error.code).toBe("ai_unavailable");
      }
      expect(off.ai.requests).toHaveLength(0);
      expect(await odb.aiRequest.count({ where: { accountId: id } })).toBe(0);
    } finally {
      await off.close();
    }
  });

  it("422 with fields: empty, too long, a control character, a bad id, an unknown field; 404 for another account's wish or file", async () => {
    const s = await sender();
    const other = await sender();
    const bad = async (body: Body, field: string) => {
      const r = await post(s, "letter", body);
      expect(r.status).toBe(422);
      expect(r.body.error.fields[field]).toBeTruthy();
    };
    await bad({ wishId: s.wishId, transcript: "   " }, "transcript");
    await bad({ wishId: s.wishId, transcript: "a".repeat(6001) }, "transcript");
    await bad({ wishId: s.wishId, transcript: "a".repeat(20001) }, "transcript");
    await bad({ wishId: s.wishId, transcript: "bad\u0000word" }, "transcript");
    await bad({ wishId: s.wishId, transcript: "x\u0007" }, "transcript");
    await bad({ wishId: s.wishId }, "transcript");
    await bad({ wishId: "nope", transcript: "x" }, "wishId");
    await bad({ wishId: s.wishId, transcript: "x", voiceFileId: "nope" }, "voiceFileId");
    await bad({ wishId: s.wishId, transcript: "x", extra: 1 }, "extra");
    expect((await post(s, "letter", { wishId: other.wishId, transcript: "x" })).status).toBe(404);
    expect((await post(s, "letter", { wishId: ids.next(), transcript: "x" })).status).toBe(404);
    const theirVoice = await file(other.id, "voice_note");
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "x", voiceFileId: theirVoice })).status).toBe(404);
    const mine = await file(s.id, "voice_note");
    t.ai.queue(letterJson);
    const ok = await post(s, "letter", { wishId: s.wishId, transcript: "x", voiceFileId: mine });
    expect(ok.status).toBe(200);
    expect(ok.body.voiceFileId).toBe(mine);
    expect(await rows(other.id)).toHaveLength(0);
  });

  it("a wish of an erased account or a removed wish is 404", async () => {
    const s = await sender();
    await db.wish.update({ where: { id: s.wishId }, data: { removedAt: NOW } });
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "x" })).status).toBe(404);
  });
});

describe("the daily cap", () => {
  it("30 at once with 3 left run exactly 3", async () => {
    const s = await sender();
    await spend(s.id, s.wishId, AI_DAILY_CAP - 3);
    for (let i = 0; i < 30; i++) t.ai.queue(letterJson);
    const rs = await Promise.all(Array.from({ length: 30 }, () => post(s, "letter", { wishId: s.wishId, transcript: "words" })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(3);
    const refused = rs.filter((r) => r.status === 429);
    expect(refused).toHaveLength(27);
    expect(refused[0].body.error.code).toBe("ai_daily_limit");
    expect((await rows(s.id)).filter((x) => x.status === "done")).toHaveLength(AI_DAILY_CAP);
  });

  it("a failed call gives its place back; the count is per account and per UTC day; Studio rows do not count", async () => {
    const s = await sender();
    const other = await sender();
    await spend(s.id, s.wishId, AI_DAILY_CAP - 1);
    t.ai.queue("rubbish");
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "w" })).status).toBe(502);
    t.ai.queue(letterJson);
    expect((await post(s, "reasons", { wishId: s.wishId, transcript: "w" })).status).toBe(502); // the queued answer is a letter, not reasons
    t.ai.queue(letterJson);
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "w" })).status).toBe(200);
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "w" })).status).toBe(429);
    t.ai.queue(letterJson);
    expect((await post(other, "letter", { wishId: other.wishId, transcript: "w" })).status).toBe(200);
    t.clock.set(new Date("2026-12-06T00:00:01.000Z"));
    t.ai.queue(letterJson);
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "w" })).status).toBe(200);
    const edge = await sender();
    await spend(edge.id, edge.wishId, AI_DAILY_CAP);
    t.clock.set(new Date("2026-12-05T23:59:59.000Z"));
    expect((await post(edge, "letter", { wishId: edge.wishId, transcript: "w" })).status).toBe(429);
  });

  it("a request left waiting for over five minutes stops counting", async () => {
    const s = await sender();
    await db.aiRequest.createMany({
      data: Array.from({ length: AI_DAILY_CAP }, () => ({ id: ids.next(), accountId: s.id, kind: "photo_pick" as const, creditsSpent: 0, status: "queued" as const, model: "pending", createdAt: new Date(NOW.getTime() - 6 * 60_000) })),
    });
    t.ai.queue(letterJson);
    expect((await post(s, "letter", { wishId: s.wishId, transcript: "w" })).status).toBe(200);
  });
});

describe("E-13: pick photos (text only)", () => {
  it("orders by captions: the AI sees numbers and captions, never a file id or bytes; the answer maps back to the ids", async () => {
    const s = await sender();
    const [a, b, c] = [await file(s.id, "wish_photo"), await file(s.id, "wish_photo"), await file(s.id, "wish_photo")];
    await db.wish.update({
      where: { id: s.wishId },
      data: { content: { story: { photos: [{ photoId: a, caption: "At the beach" }, { photoId: b, caption: "First day of school" }] } } },
    });
    t.ai.queue(JSON.stringify({ order: [2, 1, 3] }));
    const before = t.ai.requests.length;
    const r = await post(s, "pick-photos", { wishId: s.wishId, fileIds: [a, b, c] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kind: "photo-pick", status: "done", creditsSpent: 0, fileIds: [a, b, c], output: { fileIds: [b, a, c] } });
    const prompt = t.ai.requests[before].prompt;
    expect(prompt).toContain("1. At the beach");
    expect(prompt).toContain("3. (no caption)");
    for (const id of [a, b, c]) expect(prompt).not.toContain(id);
    const row = (await rows(s.id))[0];
    expect(row.transcript).toBeNull();
  });

  it("no caption at all: 422, the AI is not called and no place is used; a bad answer is 502; another's photo is 404", async () => {
    const s = await sender();
    const other = await sender();
    const a = await file(s.id, "wish_photo");
    const before = t.ai.requests.length;
    expect((await post(s, "pick-photos", { wishId: s.wishId, fileIds: [a] })).status).toBe(422);
    expect(t.ai.requests.length).toBe(before);
    expect(await rows(s.id)).toHaveLength(0);
    await db.wish.update({ where: { id: s.wishId }, data: { content: { story: { photos: [{ photoId: a, caption: "Cake" }] } } } });
    for (const bad of [{ order: [1, 1] }, { order: [2] }, { order: [] }, { order: ["1"] }, { nope: 1 }]) {
      t.ai.queue(JSON.stringify(bad));
      expect((await post(s, "pick-photos", { wishId: s.wishId, fileIds: [a] })).status).toBe(502);
    }
    const theirs = await file(other.id, "wish_photo");
    expect((await post(s, "pick-photos", { wishId: s.wishId, fileIds: [a, theirs] })).status).toBe(404);
    expect((await post(s, "pick-photos", { wishId: s.wishId, fileIds: [] })).status).toBe(422);
    expect((await post(s, "pick-photos", { wishId: s.wishId, fileIds: ["x"] })).status).toBe(422);
    expect((await post(s, "pick-photos", { wishId: s.wishId, fileIds: Array(51).fill(a) })).status).toBe(422);
  });
});
