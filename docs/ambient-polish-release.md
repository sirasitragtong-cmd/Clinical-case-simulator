# Living clinic polish

Goal: readable Thai text, clearer character faces, natural walking and continuous ambient life in the existing pixel clinic. Base: main 6fe41f1. Publish to existing GitHub Pages destination as requested. No clinical cases, audio, auth changes or score writes.

Ownership: ambient_polish agent owns js/clinic-room.js; lead owns HTML/CSS, movement tests, integration and release. Ambient clock must continue after arrival, but freeze on manual pause, reduced motion, hidden tab or inactive panel. Staff stay at fixed stations. Thai room labels render as HTML over the pixel canvas. Existing gameplay events must remain unchanged.

Acceptance: idle frame progression, anchored canopy sway, blinking/breathing characters, correct route arrival and reset; readable 390px and desktop UI; full test suite and build pass; publish and inspect the live assets. Rollback: revert release commit and rebuild cache version.

Verification: independent polish_review agent found no blockers. Lead ran 21/21 passing tests and build (asset version 20261025143326), checked 390px and desktop screenshots, and completed all 3 services in the browser after the animation update. Pause/resume controls verified. Tests cover continuous idle after arrival, stationary staff, frozen ambient clock under pause/hidden/inactive/reduced-motion, same-room selection without detour and existing gameplay/data safeguards. Canvas redraw is capped at 30fps; travel uses elapsed time. Physical devices and real Google account login were not tested. No backend files changed.
