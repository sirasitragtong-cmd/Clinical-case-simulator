# Pharmacy shell and SOAP removal

Scope: original scored app gains pharmacy world, role selection, two visible case slots and neutral patient information. SOAP notebook and tab workflow removed at the user's request. Only the first case exists; the second slot is explicitly unavailable. No clinical content invented.

Base: 8ac2c499f9a9f0248eb7355a396a6b70ca1a8c4d. Destination: existing GitHub Pages main/root.

| Owner | Files | Result |
| --- | --- | --- |
| Lead | index.html, js/pharmville-shell.js, build assets, release | Integrated original auth and scored engine with world |
| visual_system | css/pharmville.css | Responsive sage theme, compact hero, corrected progress strip |
| world_upgrade | hospital-scene.js, hospital.html, hospital.js, scene tests | Stationary staff, patient movement, view/audio lifecycle, removed notebook |
| integration_audit | js/ui-controller.js, js/i18n.js, engine tests | Neutral patient chart, monitoring lock retained, accessible drawer, independent engine regression checks |
| team_workflow_review | tests/pharmacy-shell.test.cjs | Catalog, role and lifecycle tests |

Validation: production build; 24 Node tests passed; changed JS syntax; unique HTML IDs; whitespace check. Protected data/, game-engine.js, firebase-service.js and Firestore rules/indexes unchanged. Engine tests complete real 15-step case at 3200/3200 and cover duplicate submission, completion save payload, fatal choices and restart. Browser QA with isolated simulated auth/database verified role lock, two slots, patient information, 2px progress strip, pause/resume, advancing steps, exiting and restarting. No production records written. Real Google sign-in/Firestore writes and physical mobile devices were not tested.

Existing notebook browser drafts are untouched but no longer read or edited. Internal patient chart host IDs remain for compatibility; SOAP tabs/state/editor no longer exist. Original case stages and scoring remain unchanged. Release rollback: revert this release commit and rebuild asset versions before redeploying.
