# PharmVille living hospital — 2026-10-26

User requests the existing website be upgraded using the latest cross-chat decisions and supplied UI reference. Latest instructions supersede the previous case-free/stationary-staff prototype.

## Assignments
| Owner | Files | Acceptance |
|---|---|---|
| Lead | game-hub.js, integration/build/release | Playable end-to-end, drafts, truthful scoring, existing auth |
| world agent | clinic-room.js, hospital-world tests | Connected hospital, autonomous actors, click possession |
| ui agent | index.html, game-hub.css | Thai responsive reference-inspired game interface |
| learning agent | learning-engine.js, demo-case.json, engine tests | Bounded selections, dependency review, partial rubric |
| case_source agent | pain-migraine-case.json, case-source-review.md | Source-grounded anonymized case, explicit review status |

## Preserved decisions
- Pharmacy students; pharmacy playable, other professions inspectable/locked.
- Hospital simulation runs in observation mode; clicking pharmacist takes control.
- Autonomous movement never answers clinical questions for the player.
- Fixed problem list; choose DRPs and relevant chart evidence.
- Etiology ordered cards; current therapy conclusion/reasons/evidence; new therapy fixed formulary.
- Monitoring parameter/target/time; education dialogue; future condition/action/time.
- No open-ended AI grading or per-movement AI calls.
- Original browser draft namespace/database untouched. New versioned local practice drafts and scores.
- Existing public GitHub Pages destination retained.
