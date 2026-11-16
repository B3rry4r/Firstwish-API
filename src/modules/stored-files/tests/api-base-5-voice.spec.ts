import { PrismaService } from "../../../common/db/prisma.service";
import { MAX_VOICE_NOTES_PER_WISH } from "../stored-files.service";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, makeAccount, makeWish } from "./files-kit";

/** API-BASE-5 case 7: a server limit on the voice notes of one wish. */
describe("API-BASE-5 voice notes per wish", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    ({ t, db } = await filesApp());
  });
  afterAll(() => t.close());

  it(`the ${MAX_VOICE_NOTES_PER_WISH + 1}th voice note asked for one wish is 409 with words; another wish and a removed note are unaffected`, async () => {
    const me = await makeAccount(db, t);
    const auth = { authorization: `Bearer ${me.token}` };
    const wish = await makeWish(db, me.id);
    const other = await makeWish(db, me.id);
    const ask = (subjectId: string) => t.http().post("/v1/uploads").set(auth).send({ purpose: "voice", contentType: "audio/webm", bytes: 5000, seconds: 8, subjectId });
    const first: string[] = [];
    for (let i = 0; i < MAX_VOICE_NOTES_PER_WISH; i++) {
      const r = await ask(wish);
      expect(r.status).toBe(201);
      first.push(r.body.id as string);
    }
    const over = await ask(wish);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("voice_notes_full");
    expect(over.body.error.message).toMatch(/at most 12 voice notes/);
    expect((await ask(other)).status).toBe(201);
    await db.storedFile.update({ where: { id: first[0] }, data: { status: "deleted" } });
    expect((await ask(wish)).status).toBe(201);
    expect((await ask(wish)).status).toBe(409);
  });
});
