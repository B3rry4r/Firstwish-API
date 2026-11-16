import QRCode from "qrcode";

const esc = (s: string): string => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export interface CardEntry {
  url: string;
  name: string | null;
}

/**
 * The print-ready card: a vector SVG in millimetres (A6 for one wish, A5 wide for more), black on white so any printer takes it,
 * each code with a quiet zone, the wish's link in plain text under it. Made on the server; nothing is fetched.
 */
export function cardSvg(entries: CardEntry[]): string {
  const n = entries.length;
  const cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const cell = 480;
  const width = cols === 1 ? 600 : cell * 2 + 120;
  const head = 140;
  const height = head + rows * (cell + 120) + 60;
  const parts: string[] = [];
  entries.forEach((e, i) => {
    const qr = QRCode.create(e.url, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const quiet = 4;
    const scale = Math.floor((cell - 40) / (size + quiet * 2));
    const px = (size + quiet * 2) * scale;
    const cx = cols === 1 ? (width - px) / 2 : 60 + (i % cols) * (cell + 0) + (cell - px) / 2;
    const cy = head + Math.floor(i / cols) * (cell + 120);
    let d = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (qr.modules.get(x, y)) d += `M${(x + quiet) * scale} ${(y + quiet) * scale}h${scale}v${scale}h-${scale}z`;
      }
    }
    const mid = cx + px / 2;
    parts.push(
      `<g transform="translate(${cx} ${cy})"><rect width="${px}" height="${px}" fill="#fff"/><path d="${d}" fill="#000"/></g>`,
      `<text x="${mid}" y="${cy + px + 36}" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#000">${esc(e.name ?? "")}</text>`,
      `<text x="${mid}" y="${cy + px + 72}" text-anchor="middle" font-family="monospace" font-size="18" fill="#000">${esc(e.url)}</text>`,
    );
  });
  const mmW = cols === 1 ? 105 : 210;
  const mmH = Math.round((height / width) * mmW);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mmW}mm" height="${mmH}mm" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#fff"/>` +
    `<text x="${width / 2}" y="90" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="#000">Firstwish</text>` +
    parts.join("") +
    `</svg>\n`
  );
}
