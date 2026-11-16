import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { PrismaService } from "../../../common/db/prisma.service";
import { StandinAiWriting } from "../../../common/ports/adapters/standins";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { tag } from "../../staff-accounts/tests/staff-kit";
import { parseChange } from "../../studio/studio-ai.service";

const ids = new UuidV7Maker();
let t: TestApp;
let db: PrismaService;

async function sender() {
  const id = ids.next();
  await db.account.create({ data: { id, contact: `ab5-${process.pid}-${tag()}@example.com`, handle: `ab5${tag()}`, sides: ["person"] as never, lastSide: "person" } });
  const token = `s-${tag()}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
  const wishId = ids.next();
  await db.wish.create({ data: { id: wishId, accountId: id, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos" } as never });
  return { id, wishId, h: { Authorization: `Bearer ${token}` } };
}

beforeAll(async () => {
  t = await createTestApp();
  db = t.app.get(PrismaService);
});
afterAll(() => t.close());

/** HQ3: with nothing queued the stand-in AI answers each AI route in the contract's shape, so "answered" is real on a stack. */
describe("API-BASE-5 case 1: the stand-in AI answers in the contract's shape", () => {
  it("letter, reasons and pick-photos are answered (200, done) with nothing queued", async () => {
    const s = await sender();
    const letter = await t.http().post("/v1/ai/letter").set(s.h).send({ wishId: s.wishId, transcript: "She taught me to swim." });
    expect(letter.status).toBe(200);
    expect(letter.body).toMatchObject({ kind: "letter-from-voice", status: "done" });
    expect(Array.isArray(letter.body.output.paras)).toBe(true);
    const reasons = await t.http().post("/v1/ai/reasons").set(s.h).send({ wishId: s.wishId, transcript: "Her laugh" });
    expect(reasons.status).toBe(200);
    expect(reasons.body.output.reasons[0].title).toEqual(expect.any(String));
    const photoIds = [ids.next(), ids.next(), ids.next()];
    for (const id of photoIds) await db.storedFile.create({ data: { id, ownerAccountId: s.id, purpose: "wish_photo", status: "ready", contentType: "image/jpeg", bytes: 10n, objectKey: `k/${id}`, variants: [], driver: "r2" } as never });
    await db.wish.update({ where: { id: s.wishId }, data: { content: { story: { photos: photoIds.map((photoId, i) => ({ photoId, caption: `Photo ${i}` })) } } } });
    const pick = await t.http().post("/v1/ai/pick-photos").set(s.h).send({ wishId: s.wishId, fileIds: photoIds });
    expect(pick.status).toBe(200);
    expect([...pick.body.output.fileIds].sort()).toEqual([...photoIds].sort());
  });

  it("the studio routes' answer parses as a style change", async () => {
    const out = await new StandinAiWriting().write({ system: "You help a creator edit one Firstwish Studio style: a design document.", prompt: "{}", maxTokens: 10 });
    expect(parseChange(out.text)).toEqual({ said: [expect.any(String)], ops: [] });
  });
});
