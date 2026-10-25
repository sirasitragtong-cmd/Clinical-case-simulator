# Playable pixel clinic

User goal: working buttons, an actual playable loop, believable patient walking, and warm pixel art inspired by the supplied reference. No old clinical cases, audio, real scoring or database writes are reintroduced.

Ownership: pixel_world owns clinic-room.js and movement tests; play_loop owns game-hub.js and gameplay tests; lead owns index, CSS, integration, QA and release. The patient walks between safe destinations, with arrival events separating travel from task completion. Each station requires a service action. Wrong destination, duplicate input, pause, reset and completed rounds must be handled. Staff remain stationary. Two future clinical slots stay explicitly locked.

Validation: 18 automated tests pass (movement, rerouting, low frame rate, pause/visibility, reduced motion, fallback, reset, three-step game, duplicate/stale input, protected data/cache and optional auth contract). Build passes. Browser played all three services to 3/3, replayed to 0/3, toggled pause and reset; 390px mobile layout visually checked. Low-frame-rate travel uses elapsed time capped at one second and hidden/inactive states reset the clock. Google sign-in was not exercised with a real account. Clinical stages and rankings remain intentionally unavailable/empty. Existing Firebase implementation and security rules are unchanged.
