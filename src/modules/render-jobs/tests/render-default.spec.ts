import { VideoRenderer, NoVideoRenderer, StandinVideoRenderer } from "../video-renderer";
import { boot } from "../../concierge/tests/kit";

describe("video job B19: the renderer the app binds", () => {
  // IK3 (API-BASE-19): this spec once said the booted test app binds the renderer that is not configured. PROVIDERS=standin now binds the
  // stand-in renderer, so a test stack reaches ready and failed; live providers still bind NoVideoRenderer (proved in ab19-ik3-ik4.spec.ts).
  it("PROVIDERS=standin binds the stand-in renderer, which makes a small marked file; the 503 with no renderer is proved with the renderer that is not configured", async () => {
    const k = await boot("b19d", new Date("2026-12-07T09:00:00.000Z"));
    const none = await boot("b19e", new Date("2026-12-07T09:00:00.000Z"), { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new NoVideoRenderer()) });
    try {
      expect(k.t.app.get(VideoRenderer)).toBeInstanceOf(StandinVideoRenderer);
      const a = await none.account();
      const w = await none.wish(a.id, { ticket: "signature" });
      const res = await none.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(503);
      expect(res.body.error.code).toBe("video_unavailable");
      expect(await none.db.renderJob.count({ where: { wishId: w } })).toBe(0);
      expect(await none.db.storedFile.count({ where: { ownerAccountId: a.id } })).toBe(0);
    } finally {
      await k.t.close();
      await none.t.close();
    }
  });
});
