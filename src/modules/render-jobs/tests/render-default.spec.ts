import { VideoRenderer, NoVideoRenderer } from "../video-renderer";
import { boot } from "../../concierge/tests/kit";

describe("video job B19: the app as it boots, with no renderer", () => {
  it("binds the renderer that is not configured, so the ask is 503 video_unavailable and nothing is made up", async () => {
    const k = await boot("b19d", new Date("2026-12-07T09:00:00.000Z"));
    try {
      expect(k.t.app.get(VideoRenderer)).toBeInstanceOf(NoVideoRenderer);
      const a = await k.account();
      const w = await k.wish(a.id, { ticket: "signature" });
      const res = await k.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(503);
      expect(res.body.error.code).toBe("video_unavailable");
      expect(await k.db.renderJob.count({ where: { wishId: w } })).toBe(0);
      expect(await k.db.storedFile.count({ where: { ownerAccountId: a.id } })).toBe(0);
    } finally {
      await k.t.close();
    }
  });
});
