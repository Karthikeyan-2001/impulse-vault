// Rasterise the Impulse Vault icon (a brass vault door on ink) to PNG at 16/32/48/128.
// Zero dependencies: signed-distance shapes, 4×4 supersampling, hand-rolled PNG encoder.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INK = [29, 27, 34];
const BRASS = [217, 171, 79];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shapes in unit space [0,1]². Returns [r,g,b,a] for a point.
function sample(x, y, size) {
  const cx = x - 0.5, cy = y - 0.5;
  const r = Math.hypot(cx, cy);
  // Rounded-square tile
  const q = 0.5 - 0.02, rad = 0.22;
  const dx = Math.max(Math.abs(cx) - (q - rad), 0), dy = Math.max(Math.abs(cy) - (q - rad), 0);
  if (Math.hypot(dx, dy) > rad) return null;
  const small = size <= 32;
  const ringOuter = small ? 0.36 : 0.35;
  const ringInner = small ? 0.24 : 0.27;
  if (!small) {
    // Eight bolts set into the ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bx = Math.cos(a) * 0.31, by = Math.sin(a) * 0.31;
      if (Math.hypot(cx - bx, cy - by) < 0.02) return INK;
    }
  }
  if (r <= ringOuter && r >= ringInner) return BRASS;
  if (!small) {
    // Three-spoke handle
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const ux = Math.cos(a), uy = Math.sin(a);
      const t = cx * ux + cy * uy;
      const perp = Math.abs(-cx * uy + cy * ux);
      if (t > 0 && t < 0.2 && perp < 0.028) return BRASS;
    }
  }
  if (r <= (small ? 0.1 : 0.075)) return BRASS;
  return INK;
}

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a); out[i + 1] = Math.round(g / a); out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(size, out);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon-${size}.png`, render(size));
}
console.log('icons written to public/icons');
