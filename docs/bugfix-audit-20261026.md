# Clinic bug audit, 2026-10-26

Scope: user-reported missing patient eyes and incorrect foreground/background overlap plus audit of playable shell. Original clinical content, audio, real scores and account records remain excluded/protected.

Ownership: render_bugfix began renderer edits before interruption; lead reviewed and completed renderer tests, gameplay/state fixes, cache resilience, layout and release. Other delegated audits did not complete; no independent review claimed.

Fixed: patient now faces camera at rest with larger pupils and stable short blink timing; fence is behind foreground trees; counter occludes reception staff feet; floor tiles clipped to room bounds; pause no longer changes walking pose; start/reset clear paused state; map travel synchronizes selected room/title; navigation breadcrumb updates; reset clears stale toast; scene no longer stretches to mission-board height; tablet uses full-width scene; long player names wrap; network responses survive cache write/open errors.

Validation: 27 tests pass, including actual raster pixel assertions for both patient eyes, tree/fence occlusion, counter layering and floor boundary. Build passes. Browser checked desktop, 320px and 768px layouts and three-station gameplay. Authentication remains unchanged; actual Google sign-in and physical devices were not tested. These checks cover identified defects, not a guarantee that every possible defect is absent.

Rollback: revert release commit and rebuild cache version. Preview-only QA files are excluded from release.
