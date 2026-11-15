import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { filesApp, ids, makeAccount, makeWish, stage, WEBM } from "../../stored-files/tests/files-kit";

describe("E-216 voice note (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let me: { id: string; token: string };
  let other: { id: string; token: string };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db } = await filesApp());
    me = await makeAccount(db, t);
    other = await makeAccount(db, t, ["business"]);
    t.tokens.set("staff", { kind: "staff", staffId: ids.next(), roles: ["owner"] });
  });
  afterAll(() => t.close());

  async function voice(confirm = true): Promise<{ id: string; wish: string }> {
    const wish = await makeWish(db, me.id);
    const r = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose: "Voice", contentType: "audio/WEBM", bytes: 300, seconds: 12.4, subjectId: wish });
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    await stage(t, db, id, WEBM(300), "audio/webm");
    if (confirm) expect((await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id })).status).toBe(200);
    return { id, wish };
  }

  it("answers the owner's voice note with a signed read good for 10 minutes", async () => {
    const v = await voice();
    const r = await t.http().get(`/v1/voice-notes/${v.id}`).set(auth(me.token));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ wishId: v.wish, seconds: 12, sound: "voice", audio: { fileId: v.id, contentType: "audio/webm", status: "ready" } });
    expect(r.body.data).toBe(r.body.audio.url);
    expect(r.body.data).toContain("storage.standin.invalid");
    expect(r.body.audio.expiresAt).toBe(new Date(t.clock.now().getTime() + 10 * 60 * 1000).toISOString());
  });

  it("404 for another account, an unconfirmed note, an unknown or non-uuid id; 401 without a token; 403 for staff", async () => {
    const v = await voice();
    expect((await t.http().get(`/v1/voice-notes/${v.id}`).set(auth(other.token))).status).toBe(404);
    const pending = await voice(false);
    expect((await t.http().get(`/v1/voice-notes/${pending.id}`).set(auth(me.token))).status).toBe(404);
    expect((await t.http().get(`/v1/voice-notes/${ids.next()}`).set(auth(me.token))).status).toBe(404);
    expect((await t.http().get(`/v1/voice-notes/nope`).set(auth(me.token))).status).toBe(404);
    expect((await t.http().get(`/v1/voice-notes/${v.id}`)).status).toBe(401);
    expect((await t.http().get(`/v1/voice-notes/${v.id}`).set(auth("staff"))).status).toBe(403);
  });
});
