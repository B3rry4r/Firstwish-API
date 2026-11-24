import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FfmpegMediaClean } from "../../../common/ports/adapters/ffmpeg-media-clean.adapter";
import { MediaCleanPort, MediaToolUnavailable } from "../../../common/ports/media-clean.port";
import { StoragePort } from "../../../common/ports/storage.port";
import { PrismaService } from "../../../common/db/prisma.service";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { ownDatabase } from "../../../../test/kit/own-db";
import { StandinClock } from "../../../common/ports/clock.port";
import { ProviderStatus } from "../../staff-reads/provider-status";
import { FileJobs } from "../file-jobs";
import { RULES } from "../file-rules";
import { isCleanableMedia } from "../../../common/ports/adapters/ffmpeg-media-clean.adapter";
import { SignedUrlsService } from "../signed-urls.service";
import { ensureEntitlements, ids, makeAccount, makeBusiness, makeWish, stage } from "./files-kit";
import { MAKER, phonePhoto, SERIAL } from "./ab23-pictures";

/**
 * API-BASE-23B case C (IM3): a voice, a clip and a video lose their location and device tags at confirm. REAL files made with ffmpeg here (an m4a and an mp4
 * with a location tag and a device make and model; a second m4a with a cover picture whose own EXIF holds a position), the REAL ffmpeg adapter behind the port.
 * (What stays, by nature: the encoder's own signature inside the compressed audio data, which holds no place and no device of the person's.)
 */
holdSettingLockForFile();
const NOW = new Date("2026-11-24T09:00:00.000Z");
const COORD = "+06.5244+003.3792/";
const DEVICE = ["iPhone 14 Pro", "Apple"];
const dir = mkdtempSync(join(tmpdir(), "ab23b-media-"));

const ff = (args: string[]): void => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
const TAGS = ["-metadata", `location=${COORD}`, "-metadata", `location-eng=${COORD}`, "-metadata", "com.apple.quicktime.make=Apple", "-metadata", "com.apple.quicktime.model=iPhone 14 Pro", "-metadata", "com.apple.quicktime.software=17.1", "-movflags", "use_metadata_tags"];

/** ffprobe -show_format -show_streams of some bytes, as text. */
function probe(bytes: Buffer): string {
  const f = join(dir, `probe-${createHash("sha1").update(bytes).digest("hex")}.bin`);
  writeFileSync(f, bytes);
  const r = spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", f], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe: ${r.stderr}`);
  return r.stdout;
}
/** What of the location and the device is still in some bytes: tags that ffprobe shows, and the coordinates, make, model, serial and picture position as bytes. */
function leftOver(bytes: Buffer): string[] {
  const shown = probe(bytes);
  const out: string[] = [];
  for (const re of [/TAG:location/i, /TAG:com\.apple/i, /TAG:encoder/i, /Apple Sound Media Handler/, /Core Media Video/, /iPhone/, /TAG:title/i]) if (re.test(shown)) out.push(`ffprobe shows ${re}`);
  for (const needle of ["6.5244", "3.3792", ...DEVICE, "Lavf", SERIAL, MAKER, "Exif\0\0"]) if (bytes.includes(Buffer.from(needle, "latin1"))) out.push(`bytes hold ${JSON.stringify(needle)}`);
  return out;
}
const streamsOf = (bytes: Buffer): string[] => [...probe(bytes).matchAll(/codec_type=(\w+)/g)].map((m) => m[1]);

let m4a: Buffer;
let m4aCover: Buffer;
let mp4: Buffer;

