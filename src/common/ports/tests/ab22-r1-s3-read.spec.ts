import { Readable } from "node:stream";
import { S3Storage } from "../adapters/s3-storage.adapter";

/** API-BASE-22 round 1 (L4): the real S3 adapter's readObject stops reading past maxBytes even when the store sends no ContentLength. */
function storeSending(chunks: Buffer[], pulled: { n: number }) {
  const s = new S3Storage({ driver: "spaces", endpoint: "http://spaces.test", region: "fra1", bucket: "wishes", accessKeyId: "k", secretAccessKey: "s" });
  const body = Readable.from(
    (function* () {
      for (const c of chunks) {
        pulled.n += c.length;
        yield c;
      }
    })(),
  );
  (body as unknown as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray = () => Promise.resolve(Buffer.concat(chunks));
  (s as unknown as { client: { send: () => Promise<unknown> } }).client = { send: () => Promise.resolve({ Body: body }) }; // no ContentLength
  return { s, body };
}

describe("API-BASE-22 round 1: S3Storage.readObject with no ContentLength", () => {
  it("L4: counts the bytes on the stream, stops once maxBytes is passed, and refuses with the same words", async () => {
    const pulled = { n: 0 };
    const { s, body } = storeSending(Array.from({ length: 1000 }, () => Buffer.alloc(1000, 1)), pulled); // 1 MB offered
    await expect(s.readObject("k", 5000)).rejects.toThrow("The stored file is larger than the 5000 bytes this read allows.");
    expect(pulled.n).toBeLessThan(20_000); // it did not read the megabyte
    expect(body.destroyed).toBe(true);
  });

  it("L4: a file within the limit is returned whole", async () => {
    const { s } = storeSending([Buffer.alloc(300, 7), Buffer.alloc(200, 8)], { n: 0 });
    expect((await s.readObject("k", 500))?.length).toBe(500);
  });
});
