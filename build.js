#!/usr/bin/env node
/**
 * build.js — production build for Clinical Case Simulator.
 *
 *   1. Compiles Tailwind + application CSS into css/style.min.css.
 *   2. Rewrites every `?v=` query tag in index.html and sw.js to a fresh
 *      timestamp, so a browser can never serve a stale JS/CSS/JSON asset
 *      after a deploy.
 *   3. Rewrites the Service Worker cache name to the same stamp, which is
 *      what causes sw.js to evict its old cache on activate.
 *
 * Run before every deploy:  node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { build: buildCss } = require('./build-css');

const ROOT = __dirname;

/** YYYYMMDDHHmm in local time — sorts chronologically and stays readable. */
function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Replaces the version tag on real asset references — including the literal
 * BUILD_STAMP placeholder — in href/src attributes and in the sw.js asset list.
 *
 * The tag must be anchored to a known asset extension. An unanchored pattern
 * also rewrites the string inside prose comments that merely mention a version
 * tag, which corrupts documentation on every build.
 */
function retag(file, version) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) return 0;

    const before = fs.readFileSync(abs, 'utf8');
    let hits = 0;
    const after = before.replace(/(\.(?:js|css|json|html|png|svg|webmanifest))\?v=[A-Za-z0-9_.-]*/g, (m, ext) => {
        hits++;
        return `${ext}?v=${version}`;
    });

    if (after !== before) fs.writeFileSync(abs, after);
    console.log(`[build] ${file} — ${hits} asset tag(s) → ?v=${version}`);
    return hits;
}

function run() {
    console.log('── Clinical Case Simulator :: production build ──');

    buildCss();

    const version = stamp();
    let total = 0;
    total += retag('index.html', version);
    total += retag('sw.js', version);

    // The SW cache name must change with the build, otherwise an installed
    // worker keeps serving the previous bundle from its old cache.
    const swPath = path.join(ROOT, 'sw.js');
    if (fs.existsSync(swPath)) {
        const src = fs.readFileSync(swPath, 'utf8');
        const next = src.replace(
            /const CACHE_NAME = '[^']*';/,
            `const CACHE_NAME = 'pharmsim-${version}';`
        );
        if (next !== src) {
            fs.writeFileSync(swPath, next);
            console.log(`[build] sw.js — cache name → pharmsim-${version}`);
        }
    }

    console.log(`[build] done. version=${version}, ${total} tag(s) rewritten.`);
}

if (require.main === module) {
    try {
        run();
    } catch (err) {
        console.error('[build] FAILED:', err.message);
        process.exit(1);
    }
}

module.exports = { run, stamp };
