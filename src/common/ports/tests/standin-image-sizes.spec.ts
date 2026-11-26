import sharp from "sharp";
import { StandinImageSizes, StandinStorage } from "../adapters/standins";

/** P-WEB-10D H2: the stand-in's sized copy exists in storage (a size marked made must be readable), and is a smaller picture. */
describe("StandinImageSizes.resize", () => {
  const clock = { now: () => new Date("2025-06-01T09:00:00.000Z") };
  it("writes a real, narrower copy at the target key", async () => {
    const storage = new StandinStorage(clock);
    const src = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c8693a" } }).jpeg().toBuffer();
    await storage.putObject("a/b", src, "image/jpeg");
    const sizes = new StandinImageSizes(storage);
    await sizes.resize({ sourceKey: "a/b", targetKey: "a/b.w320", width: 320, contentType: "image/jpeg" });
    const out = await storage.readObject("a/b.w320", 10_000_000);
    expect(out).not.toBeNull();
    expect((await sharp(out as Buffer).metadata()).width).toBe(320);
  });
  it("copies the source as it is when it is not a picture, and does nothing with no storage", async () => {
    const storage = new StandinStorage(clock);
    await storage.putObject("c/d", Buffer.from("not a picture"), "image/jpeg");
    await new StandinImageSizes(storage).resize({ sourceKey: "c/d", targetKey: "c/d.w320", width: 320, contentType: "image/jpeg" });
    expect((await storage.readObject("c/d.w320", 1000))?.toString()).toBe("not a picture");
    await expect(new StandinImageSizes().resize({ sourceKey: "x", targetKey: "x.w320", width: 320, contentType: "image/jpeg" })).resolves.toBeUndefined();
  });
});