describe("API-BASE-23B C (IM3): voices, clips and videos lose their location and device tags", () => {
  let t: TestApp;
  let db: PrismaService;
  let signed: SignedUrlsService;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const own = ownDatabase("ab23m");

  beforeAll(async () => {
    const cover = join(dir, "cover.jpg");
    writeFileSync(cover, await phonePhoto(400, 300));
    ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", ...TAGS, "-metadata:s:a:0", "handler_name=Apple Sound Media Handler", "-f", "ipod", join(dir, "a.m4a")]);
    // the cover picture is kept by the iTunes-style atoms (no mdta keys), with the location the same way
    ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-i", cover, "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-c:v", "copy", "-disposition:v:0", "attached_pic", "-metadata", `location=${COORD}`, "-f", "ipod", join(dir, "c.m4a")]);
    ff(["-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", ...TAGS, "-metadata:s:v:0", "handler_name=Core Media Video", "-f", "mp4", join(dir, "v.mp4")]);
    m4a = readFileSync(join(dir, "a.m4a"));
    m4aCover = readFileSync(join(dir, "c.m4a"));
    mp4 = readFileSync(join(dir, "v.mp4"));
    own.use();
    t = await createTestApp({ now: NOW, configure: (b) => b.overrideProvider(MediaCleanPort).useFactory({ factory: (s: StoragePort) => new FfmpegMediaClean(s), inject: [StoragePort] }) });
    const seeded = spawnSync(process.execPath, [join(__dirname, "../../../../scripts/seed.mjs")], { cwd: join(__dirname, "../../../.."), env: process.env, encoding: "utf8" });
    if (seeded.status !== 0) throw new Error(`seed failed: ${seeded.stderr}`);
    db = t.app.get(PrismaService);
    await ensureEntitlements(db);
    signed = t.app.get(SignedUrlsService);
  });
  afterAll(async () => {
    await t.close();
    own.drop();
    rmSync(dir, { recursive: true, force: true });
  });

  const bytesOf = async (key: string): Promise<Buffer> => (await t.storage.readObject(key, 50 * 1024 * 1024)) as Buffer;

  async function upload(me: { token: string }, bytes: Buffer, type: string, purpose: string, subjectId?: string) {
    const ticket = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose, contentType: type, bytes: bytes.length, ...(subjectId ? { subjectId } : {}) });
    expect(ticket.status).toBe(201);
    const id = ticket.body.id as string;
    await stage(t, db, id, bytes, type);
    const res = await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id });
    return { id, res };
  }

  /** The file as stored now is clean, still plays with the streams it had, and is the one hashed and counted. */
  async function expectCleanAndKept(id: string, streams: string[]) {
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    const stored = await bytesOf(row.objectKey);
    expect(leftOver(stored)).toEqual([]);
    expect(streamsOf(stored)).toEqual(streams);
    expect(row.cleanAt).not.toBeNull();
    expect(Number(row.bytes)).toBe(stored.length);
    expect(row.sha256).toBe(createHash("sha256").update(stored).digest("hex"));
    return { row, stored };
  }

  it("0. the files used here really carry a location, a device make and model, and (a second m4a) a cover picture with its own position: what the head kept untouched", () => {
    for (const f of [m4a, mp4]) {
      const shown = probe(f);
      expect(shown).toMatch(/TAG:location=\+06\.5244\+003\.3792/);
      expect(shown).toMatch(/TAG:com\.apple\.quicktime\.make=Apple/);
      expect(shown).toMatch(/TAG:com\.apple\.quicktime\.model=iPhone 14 Pro/);
      expect(f.includes(Buffer.from("6.5244"))).toBe(true);
    }
    expect(streamsOf(m4aCover)).toEqual(["audio", "video"]); // the cover picture
    expect(m4aCover.includes(Buffer.from(SERIAL)) && m4aCover.includes(Buffer.from("Exif\0\0")) && m4aCover.includes(Buffer.from("6.5244"))).toBe(true);
    expect(leftOver(mp4).length).toBeGreaterThan(0);
  });

  it("1. a voice (m4a): at confirm it is rewritten with no tags and no cover picture, the same audio; the clean file replaced the upload and is the one hashed and counted", async () => {
    const me = await makeAccount(db, t);
    const wish = await makeWish(db, me.id, "draft", "keepsake");
    const { id, res } = await upload(me, m4a, "audio/mp4", "voice", wish);
    expect(res.status).toBe(200);
    const { stored } = await expectCleanAndKept(id, ["audio"]);
    expect(probe(stored)).toMatch(/codec_name=aac/);
    expect(Number(probe(stored).match(/duration=([\d.]+)/)?.[1])).toBeGreaterThan(0.9);
    expect(stored.length).toBeLessThan(m4a.length); // the tags are gone: nothing untouched is kept
    // the staging copy is gone and no untouched original is anywhere in storage
    expect(await t.storage.head(`incoming/${(await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey}`)).toBeNull();
    // every reader of the signing place is given the clean bytes
    for (const reader of [{ type: "owner", accountId: me.id }, { type: "allowed" }, { type: "staff" }] as const) {
      const url = (await signed.signedRead({ fileId: id }, reader)).url;
      const key = decodeURI(new URL(url).pathname).slice(1).replace(/^[^/]+\//, "");
      expect(leftOver(await bytesOf(key))).toEqual([]);
    }
  });

  it("1. a voice with a cover picture: the cover (a picture with its own position and serial) is not carried", async () => {
    const me = await makeAccount(db, t);
    const wish = await makeWish(db, me.id, "draft", "keepsake");
    const { id, res } = await upload(me, m4aCover, "audio/mp4", "voice", wish);
    expect(res.status).toBe(200);
    await expectCleanAndKept(id, ["audio"]);
  });

  it("1. a video in a Vault (mp4) is rewritten the same way; the Vault counts the clean file", async () => {
    const biz = await makeAccount(db, t, ["business"]);
    const bizId = await makeBusiness(db, biz.id, { plan: "studio" });
    const { id, res } = await upload(biz, mp4, "video/mp4", "vault");
    expect(res.status).toBe(200);
    const { stored } = await expectCleanAndKept(id, ["video", "audio"]);
    expect(probe(stored)).toMatch(/codec_name=h264/);
    expect((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault).toBe(BigInt(stored.length));
  });

  it("1. a clip (mp4) is rewritten, and its length is read from the clean file", async () => {
    const me = await makeAccount(db, t);
    const wish = await makeWish(db, me.id, "draft", "premiere");
    const { id, res } = await upload(me, mp4, "video/mp4", "clip", wish);
    expect(res.status).toBe(200);
    const { row } = await expectCleanAndKept(id, ["video", "audio"]);
    expect(row.lengthMs).toBeGreaterThan(900);
    expect(row.lengthMs).toBeLessThan(1200);
  });

  it("1. every audio and video kind any upload rule takes (voices, order voices, clips, Vault videos, Studio sounds) is one the cleaner rewrites", () => {
    const kinds = new Set(Object.values(RULES).flatMap((r) => r.types).filter((x) => x.startsWith("audio/") || x.startsWith("video/")));
    expect(kinds.size).toBeGreaterThanOrEqual(9);
    for (const k of kinds) expect(isCleanableMedia(k)).toBe(true);
    expect(RULES["studio-sound"].types.every(isCleanableMedia)).toBe(true);
  });

  it("2. a file ffmpeg cannot rewrite is refused in words and nothing of it is kept", async () => {
    const me = await makeAccount(db, t);
    const wish = await makeWish(db, me.id, "draft", "keepsake");
    // it says MP4 in its first bytes and is the start of a real one, cut off before its streams end
    const broken = Buffer.concat([mp4.subarray(0, 40), Buffer.alloc(300, 7)]);
    const { id, res } = await upload(me, broken, "audio/mp4", "voice", wish);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("We could not rewrite this file to remove where and how it was recorded. Send a different recording (an MP3, M4A, MP4 or WebM that plays).");
    expect(await db.storedFile.findUnique({ where: { id } })).toBeNull();
  });

  it("3. a file stored before this is cleaned the first time it is asked for, or by the cleanup job; until clean it is given to no one but its owner", async () => {
    const me = await makeAccount(db, t);
    const legacy = async () => {
      const id = ids.next();
      const objectKey = `voice-note/${id}/legacy`;
      t.storage.put(objectKey, m4a, "audio/mp4");
      await db.storedFile.create({ data: { id, ownerAccountId: me.id, purpose: "voice_note", status: "ready", contentType: "audio/mp4", bytes: BigInt(m4a.length), objectKey, variants: [], driver: "r2" } as never });
      return { id, objectKey };
    };
    // the tool is down: a receiver is given nothing, the owner still reads their own file, and the bytes are untouched
    const down = new FfmpegMediaClean(t.storage, () => Promise.reject(Object.assign(new Error("x"), { code: "ENOENT" })));
    const a = await legacy();
    const cleaner = t.app.get(MediaCleanPort);
    const real = cleaner.clean.bind(cleaner);
    cleaner.clean = (i) => down.clean(i);
    try {
      await expect(signed.signedRead({ fileId: a.id }, { type: "allowed" })).rejects.toMatchObject({ code: "photo_not_shown", message: "This recording is not ready to be shown. Send it again." });
      expect((await signed.signedRead({ fileId: a.id }, { type: "owner", accountId: me.id })).url).toBeTruthy();
      expect((await db.storedFile.findUniqueOrThrow({ where: { id: a.id } })).cleanAt).toBeNull();
    } finally {
      cleaner.clean = real;
    }
    // the tool is back: the first ask cleans it, and the receiver is given the clean bytes
    const url = (await signed.signedRead({ fileId: a.id }, { type: "allowed" })).url;
    expect(url).toBeTruthy();
    await expectCleanAndKept(a.id, ["audio"]);
    // the job cleans one that no one asked for
    const b = await legacy();
    await t.app.get(FileJobs).cleanupUnconfirmed(100);
    await expectCleanAndKept(b.id, ["audio"]);
  });

  it("4. ffmpeg missing on the server: an upload of these kinds is refused in words (503) and nothing unclean is kept; the staff Providers read says so", async () => {
    const me = await makeAccount(db, t);
    const wish = await makeWish(db, me.id, "draft", "keepsake");
    const cleaner = t.app.get(MediaCleanPort);
    const real = cleaner.clean.bind(cleaner);
    cleaner.clean = () => Promise.reject(new MediaToolUnavailable("ffmpeg did not run"));
    try {
      const { id, res } = await upload(me, m4a, "audio/mp4", "voice", wish);
      expect(res.status).toBe(503);
      expect(res.body.error.message).toBe("Voices, clips and videos cannot be taken right now. Nothing was kept. Try again later.");
      expect(await db.storedFile.findUnique({ where: { id } })).toBeNull();
    } finally {
      cleaner.clean = real;
    }
    // the Providers read: the real adapter with no ffmpeg says which tool is missing; with both it says connected
    const ok = { ping: () => Promise.resolve({ state: "ok" as const }) };
    const status = (media: MediaCleanPort) => new ProviderStatus({ PROVIDERS: "live" } as never, new StandinClock(new Date("2040-01-01T00:00:00Z")), ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, ok as never, media);
    const missing = new FfmpegMediaClean(t.storage, (file) => Promise.reject(Object.assign(new Error("x"), { code: "ENOENT", file })), "ffmpeg-absent");
    expect(await status(missing).state("storage")).toEqual({ connected: false, line: expect.stringContaining("ffmpeg-absent is not installed on the server") });
    expect(await status(new FfmpegMediaClean(t.storage)).state("storage")).toEqual({ connected: true, line: "The provider answered a check just now." });
  });
});
