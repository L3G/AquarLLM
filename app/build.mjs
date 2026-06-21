// Bundles the Electron main + standalone harness, and generates tray/app icons.
import * as esbuild from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

/* ---- minimal PNG encoder (RGBA) ---- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type, "ascii"); const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
// An iso "city" mark: a 2:1 diamond with a smaller diamond roof notch.
function icon(size, rgb, template) {
  const rgba = Buffer.alloc(size * size * 4); const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = Math.abs((x - cx) / (size * 0.46)), ny = Math.abs((y - cy) / (size * 0.30));
    const inDiamond = nx + ny <= 1;
    const roof = Math.abs((x - cx) / (size * 0.30)) + Math.abs((y - (cy - size * 0.14)) / (size * 0.16)) <= 1;
    const on = inDiamond || roof;
    const i = (y * size + x) * 4;
    if (on) { const lit = roof ? 1 : 0.82; rgba[i] = template ? 0 : Math.round(rgb[0] * lit); rgba[i + 1] = template ? 0 : Math.round(rgb[1] * lit); rgba[i + 2] = template ? 0 : Math.round(rgb[2] * lit); rgba[i + 3] = 255; }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync("assets", { recursive: true });
writeFileSync("assets/icon.png", icon(512, [217, 119, 87], false));
writeFileSync("assets/tray.png", icon(32, [0, 0, 0], true)); // macOS template (black + alpha)

const common = { bundle: true, platform: "node", format: "cjs", target: "node18", logLevel: "info" };
await esbuild.build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs", external: ["electron"] });
await esbuild.build({ ...common, entryPoints: ["src/standalone.ts"], outfile: "dist/standalone.cjs" });
console.log("bundled main.cjs + standalone.cjs, generated icons");
