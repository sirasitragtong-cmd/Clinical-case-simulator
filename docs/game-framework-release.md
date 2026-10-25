# Content-free game foundation

User scope: remove every old clinical case, old patient chart/portrait and audio. Rebuild a game-like hospital with only future score/ranking/stage/mission structure. Existing authentication and remote records remain intact. No score is awarded or saved in this version.

| Owner | Files | Assignment |
| --- | --- | --- |
| visual_system | index.html, css/game-hub.css | New responsive game hub, mission board and stage/ranking panels |
| world_upgrade | js/clinic-room.js, scene tests | New detailed clinic rooms, stationary staff, decorative patient, no audio |
| integration_audit | js/game-hub.js, app tests | Navigation, onboarding, role locks, empty stages/ranking and auth bridge |
| team_workflow_review | read only | Audit complete removal of case sources and alternate entrypoints |
| lead | build, SW, deletions, docs, integration/release | Remove old content, update caching, verify and publish |

No clinical JSON, case generator, old game engine, chart renderer or patient portrait ships. The previous hospital URL redirects to the new hub. Service worker removes prior app caches and denies retired content routes. Git history is retained for recovery; no history rewrite or database deletion performed. Current case slots are empty. Onboarding visits are temporary UI state and never produce saved points.

Final integration: lead completed stylesheet and fixed mission progress/toast, room highlighting and off-screen animation suspension after the specialist session ended. Validation: 10 automated tests passed (mission state, role/stage locks, no persistence, retired source removal, cache retirement and Firebase passthrough); production build and JS syntax passed. Browser verified 3/3 exploration, locked-stage dialog, empty rankings and desktop/390px iframe layout. Existing Firebase code/rules remain unchanged. Google credential sign-in and physical devices were not exercised.
