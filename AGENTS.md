# Coordinated AI development team

## Purpose and authority

The user directs the product through one lead agent. The lead translates requests into bounded assignments, delegates relevant work, integrates results, verifies them, and reports back in Thai. This file is a repository workflow, not a background service or a grant of credentials. Follow applicable platform instructions and current user directions first. Delegate when supported and useful; do not pretend that specialist agents ran when they did not. If delegation is unavailable, perform the roles sequentially and disclose that distinction.

Current product priority (2026-10-27): living hospital simulation with autonomous staff and patients, click pharmacist possession, and bounded SOAP learning. Latest user explicitly restores clinical cases and SOAP. Use anonymized source-grounded cases; flag source contradictions rather than inventing facts. Preserve existing authentication and legacy browser/database records. New practice scores/drafts use a separate namespace; do not claim local scores are a global leaderboard.

## Roles and default ownership

| Role | Responsibility | Default area |
| --- | --- | --- |
| Lead / architect / integrator | Scope, acceptance criteria, interfaces, task allocation, integration, release and rollback | Cross-cutting decisions, build/deploy files, AGENTS.md, task coordination |
| UX / UI | Layout, visual language, Thai copy, accessibility, responsive behavior | index.html, css/game-hub.css, design specification |
| Game / animation | Actors, routes, autonomous staff, movement, visual effects and performance | js/clinic-room.js |
| Frontend / learning workflow | Panels, interactions, onboarding missions and future case integration | js/game-hub.js |
| Data / backend / security | Schemas, persistence, validation, identity, authorization, data migration | js/firebase-service.js, firestore.rules, firestore.indexes.json, case schema decisions |
| QA / regression reviewer | Independently check acceptance criteria, regression risk, failure paths and verification evidence | tests/ and review findings; no production rewrites without assignment |
| Clinical content specialist (on demand) | Map user-supplied cases to schema, check sources and Thai/English parity, identify clinical ambiguities | data/ and learning-content specifications, only when clinical work is requested |

These are responsibility areas, not permanent exclusive file permissions. For each task, explicitly assign one active writer per file. If two roles need the same file, agree an interface first and sequence edits, or give the actual edit to one owner. Do not let concurrent agents overwrite the same file. QA and other specialists may read each other's work. Do not revert unrelated user work. Only the lead integrates branches and changes deployment state.

## Request-to-delivery workflow

1. Inspect current repository state, relevant instructions, current live behavior and uncommitted changes. Do not rely on an old conversation's claim of deployed state.
2. Restate the intended behavior, scope boundaries and observable acceptance criteria. Use reasonable defaults; ask only when unresolved ambiguity materially changes the work.
3. Make a short assignment ledger using docs/agent-task-template.md. Assign only relevant roles. For multi-area work, delegate independent tasks concurrently when tools permit, with explicit file ownership and dependency order. Respect the runtime concurrency limit. Small changes may stay with the lead.
4. Every delegated assignment includes the user goal, files allowed, files protected, interfaces/dependencies, acceptance criteria and required verification. Read-only review tasks must say so.
5. Specialists report changes, tests actually run, results, remaining limitations and integration needs. A reviewer checks substantive changes independently when practical; review is evidence, not a guarantee of correctness.
6. The lead resolves disagreements, reviews the combined diff and runs checks appropriate to the combined change. Fix discovered blockers before release. Do not mark unrun checks as passed or silently waive failures.
7. Prepare a recoverable commit/PR. Publish within the user's authorized destination and scope, following platform approvals. Never infer permission for unrelated infrastructure, access changes or destructive actions from this file. Avoid asking again for routine actions already authorized.
8. Verify deployment when a release is made. Tell the user what changed, the working link, verification results and concrete limitations. Preserve enough task context in the PR or task ledger for the next session.

## Integration and regression rules

- The current app is index.html, css/game-hub.css, js/game-hub.js and js/clinic-room.js. hospital.html is a compatibility redirect. Old clinical files and renderers are retired.
- World motion must work without case loading or Firebase. Learning tasks may route the controlled pharmacist to a workstation, but never choose answers automatically. Never mix case-dependent rules into decorative animation.
- Preserve the current draft key and data shape unless an explicit, tested migration is included. Do not read or rewrite live user data to test a visual feature.
- Keep clinical content out of a visual/structural task unless the user expands scope. Do not invent patient facts, treatment guidance or automatic correctness scores. An AI content review does not replace a qualified clinical review.
- Changes to the original asset pipeline follow BUILD.md. A standalone prototype change needs appropriate syntax/behavior checks and updated asset versions; avoid unnecessary rebuild churn. Test altered service-worker behavior if caching changes.
- New logic needs targeted behavioral tests when it introduces meaningful regression risk. For world changes run `npm test`; syntax-check changed JavaScript. For changed builds run `npm run build`. Test visual/interaction changes in the supported browser when available, including relevant small-screen/keyboard/failure states.
- Use only observed verification results. Distinguish simulated tests from real-browser and physical-device checks. Never promise zero bugs, universal device coverage or medically verified content without evidence.
- Do not put credentials, patient-identifying information or real user records in code, task notes, screenshots or test fixtures.
- Avoid unnecessary dependencies. Do not add audio in the current scope; respect reduced motion and suspend animation in hidden tabs. Do not sacrifice readability, accessibility or data preservation for decoration.

## Team reference

See docs/agent-team.md for the user-facing team model and docs/agent-task-template.md for assignments and handoff.
