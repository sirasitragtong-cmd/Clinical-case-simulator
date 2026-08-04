#!/usr/bin/env node
/**
 * tools/preview-avatar.js — renders the patient avatar to a PNG contact sheet
 * so the artwork can be reviewed without a browser.
 *
 * Pulls buildAvatarSVG() straight out of js/ui-controller.js and the .pa-*
 * rules out of css/tailwind.src.css, so what it renders is exactly what ships.
 *
 *     node tools/preview-avatar.js [outfile.png]
 *
 * Dev tool only — nothing here is served to the browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const STATES = ['neutral', 'improving', 'recovered', 'pain', 'distress', 'critical'];
const CELL = 320, CELL_H = 240;

function loadBuilder() {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'ui-controller.js'), 'utf8');
    const m = src.match(/function buildAvatarSVG\(sex, uid\)\s*\{[\s\S]*?\n    \}\n/);
    if (!m) throw new Error('buildAvatarSVG(sex, uid) not found in ui-controller.js');
    return new Function(m[0] + '; return buildAvatarSVG;')();
}

/**
 * The avatar rules only — the rest of the stylesheet is irrelevant here.
 *
 * Takes the whole block from the "Patient avatar" banner to the end of the
 * file. An earlier version filtered line-by-line for /pa-|reaction-/, which
 * silently dropped the continuation lines of any multi-line rule and left an
 * unterminated declaration that broke every rule after it — the preview then
 * showed sweat and the alarm glow on a healthy patient. Never parse CSS by
 * line.
 */
function loadAvatarCSS() {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'tailwind.src.css'), 'utf8');
    const start = css.indexOf('Patient avatar');
    if (start === -1) throw new Error('avatar CSS block not found in tailwind.src.css');
    return css.slice(css.lastIndexOf('/*', start));
}

/** Strips the <svg> wrapper so the body can be nested inside a bigger sheet. */
function innerOf(svgMarkup) {
    return svgMarkup.trim().replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

function main() {
    const build = loadBuilder();
    const css = loadAvatarCSS();
    const out = process.argv[2] || path.join(ROOT, 'avatar-preview.png');

    const cols = STATES.length;
    const W = CELL * cols, H = CELL_H * 2;

    let body = '';
    ['M', 'F'].forEach((sex, row) => {
        STATES.forEach((st, col) => {
            // The reaction class sits on a wrapper <g>, which is exactly how the
            // real page does it — the CSS selectors are all descendant rules.
            body += `<g class="reaction-${st}" transform="translate(${col * CELL} ${row * CELL_H})">`
                 +  innerOf(build(sex))
                 +  `</g>`;
        });
    });

    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
        + `<style>${css}</style>`
        + body
        + `</svg>`;

    const png = new Resvg(sheet, { fitTo: { mode: 'width', value: Math.min(W, 1440) } })
        .render().asPng();

    fs.writeFileSync(out, png);
    console.log(`[preview-avatar] ${out} — rows: male, female | cols: ${STATES.join(', ')}`);
}

if (require.main === module) main();
