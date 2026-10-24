# PharmVille prototype

Open `hospital.html` from the existing GitHub Pages project. The existing home page includes a small opt-in link; the original app remains the default.

## Scope

- Three clickable stations with a moving pharmacist in a pixel hospital.
- Existing Thai case JSON, read-only; no new clinical recommendations.
- Fifteen SOAP topics from the original case, draft-first answer reference, optional choices, export to UTF-8 text.
- Drafts use only `pharmville:soap:v1:<case_id>:<case_version>` in browser localStorage. No Firebase imports, score writes, or account changes.
- Existing content may need clinical review; completion measures written topics, not correctness.
- Mobile layout is stacked; keyboard buttons expose all stations. Reduced motion is supported.

## Verification

- `npm ci --ignore-scripts` and `npm run build` passed.
- `node --check hospital.js` and all existing `js/*.js` passed.
- Browser: rendered hospital, objective record, assessment selection, draft persistence across reload, empty-answer reference gate, reference after writing, clearing via keyboard, notebook collapse, return to existing sign-in screen.
- Existing game/auth/Firebase code, JSON, rules, dependencies and compiled CSS are unchanged. The home-page link and build cache tags are the only changes to existing runtime files.
- Full authenticated clinical workflow and physical mobile devices were not tested in this session.

## Rollback

Revert this feature commit (including the home-page link) and run `node build.js` to refresh the service-worker cache version. Existing data and scores do not need migration.

## World prototype 02

`hospital-scene.js` now owns the scene, actor positions, corridor graph, patient movement and Web Audio. It loads without case JSON, authentication or the notebook. `hospital.js` owns the existing learning workflow and only sends an optional station-selection highlight to the scene.

Staff stay at fixed stations. Only the demonstration patient walks, using graph routes and a walk cycle. The patient is independent of the current case. Manual destinations finish the current path segment before rerouting; automatic tours pause at each destination. Motion can be paused, reduced-motion preferences are honored, and hidden tabs stop updates. Sounds start muted, use one user-activated AudioContext, and suspend when the page is hidden. An unsupported audio device leaves the rest of the prototype usable.

Run `node --test tests/hospital-scene.test.cjs` for regression coverage of boot without case data, rerouting continuity, staff positions, pause/visibility, reduced motion, audio lifecycle and unsupported audio. These tests simulate browser facilities; live-browser checks complement them. No case content or original runtime files change in this iteration.
