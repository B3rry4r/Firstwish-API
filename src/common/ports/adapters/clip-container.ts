/**
 * The length of a video file read from its own header, with no outside tool: an MP4 or QuickTime file's `mvhd` box, a WebM file's Segment Info Duration.
 * Used by the stand-in clip length (and by the real adapter's tests); answers null when the header is not in the bytes given or says no length.
 */
export function containerLengthMs(buf: Buffer): number | null {
  return mp4LengthMs(buf) ?? webmLengthMs(buf);
}

function mp4LengthMs(buf: Buffer): number | null {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) return null;
  const mvhd = findBox(buf, moov.start, moov.end, "mvhd");
  if (!mvhd) return null;
  const d = mvhd.start; // the box body: version and flags, then the times
  if (d + 4 > buf.length) return null;
  const version = buf[d];
  let scale: number;
  let duration: number;
  if (version === 1) {
    if (d + 32 > buf.length) return null;
    scale = buf.readUInt32BE(d + 20);
    duration = Number(buf.readBigUInt64BE(d + 24));
  } else {
    if (d + 20 > buf.length) return null;
    scale = buf.readUInt32BE(d + 12);
    duration = buf.readUInt32BE(d + 16);
  }
  if (!(scale > 0) || !(duration > 0)) return null;
  return Math.round((duration * 1000) / scale);
}

function findBox(buf: Buffer, from: number, to: number, type: string): { start: number; end: number } | null {
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    let head = 8;
    if (size === 1) {
      if (at + 16 > to) return null;
      size = Number(buf.readBigUInt64BE(at + 8));
      head = 16;
    } else if (size === 0) size = to - at;
    if (size < head) return null;
    if (buf.toString("latin1", at + 4, at + 8) === type) return at + size <= buf.length ? { start: at + head, end: at + size } : null;
    at += size;
  }
  return null;
}

const EBML_HEAD = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;

function webmLengthMs(buf: Buffer): number | null {
  if (buf.length < 4 || buf.readUInt32BE(0) !== EBML_HEAD) return null;
  const state = { scale: 1_000_000, duration: null as number | null };
  walk(buf, 0, buf.length, state);
  return state.duration && state.duration > 0 ? Math.round((state.duration * state.scale) / 1_000_000) : null;
}

function vint(buf: Buffer, at: number, keepMarker: boolean): { value: number; len: number; unknown: boolean } | null {
  if (at >= buf.length) return null;
  const first = buf[at];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || at + len > buf.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = (first & (0xff >> len)) === 0xff >> len;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[at + i];
    if (buf[at + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
}

function walk(buf: Buffer, from: number, to: number, state: { scale: number; duration: number | null }): void {
  let at = from;
  while (at < to) {
    const id = vint(buf, at, true);
    if (!id) return;
    const size = vint(buf, at + id.len, false);
    if (!size) return;
    const body = at + id.len + size.len;
    const end = size.unknown ? to : Math.min(body + size.value, to);
    if (id.value === SEGMENT || id.value === INFO) walk(buf, body, end, state);
    else if (id.value === TIMECODE_SCALE && end - body <= 6) state.scale = buf.readUIntBE(body, end - body) || state.scale;
    else if (id.value === DURATION) {
      if (end - body === 4) state.duration = buf.readFloatBE(body);
      else if (end - body === 8) state.duration = buf.readDoubleBE(body);
    }
    if (size.unknown) return;
    at = end;
  }
}
