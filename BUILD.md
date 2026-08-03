# Build & Deploy

## Prerequisites

```bash
npm install
```

Node 18+ . Dev dependencies are build-time only — nothing from `node_modules`
ships to the browser.

## Build

```bash
node build.js
```

This does two things:

1. **Compiles CSS.** Scans `index.html` and `js/*.js` for the Tailwind utility
   classes actually used, merges them with the application CSS in
   `css/tailwind.src.css`, and writes minified output to `css/style.min.css`.
   This replaced the `cdn.tailwindcss.com` script, which compiled on every page
   load in the browser and logged a production warning.
2. **Rewrites cache-busting tags.** Every `?v=` on a real asset reference in
   `index.html` and `sw.js` becomes the current timestamp, and `CACHE_NAME` in
   `sw.js` is set to match. A browser therefore cannot serve stale JS, CSS or
   case JSON after a deploy, and the old Service Worker cache is dropped on
   activate.

Run it **before every deploy**. `css/style.min.css` is committed to the
repository on purpose: GitHub Pages serves the tree as-is and never runs a
build step, so an uncommitted stylesheet means a deployed site with no CSS.

## Icons

```bash
node tools/gen-icons.js
```

Regenerates `icons/*.png` from code — no image binaries or image tooling
required. Only needed after a brand change.

## Deploy

```bash
node build.js && git add . && git commit -m "chore: rebuild" && git push origin main
```

GitHub Pages (`main` / root) picks the push up automatically. Live at
<https://sirasitragtong-cmd.github.io/Clinical-case-simulator/>.

## Firebase

Security rules and indexes are in the repository but are **not** deployed by
`git push` — they need the Firebase CLI or the console:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

- `firestore.rules` — immutable score audit; signed-in users create only their
  own attempts, nobody updates or deletes.
- `firestore.indexes.json` — composite indexes for the Leaderboard and
  Instructor Analytics. **Not required for correctness**: every query is
  written unordered and aggregated client-side, so a missing index makes those
  panels slower, never broken.

## Verifying a deploy

Check what the server actually returns, not what you pushed:

```bash
curl -s https://sirasitragtong-cmd.github.io/Clinical-case-simulator/ | grep -o 'style.min.css?v=[0-9]*'
```

The version must match the stamp printed by your last `node build.js`.
