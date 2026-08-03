#!/usr/bin/env node
/**
 * tools/gen-icons.js — generates the PWA icon set.
 *
 * Draws the icons pixel-by-pixel and encodes them as PNG using the
 * built-in zlib, so the repository needs no image binaries checked in and
 * no image-processing dependency. Run once (or after a brand change):
 *
 *     node tools/gen-icons.js
 *
 * Output: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAVY = [10, 15, 29];
const NAVY_HI = [27, 39, 64];
const TEAL = [72, 229, 194];
const TEAL_DIM = [23, 169, 138];

/** Minimal truecolour-with-alpha PNG encoder. */
function encodePNG(width, height, rgba) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter type 0 (None)
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }

    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body) >>> 0);
        return Buffer.concat([len, body, crc]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type: RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return c ^ -1;
}

/**
 * Draws the PharmSim mark: a navy rounded tile with a teal mortar-and-pestle
 * silhouette crossed by an ECG trace.
 *
 * `inset` shrinks the artwork so maskable icons survive the safe-zone crop
 * that Android applies (up to 20% on each edge).
 */
function drawIcon(size, { maskable = false } = {}) {
    const px = Buffer.alloc(size * size * 4);
    const S = size;
    const inset = maskable ? S * 0.14 : 0;
    const radius = maskable ? S * 0.5 : S * 0.22;
    const cx = S / 2, cy = S / 2;

    const set = (x, y, [r, g, b], a = 255) => {
        if (x < 0 || y < 0 || x >= S || y >= S) return;
        const i = (y * S + x) * 4;
        const src = a / 255;
        px[i]     = Math.round(px[i]     * (1 - src) + r * src);
        px[i + 1] = Math.round(px[i + 1] * (1 - src) + g * src);
        px[i + 2] = Math.round(px[i + 2] * (1 - src) + b * src);
        px[i + 3] = Math.max(px[i + 3], a);
    };

    // ── Tile background: rounded rect (or full bleed for maskable) ──
    const pad = inset;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const inRounded = (() => {
                const l = pad, t = pad, r = S - pad, b = S - pad;
                if (x < l || y < t || x >= r || y >= b) return false;
                const rr = Math.min(radius, (r - l) / 2);
                const dx = Math.max(l + rr - x, 0, x - (r - rr));
                const dy = Math.max(t + rr - y, 0, y - (b - rr));
                return dx * dx + dy * dy <= rr * rr;
            })();
            if (!inRounded) continue;
            // Subtle top-light vertical gradient.
            const k = y / S;
            set(x, y, [
                Math.round(NAVY_HI[0] * (1 - k) + NAVY[0] * k),
                Math.round(NAVY_HI[1] * (1 - k) + NAVY[1] * k),
                Math.round(NAVY_HI[2] * (1 - k) + NAVY[2] * k),
            ]);
        }
    }

    const u = S / 100; // design-unit: artwork authored on a 100x100 grid

    // ── Mortar bowl ──
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = (x - cx) / (26 * u);
            const dy = (y - (cy + 12 * u)) / (20 * u);
            const d = dx * dx + dy * dy;
            if (d <= 1 && y >= cy + 8 * u) {
                set(x, y, d > 0.62 ? TEAL : TEAL_DIM);
            }
        }
    }
    // Mortar rim — a rounded bar capping the bowl
    for (let x = 0; x < S; x++) {
        const dx = Math.abs(x - cx) / (30 * u);
        if (dx > 1) continue;
        const half = 2.6 * u * Math.min(1, Math.sqrt(1 - Math.pow(Math.max(0, dx - 0.86) / 0.14, 2)) || 1);
        for (let t = -half; t <= half; t++) set(x, Math.round(cy + 8 * u + t), TEAL);
    }

    // ── Pestle: a diagonal bar leaning into the bowl ──
    for (let t = 0; t <= 100; t++) {
        const x0 = cx + 16 * u, y0 = cy - 26 * u;
        const x1 = cx - 4 * u,  y1 = cy + 6 * u;
        const x = x0 + (x1 - x0) * (t / 100);
        const y = y0 + (y1 - y0) * (t / 100);
        const w = 3.4 * u;
        for (let ox = -w; ox <= w; ox++) {
            for (let oy = -w; oy <= w; oy++) {
                if (ox * ox + oy * oy <= w * w) set(Math.round(x + ox), Math.round(y + oy), TEAL);
            }
        }
    }

    // ── ECG trace across the lower third ──
    const pts = [
        [14, 86], [32, 86], [38, 76], [45, 96], [52, 80], [58, 86], [86, 86],
    ].map(([x, y]) => [pad + (x / 100) * (S - pad * 2), pad + (y / 100) * (S - pad * 2)]);

    const w = Math.max(1.6 * u, 1.5);
    for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
        for (let s = 0; s <= steps; s++) {
            const x = ax + (bx - ax) * (s / steps);
            const y = ay + (by - ay) * (s / steps);
            for (let ox = -w; ox <= w; ox++) {
                for (let oy = -w; oy <= w; oy++) {
                    if (ox * ox + oy * oy <= w * w) set(Math.round(x + ox), Math.round(y + oy), [230, 250, 245]);
                }
            }
        }
    }

    return encodePNG(S, S, px);
}

function main() {
    const dir = path.join(__dirname, '..', 'icons');
    fs.mkdirSync(dir, { recursive: true });

    const jobs = [
        ['icon-192.png', 192, {}],
        ['icon-512.png', 512, {}],
        ['icon-maskable-512.png', 512, { maskable: true }],
    ];

    for (const [name, size, opts] of jobs) {
        const buf = drawIcon(size, opts);
        fs.writeFileSync(path.join(dir, name), buf);
        console.log(`[icons] ${name} — ${size}x${size}, ${(buf.length / 1024).toFixed(1)} KB`);
    }
}

if (require.main === module) main();
