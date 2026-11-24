import { crc32 } from "node:zlib";
import sharp from "sharp";
import { ProviderStatus } from "../../../modules/staff-reads/provider-status";
import { PING_OK, pingError } from "../ping";
import { StandinClock } from "../clock.port";
import { StandinStorage } from "../adapters/standins";
import { MAX_SOURCE_BYTES, SharpImageSizes } from "../adapters/sharp-image-sizes.adapter";

/** API-BASE-22: the real image-sizing adapter, over the stand-in storage (nothing leaves the process). */
const storage = new StandinStorage(new StandinClock(new Date("2040-01-01T00:00:00Z")));
const sizes = new SharpImageSizes(storage);

const flat = (w: number, h: number, c = "#c8693a") => sharp({ create: { width: w, height: h, channels: 3, background: c } });
const widthOf = async (key: string) => {
  const o = await storage.readObject(key, 50 * 1024 * 1024);
  return { meta: await sharp(o as Buffer).metadata(), bytes: o as Buffer };
};
async function put(key: string, bytes: Buffer, type: string) {
  await storage.putObject(key, bytes, type);
}
const ask = (type: string, key: string, width: number) => sizes.resize({ sourceKey: key, targetKey: `${key}.w${width}`, width, contentType: type });

describe("API-BASE-22: SharpImageSizes", () => {
  it("makes the asked width through the storage port, keeps the aspect, never enlarges, and keeps the type", async () => {
    await put("a/jpeg", await flat(1200, 800).jpeg().toBuffer(), "image/jpeg");
    await ask("image/jpeg", "a/jpeg", 320);
    const small = await widthOf("a/jpeg.w320");
    expect([small.meta.width, small.meta.height, small.meta.format]).toEqual([320, 213, "jpeg"]);
    expect((await storage.head("a/jpeg.w320"))?.contentType).toBe("image/jpeg");
    // a picture narrower than the width is copied at its own width, never made bigger
    await ask("image/jpeg", "a/jpeg", 1600);
    expect((await widthOf("a/jpeg.w1600")).meta.width).toBe(1200);
    // the original is untouched
    expect((await widthOf("a/jpeg")).meta.width).toBe(1200);
  });

  it("PNG and WebP keep their type and their transparency", async () => {
    const clear = sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 200, g: 105, b: 58, alpha: 0.5 } } });
    await put("a/png", await clear.clone().png().toBuffer(), "image/png");
    await put("a/webp", await clear.clone().webp().toBuffer(), "image/webp");
    await ask("image/png", "a/png", 320);
    await ask("image/webp", "a/webp", 320);
    const png = await widthOf("a/png.w320");
    const webp = await widthOf("a/webp.w320");
    expect([png.meta.format, png.meta.width, png.meta.hasAlpha]).toEqual(["png", 320, true]);
    expect([webp.meta.format, webp.meta.width, webp.meta.hasAlpha]).toEqual(["webp", 320, true]);
    expect((await storage.head("a/webp.w320"))?.contentType).toBe("image/webp");
  });

  it("turns the picture by its EXIF orientation, and the sized copy carries no metadata (no GPS, no camera serial); the original keeps both", async () => {
    // a 600 x 300 picture marked "turn 90 degrees clockwise to view" (orientation 6), with a position, a camera make and a serial
    const original = await flat(600, 300)
      .withExif({
        IFD0: { Make: "CamMaker", Model: "CamModel-X", Orientation: "6" },
        IFD2: { BodySerialNumber: "SERIAL-9F3A21" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 27/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "3/1 23/1 0/1" },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const kept = await sharp(original).metadata();
    expect(kept.orientation).toBe(6);
    expect(original.includes(Buffer.from("SERIAL-9F3A21"))).toBe(true);
    expect(original.includes(Buffer.from("CamMaker"))).toBe(true);
    expect(original.includes(Buffer.from("GPS"))).toBe(false); // the GPS block has no word in it; its tags are what matter, read below
    expect(kept.exif).toBeDefined();
    await put("b/photo", original, "image/jpeg");
    await ask("image/jpeg", "b/photo", 200);
    const out = await widthOf("b/photo.w200");
    // turned: the 600 x 300 picture is shown 300 wide and 600 tall, so 200 wide is 400 tall
    expect([out.meta.width, out.meta.height]).toEqual([200, 400]);
    expect(out.meta.orientation).toBeUndefined();
    expect(out.meta.exif).toBeUndefined();
    expect(out.meta.xmp).toBeUndefined();
    expect(out.meta.iptc).toBeUndefined();
    for (const word of ["SERIAL-9F3A21", "CamMaker", "CamModel-X", "Exif"]) expect(out.bytes.includes(Buffer.from(word))).toBe(false);
    // the original still has every one of them (a finding for the lead: originals keep their GPS)
    const orig = await storage.readObject("b/photo", MAX_SOURCE_BYTES);
    expect((await sharp(orig as Buffer).metadata()).exif).toBeDefined();
  });

  it("an animated GIF and an animated WebP are sized from their first frame, as a still picture", async () => {
    const frames = Buffer.concat([0, 1, 2].map((i) => Buffer.alloc(400 * 300 * 3, i * 80)));
    const gif = await sharp(frames, { raw: { width: 400, height: 300 * 3, channels: 3, pageHeight: 300 } }).gif({ loop: 0, delay: [100, 100, 100] }).toBuffer();
    const webp = await sharp(frames, { raw: { width: 400, height: 300 * 3, channels: 3, pageHeight: 300 } }).webp({ loop: 0, delay: [100, 100, 100] }).toBuffer();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(3);
    await put("c/gif", gif, "image/gif");
    await put("c/webp", webp, "image/webp");
    await ask("image/gif", "c/gif", 200);
    await ask("image/webp", "c/webp", 200);
    const g = await widthOf("c/gif.w200");
    const w = await widthOf("c/webp.w200");
    expect([g.meta.format, g.meta.width, g.meta.height, g.meta.pages ?? 1]).toEqual(["png", 200, 150, 1]);
    expect([w.meta.format, w.meta.width, w.meta.height, w.meta.pages ?? 1]).toEqual(["webp", 200, 150, 1]);
    expect((await storage.head("c/gif.w200"))?.contentType).toBe("image/png");
  });

  it("HEIC: this build of sharp cannot decode it, so it fails with words (no path, no library text) and writes nothing", async () => {
    expect(sharp.format.heif.input.fileSuffix).not.toContain(".heic");
    const head = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(200, 1)]);
    await put("d/heic", head, "image/heic");
    await expect(ask("image/heic", "d/heic", 320)).rejects.toThrow("This server cannot read HEIC pictures, so no smaller sizes were made. The original is kept.");
    expect(await storage.head("d/heic.w320")).toBeNull();
  });

  it("a broken file, a file of another type than it says, and a missing file are refused with words and write nothing", async () => {
    const good = await flat(100, 100).jpeg().toBuffer();
    await put("e/cut", good.subarray(0, 300), "image/jpeg");
    await put("e/junk", Buffer.from("this is not a picture at all"), "image/png");
    await expect(ask("image/jpeg", "e/cut", 50)).rejects.toThrow("This picture could not be read, so no smaller sizes were made. The original is kept.");
    await expect(ask("image/png", "e/junk", 50)).rejects.toThrow("could not be read");
    await expect(ask("image/jpeg", "e/none", 50)).rejects.toThrow("not in storage");
    await expect(ask("audio/mpeg", "e/junk", 50)).rejects.toThrow("cannot be sized");
    await expect(sizes.resize({ sourceKey: "e/junk", targetKey: "e/x", width: 0, contentType: "image/png" })).rejects.toThrow("width");
    for (const k of ["e/cut.w50", "e/junk.w50", "e/none.w50", "e/x"]) expect(await storage.head(k)).toBeNull();
  });

  it("a decompression bomb (a header that says more pixels than the limit) is refused before it is decoded", async () => {
    // a PNG whose header says 40000 x 40000 (1.6 gigapixels) and whose data would fill gigabytes: a few dozen bytes to store
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(40_000, 0);
    ihdr.writeUInt32BE(40_000, 4);
    ihdr.set([8, 0, 0, 0, 0], 8); // 8 bit grey, no interlace
    const bomb = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])), chunk("IEND", Buffer.alloc(0))]);
    await put("f/bomb", bomb, "image/png");
    const before = process.memoryUsage().rss;
    await expect(ask("image/png", "f/bomb", 320)).rejects.toThrow("This picture has too many pixels to size here, so it was not sized.");
    expect(process.memoryUsage().rss - before).toBeLessThan(200 * 1024 * 1024);
    expect(await storage.head("f/bomb.w320")).toBeNull();
  }, 60_000);

  it("a source over the byte limit is not read at all", async () => {
    await put("g/big", Buffer.alloc(2048, 1), "image/jpeg");
    await expect(storage.readObject("g/big", 1024)).rejects.toThrow("larger than");
    expect(MAX_SOURCE_BYTES).toBe(100 * 1024 * 1024);
  });

  it("ping runs the decoder for real and says ok", async () => {
    expect(await sizes.ping()).toEqual({ state: "ok" });
  });

  it("the staff Providers read: Storage reads connected with sizing set up, and names image sizing when it cannot run", async () => {
    const ok = { ping: () => Promise.resolve(PING_OK) };
    const status = (imageSizes: { ping: () => Promise<unknown> }) =>
      new ProviderStatus({ PROVIDERS: "live" } as never, new StandinClock(new Date("2040-01-01T00:00:00Z")), ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, imageSizes as never);
    expect(await status(sizes).state("storage")).toEqual({ connected: true, line: "The provider answered a check just now." });
    const broken = await status({ ping: () => Promise.resolve(pingError(new Error("Could not load the sharp module"))) }).state("storage");
    expect(broken.connected).toBe(false);
    expect(broken.line).toContain("Image sizing: Could not load the sharp module");
  });
});
