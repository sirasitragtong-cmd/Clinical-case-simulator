#!/usr/bin/env node
/**
 * build-css.js — Tailwind compilation step.
 *
 * Scans index.html and js/*.js (see `content` in tailwind.config.js) for
 * the utility classes actually used, compiles them together with the
 * application CSS in css/tailwind.src.css, and writes a minified
 * production stylesheet to css/style.min.css.
 *
 * This replaces the CDN build (cdn.tailwindcss.com), which compiled on
 * every page load in the browser and printed a production warning.
 *
 * Usage:  node build-css.js        (or via `node build.js`)
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'css', 'tailwind.src.css');
const OUT = path.join(ROOT, 'css', 'style.min.css');

function build() {
    if (!fs.existsSync(SRC)) {
        throw new Error(`Missing stylesheet source: ${SRC}`);
    }

    // The tailwindcss binary is installed as a devDependency. Resolving it
    // through node_modules/.bin keeps the build working without a global
    // install and without npx hitting the network.
    const bin = path.join(
        ROOT, 'node_modules', '.bin',
        process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss'
    );

    if (!fs.existsSync(bin)) {
        throw new Error(
            'tailwindcss is not installed. Run `npm install` first.'
        );
    }

    execFileSync(bin, ['-c', 'tailwind.config.js', '-i', SRC, '-o', OUT, '--minify'], {
        cwd: ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });

    const bytes = fs.statSync(OUT).size;
    console.log(`[build-css] css/style.min.css written — ${(bytes / 1024).toFixed(1)} KB`);
    return bytes;
}

if (require.main === module) {
    try {
        build();
    } catch (err) {
        console.error('[build-css] FAILED:', err.message);
        process.exit(1);
    }
}

module.exports = { build };
