import sharp from "sharp";
import { SharpImageSizes } from "../../../common/ports/adapters/sharp-image-sizes.adapter";
import { ImageSizesPort } from "../../../common/ports/image-sizes.port";
import { StoragePort } from "../../../common/ports/storage.port";
import { uniqueAddress } from "../../../../test/kit/app";
import { testWishNo } from "../../../../test/kit/unique";
import { boot, routeStorage } from "../../concierge/tests/kit";
import { RenderJobsService } from "../render-jobs.service";
import { StandinVideoRenderer, VideoRenderer } from "../video-renderer";
import { leaks, phonePhoto } from "../../stored-files/tests/ab23-pictures";
import { stage } from "../../stored-files/tests/files-kit";
import { ids } from "../../concierge/tests/kit";
import { JobsService } from "../../jobs/jobs.service";
import { JobHandlers } from "../../job-handlers/job-handlers.service";

/** API-BASE-23 (IM1, case 3): the render read gives the clean copy and the three sizes of a photo; the player's picture holds no position. */
const NOW = new Date("2027-07-07T09:00:00.000Z");
type Size = { width: number; sized: boolean; url: string };

describe("API-BASE-23: the render read's photos", () => {
  it("holds no GPS, no serial, no XMP and no thumbnail, and carries w320, w768, w1600", async () => {
    const renderer = new StandinVideoRenderer();
    const k = await boot("ab23r", NOW, {
      configure: (b) => b.overrideProvider(VideoRenderer).useValue(renderer).overrideProvider(ImageSizesPort).useFactory({ factory: (s: StoragePort) => new SharpImageSizes(s), inject: [StoragePort] }),
    });
    const route = routeStorage(k.t);
    let release: () => void = () => undefined;
    try {
      k.t.app.get(JobHandlers).registerAll();
      const a = await k.account();
      const w = await k.wish(a.id, { ticket: "keepsake", no: testWishNo(), name: "Ada", adds: ["extra.portrait-video"] });
      const bytes = await phonePhoto(2000, 1300);
      const ticket = await k.t.http().post("/v1/uploads").set("Authorization", a.auth).send({ purpose: "photo", contentType: "image/jpeg", bytes: bytes.length });
      const fileId = ticket.body.id as string;
      await stage(k.t, k.db, fileId, bytes, "image/jpeg");
      await k.t.http().post(`/v1/uploads/${fileId}/confirm`).set("Authorization", a.auth).send({ fileId }).expect(200);
      await k.db.wishFile.create({ data: { id: ids.next(), wishId: w, fileId, role: "photo" } as never });
      renderer.hold = new Promise<void>((r) => (release = r));
      const job = (await k.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(200)).body.item as { id: string };
      const done = k.t.app.get(RenderJobsService).run(job.id);
      for (let i = 0; i < 200 && !renderer.rendered.length; i++) await new Promise((r) => setTimeout(r, 25));
      const token = renderer.rendered[0]?.token as string;
      expect(token).toBeTruthy();
      const keyOf = (url: string) => { const p = decodeURI(new URL(url).pathname); return p.slice(p.indexOf("/", 1) + 1); };
      const read = async () => (await k.t.http().get(`/v1/render/${token}/wish`).set("X-Forwarded-For", uniqueAddress()).expect(200)).body.wish.files[0] as { url: string; variants: Size[] };
      expect(await k.t.app.get(JobsService).runDue(100, [fileId])).toBe(1);
      const after = await read();
      expect(after.variants.map((v) => [v.width, v.sized])).toEqual([[320, true], [768, true], [1600, true]]);
      for (const v of after.variants) {
        const sized = (await k.t.storage.readObject(keyOf(v.url), 50e6)) as Buffer;
        expect((await sharp(sized).metadata()).width).toBe(v.width);
        expect(await leaks(sized)).toEqual([]);
      }
      release();
      await done;
    } finally {
      release();
      renderer.hold = null;
      route.restore();
      await k.t.close();
    }
  });
});
