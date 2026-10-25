# Build and release

Run `npm ci`, `npm test`, then `npm run build`. The build parses the game stylesheet and versions browser assets/service-worker cache. GitHub Pages serves main/root directly; commit changed assets before publishing.

The app is index.html + css/game-hub.css + js/game-hub.js + js/clinic-room.js. hospital.html redirects older links to the new hub. Firebase authentication remains configured in js/firebase-service.js. The new hub neither reads nor writes score records. No clinical case files ship in this release.

Service-worker activation removes previous pharmsim caches; retired case paths return 410. Existing database records and local drafts are not deleted. Reverting a release in Git recovers source; rebuild versions before publishing a rollback. Never include preview-dist or .openai test configuration in a release.
