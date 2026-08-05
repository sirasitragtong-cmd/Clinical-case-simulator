/**
 * qrcode.js — a self-contained QR Code (Model 2) encoder.
 *
 * Written in-house rather than pulled from a CDN for three reasons that
 * all matter to this app specifically:
 *
 *   1. The page runs under a strict CSP and is served from GitHub Pages.
 *      An external script tag is one more origin to whitelist and one more
 *      thing that can fail.
 *   2. The service worker precaches the whole bundle so the simulator works
 *      offline in a classroom with weak wifi. A QR that only renders when
 *      the network is up would break exactly where it is most useful.
 *   3. Nothing here needs to reach a server. Rendering a QR client-side
 *      means the URL is never sent to a third-party image API.
 *
 * Scope is deliberately narrow: byte mode, error-correction level M,
 * versions 1–10 (up to 216 data codewords ≈ 213 ASCII characters). That
 * covers any deployment URL this project will ever have. Anything longer
 * throws instead of silently producing an unreadable symbol.
 *
 * Error correction M recovers ~15% damage — the usual choice for a code
 * that will be projected on a screen or printed on a handout.
 */
(function() {
    'use strict';

    // ═══ GF(256) arithmetic ════════════════════════════════════
    // Galois field with primitive polynomial x^8+x^4+x^3+x^2+1 (0x11D),
    // as specified for QR Reed-Solomon.
    const EXP = new Array(512);
    const LOG = new Array(256);
    (function buildTables() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    })();

    function gmul(a, b) {
        if (a === 0 || b === 0) return 0;
        return EXP[LOG[a] + LOG[b]];
    }

    /** Reed-Solomon generator polynomial of degree n, highest term first. */
    function genPoly(n) {
        let g = [1];
        for (let i = 0; i < n; i++) {
            const next = new Array(g.length + 1).fill(0);
            for (let j = 0; j < g.length; j++) {
                next[j]     ^= g[j];
                next[j + 1] ^= gmul(g[j], EXP[i]);
            }
            g = next;
        }
        return g;
    }

    /** The ecLen error-correction codewords for one data block. */
    function rsEncode(data, ecLen) {
        const gen = genPoly(ecLen);
        const buf = data.concat(new Array(ecLen).fill(0));
        for (let i = 0; i < data.length; i++) {
            const factor = buf[i];
            if (!factor) continue;
            for (let j = 0; j < gen.length; j++) buf[i + j] ^= gmul(gen[j], factor);
        }
        return buf.slice(data.length);
    }

    // ═══ Version tables (error-correction level M only) ════════
    // [ecCodewordsPerBlock, group1Blocks, group1DataCodewords,
    //                       group2Blocks, group2DataCodewords]
    const EC_M = [null,
        [10, 1, 16, 0,  0],
        [16, 1, 28, 0,  0],
        [26, 1, 44, 0,  0],
        [18, 2, 32, 0,  0],
        [24, 2, 43, 0,  0],
        [16, 4, 27, 0,  0],
        [18, 4, 31, 0,  0],
        [22, 2, 38, 2, 39],
        [22, 3, 36, 2, 37],
        [26, 4, 43, 1, 44]
    ];

    // Row/column centres of the alignment patterns, per version.
    const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30],
                   [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

    function dataCapacity(v) {
        const t = EC_M[v];
        return t[1] * t[2] + t[3] * t[4];
    }

    // ═══ Bit stream ════════════════════════════════════════════
    function BitBuffer() { this.bits = []; }
    BitBuffer.prototype.put = function(value, length) {
        for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
    };

    /** UTF-8 bytes. QR byte mode is defined over bytes, not code points. */
    function utf8Bytes(str) {
        const out = [];
        for (const ch of str) {
            let cp = ch.codePointAt(0);
            if (cp < 0x80) out.push(cp);
            else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
            else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
            else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        }
        return out;
    }

    /** Data codewords: mode + length + payload + terminator + pad. */
    function buildCodewords(bytes, version) {
        const capacity = dataCapacity(version);
        const buf = new BitBuffer();
        buf.put(4, 4);                                   // byte mode
        buf.put(bytes.length, version < 10 ? 8 : 16);    // character count
        bytes.forEach(b => buf.put(b, 8));

        const totalBits = capacity * 8;
        // Terminator: up to four zero bits, truncated if the symbol is full.
        for (let i = 0; i < 4 && buf.bits.length < totalBits; i++) buf.bits.push(0);
        while (buf.bits.length % 8 !== 0) buf.bits.push(0);

        const words = [];
        for (let i = 0; i < buf.bits.length; i += 8) {
            let b = 0;
            for (let j = 0; j < 8; j++) b = (b << 1) | buf.bits[i + j];
            words.push(b);
        }
        // Standard alternating pad codewords.
        const PAD = [0xec, 0x11];
        for (let i = 0; words.length < capacity; i++) words.push(PAD[i % 2]);
        return words;
    }

    /** Split into blocks, add EC, then interleave as the spec requires. */
    function interleave(words, version) {
        const [ecLen, g1n, g1c, g2n, g2c] = EC_M[version];
        const blocks = [];
        let at = 0;
        for (let i = 0; i < g1n; i++) { blocks.push(words.slice(at, at + g1c)); at += g1c; }
        for (let i = 0; i < g2n; i++) { blocks.push(words.slice(at, at + g2c)); at += g2c; }

        const ecBlocks = blocks.map(b => rsEncode(b, ecLen));

        const out = [];
        const maxData = Math.max(g1c, g2c);
        for (let i = 0; i < maxData; i++) {
            blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
        }
        for (let i = 0; i < ecLen; i++) {
            ecBlocks.forEach(b => out.push(b[i]));
        }
        return out;
    }

    // ═══ Matrix construction ═══════════════════════════════════
    function buildMatrix(version) {
        const size = version * 4 + 17;
        const m   = Array.from({ length: size }, () => new Array(size).fill(0));
        const fn  = Array.from({ length: size }, () => new Array(size).fill(false));

        const set = (r, c, v) => { m[r][c] = v; fn[r][c] = true; };

        // Finder patterns + their separators.
        [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r0, c0]) => {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const rr = r0 + r, cc = c0 + c;
                    if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
                    const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                                   (c >= 0 && c <= 6 && (r === 0 || r === 6));
                    const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                    set(rr, cc, (inRing || inCore) ? 1 : 0);
                }
            }
        });

        // Timing patterns.
        for (let i = 8; i < size - 8; i++) {
            const v = i % 2 === 0 ? 1 : 0;
            set(6, i, v);
            set(i, 6, v);
        }

        // Alignment patterns, skipping the three finder corners.
        const centres = ALIGN[version];
        centres.forEach(r0 => centres.forEach(c0 => {
            const nearFinder = (r0 <= 8 && c0 <= 8) ||
                               (r0 <= 8 && c0 >= size - 9) ||
                               (r0 >= size - 9 && c0 <= 8);
            if (nearFinder) return;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    const edge = Math.max(Math.abs(r), Math.abs(c));
                    set(r0 + r, c0 + c, edge !== 1 ? 1 : 0);
                }
            }
        }));

        // Dark module — always set, always reserved.
        set(size - 8, 8, 1);

        // Reserve the format-information strips.
        for (let i = 0; i < 9; i++) {
            if (!fn[8][i])        fn[8][i] = true;
            if (!fn[i][8])        fn[i][8] = true;
        }
        for (let i = 0; i < 8; i++) {
            fn[8][size - 1 - i]   = true;
            fn[size - 1 - i][8]   = true;
        }

        // Reserve the version-information blocks (version 7 and up).
        if (version >= 7) {
            for (let i = 0; i < 18; i++) {
                const a = Math.floor(i / 3), b = size - 11 + (i % 3);
                fn[a][b] = true;
                fn[b][a] = true;
            }
        }

        return { m, fn, size };
    }

    /** Zigzag data placement, right to left, skipping the vertical timing column. */
    function placeData(m, fn, size, words) {
        let bitIndex = 0;
        const nextBit = () => {
            const byte = words[bitIndex >> 3];
            const bit  = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
            bitIndex++;
            return bit;
        };

        let upward = true;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;   // column 6 is the timing pattern
            for (let step = 0; step < size; step++) {
                const r = upward ? size - 1 - step : step;
                for (let k = 0; k < 2; k++) {
                    const c = right - k;
                    if (fn[r][c]) continue;
                    m[r][c] = nextBit();
                }
            }
            upward = !upward;
        }
    }

    const MASKS = [
        (r, c) => (r + c) % 2 === 0,
        (r, c) => r % 2 === 0,
        (r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
        (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
        (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    ];

    /** The four penalty rules from the spec; lower is a better mask. */
    function penalty(m, size) {
        let score = 0;

        // Rule 1 — runs of five or more identical modules in a line.
        for (let i = 0; i < size; i++) {
            for (const horizontal of [true, false]) {
                let run = 1;
                for (let j = 1; j < size; j++) {
                    const a = horizontal ? m[i][j]     : m[j][i];
                    const b = horizontal ? m[i][j - 1] : m[j - 1][i];
                    if (a === b) {
                        run++;
                        if (run === 5) score += 3;
                        else if (run > 5) score += 1;
                    } else run = 1;
                }
            }
        }

        // Rule 2 — 2x2 blocks of one colour.
        for (let r = 0; r < size - 1; r++) {
            for (let c = 0; c < size - 1; c++) {
                const v = m[r][c];
                if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
            }
        }

        // Rule 3 — finder-like 1:1:3:1:1 sequences with four light modules.
        const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
        const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
        const matches = (get, j) => {
            let okA = true, okB = true;
            for (let k = 0; k < 11; k++) {
                const v = get(j + k);
                if (v !== A[k]) okA = false;
                if (v !== B[k]) okB = false;
            }
            return (okA ? 1 : 0) + (okB ? 1 : 0);
        };
        for (let i = 0; i < size; i++) {
            for (let j = 0; j + 11 <= size; j++) {
                score += 40 * matches(x => m[i][x], j);
                score += 40 * matches(x => m[x][i], j);
            }
        }

        // Rule 4 — deviation from a 50/50 light-dark balance.
        let dark = 0;
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
        const percent = (dark * 100) / (size * size);
        score += Math.floor(Math.abs(percent - 50) / 5) * 10;

        return score;
    }

    /** BCH(15,5) format information for EC level M (bits 00) and a mask. */
    function formatInfo(mask) {
        const data = (0 << 3) | mask;      // 0b00 = level M
        let rem = data << 10;
        for (let i = 14; i >= 10; i--) {
            if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
        }
        return ((data << 10) | rem) ^ 0x5412;
    }

    /** BCH(18,6) version information, required from version 7. */
    function versionInfo(version) {
        let rem = version << 12;
        for (let i = 17; i >= 12; i--) {
            if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
        }
        return (version << 12) | rem;
    }

    function placeFormat(m, size, mask) {
        const bits = formatInfo(mask);
        const bit  = i => (bits >> i) & 1;

        // Both copies are written most-significant bit first, following the
        // reading order in the spec: along row 8 from the left, then up
        // column 8; and up column 8 from the bottom, then along row 8 to
        // the right edge. Rows/columns 6 are skipped — that is the timing
        // pattern, not a format cell.
        for (let k = 0; k <= 5; k++) m[8][k] = bit(14 - k);
        m[8][7] = bit(8);
        m[8][8] = bit(7);
        m[7][8] = bit(6);
        for (let k = 0; k <= 5; k++) m[k][8] = bit(k);

        for (let k = 0; k <= 6; k++) m[size - 1 - k][8]  = bit(14 - k);
        for (let k = 0; k <= 7; k++) m[8][size - 8 + k]  = bit(7 - k);

        m[size - 8][8] = 1;   // dark module
    }

    function placeVersion(m, size, version) {
        if (version < 7) return;
        const bits = versionInfo(version);
        for (let i = 0; i < 18; i++) {
            const b = (bits >> i) & 1;
            const a = Math.floor(i / 3), o = size - 11 + (i % 3);
            m[a][o] = b;
            m[o][a] = b;
        }
    }

    // ═══ Public encode ═════════════════════════════════════════
    /** Returns { size, modules } where modules[r][c] is 1 for a dark cell. */
    function encode(text) {
        const bytes = utf8Bytes(String(text));

        let version = 0;
        for (let v = 1; v <= 10; v++) {
            const headerBytes = v < 10 ? 2 : 3;   // mode+count is 12 or 20 bits
            if (bytes.length + headerBytes <= dataCapacity(v)) { version = v; break; }
        }
        if (!version) {
            throw new Error('QR: ' + bytes.length + ' bytes exceeds the version 10 / level M limit');
        }

        const words = interleave(buildCodewords(bytes, version), version);
        const { m, fn, size } = buildMatrix(version);
        placeData(m, fn, size, words);
        placeVersion(m, size, version);

        // Try every mask, keep the one the spec scores best.
        let best = null;
        for (let mask = 0; mask < 8; mask++) {
            const cand = m.map(row => row.slice());
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (!fn[r][c] && MASKS[mask](r, c)) cand[r][c] ^= 1;
                }
            }
            placeFormat(cand, size, mask);
            const score = penalty(cand, size);
            if (!best || score < best.score) best = { score, modules: cand };
        }

        return { size, modules: best.modules, version };
    }

    /**
     * Renders to a standalone SVG string.
     *
     * The quiet zone is not decorative — most scanners will refuse a symbol
     * without four modules of clear margin, so it is drawn as part of the
     * light background rather than left to the surrounding layout.
     */
    function toSVG(text, options) {
        const opts   = options || {};
        const dark   = opts.dark   || '#0B1220';
        const light  = opts.light  || '#FFFFFF';
        const margin = opts.margin == null ? 4 : opts.margin;
        const label  = opts.label  || text;

        const { size, modules } = encode(text);
        const total = size + margin * 2;

        // One path for every dark module keeps the DOM to a single node,
        // which matters when this re-renders on each panel switch.
        let d = '';
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (modules[r][c]) d += `M${c + margin} ${r + margin}h1v1h-1z`;
            }
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
               `shape-rendering="crispEdges" role="img" aria-label="${String(label).replace(/[&<>"]/g, '')}" ` +
               `style="width:100%;height:auto;display:block">` +
               `<rect width="${total}" height="${total}" fill="${light}"/>` +
               `<path d="${d}" fill="${dark}"/></svg>`;
    }

    window.QRCode = { encode, toSVG };
})();
