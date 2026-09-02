/**
 * Placeholder icon generator (E4) — dependency-free PNG writer (Node zlib).
 * Draws an on-brand mark: dark-purple ground (#070014) with a lime (#dcff00)
 * rounded "brick" tile that has a dark inset, echoing the glass-card + lime-
 * border brand. PLACEHOLDER ONLY — replace with the Gil & Bricks logo before
 * store submission (see DECISIONS_LOG).
 *
 * Usage: node packages/extension/tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
mkdirSync(OUT, { recursive: true });

const BG = [0x07, 0x00, 0x14, 0xff];   // #070014
const LIME = [0xdc, 0xff, 0x00, 0xff]; // #dcff00

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const inset = Math.round(size * 0.16);   // ground margin
  const r = Math.round(size * 0.16);        // corner radius
  const border = Math.max(1, Math.round(size * 0.12)); // lime frame thickness
  const x0 = inset, y0 = inset, x1 = size - inset, y1 = size - inset;
  const inCorner = (x, y) => {
    // rounded-rect test for the outer lime tile
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let col = BG;
      const inTile = x >= x0 && x < x1 && y >= y0 && y < y1 && inCorner(x, y);
      if (inTile) {
        const inHole = x >= x0 + border && x < x1 - border && y >= y0 + border && y < y1 - border;
        // leave a solid lime block in the lower-left quadrant (a "brick" cue)
        const inBlock = x < (x0 + x1) / 2 && y > (y0 + y1) / 2;
        col = inHole && !inBlock ? BG : LIME;
      }
      raw[p++] = col[0]; raw[p++] = col[1]; raw[p++] = col[2]; raw[p++] = col[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [16, 48, 128]) {
  writeFileSync(join(OUT, `${size}.png`), png(size));
  console.log(`wrote icon/${size}.png`);
}
