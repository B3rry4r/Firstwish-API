import { crc32 } from "node:zlib";
import sharp from "sharp";

/** API-BASE-23: real pictures that carry what a phone writes: a GPS position, a camera serial, an XMP position and an embedded thumbnail. */
export const SERIAL = "SNAB23-7788-4410";
export const MAKER = "AcmeCamCo";
export const XMP_PLACE = "GPSLatitude=6.5244N;GPSLongitude=3.3792E;AB23XMP";

/** A little-endian TIFF block (what EXIF holds): Make, a serial (Exif IFD), a GPS position (6 31 27 N, 3 22 45 E), and IFD1 with a real JPEG thumbnail. */
export function exifBlock(thumb: Buffer): Buffer {
  const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const entry = (tag: number, type: number, count: number, value: Buffer) => Buffer.concat([u16(tag), u16(type), u32(count), value.length === 4 ? value : Buffer.concat([value, Buffer.alloc(4 - value.length)])]);
  const ascii = (t: string) => Buffer.from(`${t}\0`, "latin1");
  const rat = (a: number, b: number) => Buffer.concat([u32(a), u32(b)]);
  const make = ascii(MAKER); // 10 bytes, out of line
  const serial = ascii(SERIAL); // 17 bytes
  const lat = Buffer.concat([rat(6, 1), rat(31, 1), rat(27, 1)]);
  const lon = Buffer.concat([rat(3, 1), rat(22, 1), rat(45, 1)]);
  const ifd0At = 8, ifd0Len = 2 + 3 * 12 + 4;
  const makeAt = ifd0At + ifd0Len;
  const exifAt = makeAt + make.length + (make.length % 2);
  const exifLen = 2 + 12 + 4;
  const serialAt = exifAt + exifLen;
  const gpsAt = serialAt + serial.length + (serial.length % 2);
  const gpsLen = 2 + 4 * 12 + 4;
  const latAt = gpsAt + gpsLen;
  const lonAt = latAt + lat.length;
  const ifd1At = lonAt + lon.length;
  const ifd1Len = 2 + 3 * 12 + 4;
  const thumbAt = ifd1At + ifd1Len;
  const pad = (b: Buffer) => (b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b);
  return Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00]), u32(8),
    u16(3), entry(0x010f, 2, make.length, u32(makeAt)), entry(0x8769, 4, 1, u32(exifAt)), entry(0x8825, 4, 1, u32(gpsAt)), u32(ifd1At),
    pad(make),
    u16(1), entry(0xa431, 2, serial.length, u32(serialAt)), u32(0),
    pad(serial),
    u16(4), entry(0x0001, 2, 2, ascii("N")), entry(0x0002, 5, 3, u32(latAt)), entry(0x0003, 2, 2, ascii("E")), entry(0x0004, 5, 3, u32(lonAt)), u32(0),
    lat, lon,
    u16(3), entry(0x0103, 3, 1, u32(6)), entry(0x0201, 4, 1, u32(thumbAt)), entry(0x0202, 4, 1, u32(thumb.length)), u32(0),
    thumb,
  ]);
}

const segment = (marker: number, body: Buffer) => { const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2); return Buffer.concat([Buffer.from([0xff, marker]), len, body]); };

/** A real JPEG of `width` x `height` carrying EXIF (maker, serial, GPS, thumbnail) and an XMP packet with a position. */
export async function phonePhoto(width = 1800, height = 1200): Promise<Buffer> {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 31 + ((i / 3) | 0) * 7) & 0xff;
  const base = await sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  const thumb = await sharp({ create: { width: 16, height: 11, channels: 3, background: "#c8693a" } }).jpeg().toBuffer();
  const xmp = Buffer.from(`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description exif:Place="${XMP_PLACE}"/></x:xmpmeta>`, "latin1");
  return Buffer.concat([base.subarray(0, 2), segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), exifBlock(thumb)])), segment(0xe1, xmp), base.subarray(2)]);
}

/** A PNG and a WebP with the same EXIF and XMP: PNG through an eXIf chunk and an iTXt chunk, WebP through the library. */
export async function phonePng(width = 900, height = 600): Promise<Buffer> {
  const png = await sharp({ create: { width, height, channels: 3, background: "#406080" } }).png().toBuffer();
  const thumb = await sharp({ create: { width: 16, height: 11, channels: 3, background: "#c8693a" } }).jpeg().toBuffer();
  const crc = (b: Buffer) => { const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b)); return c; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "latin1"), data]); return Buffer.concat([len, td, crc(td)]); };
  const itxt = Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from(`<x:xmpmeta exif:Place="${XMP_PLACE}"/>`)]);
  // after the 8 byte signature and the IHDR chunk (25 bytes)
  return Buffer.concat([png.subarray(0, 33), chunk("eXIf", exifBlock(thumb)), chunk("iTXt", itxt), png.subarray(33)]);
}

export async function phoneWebp(width = 800, height = 500): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#807040" } }).withExif({ IFD0: { Make: MAKER, Software: SERIAL } }).webp().toBuffer();
}

/** What a picture still carries: each name is a finding. Empty is clean. */
export async function leaks(bytes: Buffer): Promise<string[]> {
  const found: string[] = [];
  const text = bytes.toString("latin1");
  for (const [name, needle] of [["serial", SERIAL], ["maker", MAKER], ["xmp place", "AB23XMP"], ["xmp", "ns.adobe.com/xap"], ["exif", "Exif\0\0"], ["xmp chunk", "XML:com.adobe.xmp"], ["exif chunk", "eXIf"]] as const) {
    if (text.includes(needle)) found.push(name);
  }
  const m = await sharp(bytes).metadata();
  if (m.exif) found.push("exif block");
  if (m.xmp) found.push("xmp block");
  if (m.iptc) found.push("iptc block");
  if (m.icc) found.push("profile");
  // a second picture inside the first (an embedded thumbnail): another start of image after the first two bytes, followed by a marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.indexOf(Buffer.from([0xff, 0xd8, 0xff]), 2) !== -1) found.push("embedded thumbnail");
  return found;
}
