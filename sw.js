/**
 * sw.js — Service Worker for Clinical Case Simulator (Pharmacy Edition).
 *
 * Purpose: a pharmacy student on a ward round should be able to open the
 * app on an iPad and have it load instantly even when hospital Wi-Fi is
 * unreliable. Everything the simulator needs to run a case — shell, styles,
 * scripts and case JSON — is precached on install.
 *
 * CACHE_NAME carries the build stamp and is rewritten by build.js, so each
 * deploy installs a fresh worker and drops the previous cache on activate.
 * Never edit CACHE_NAME by hand.
 *
 * Strategies:
 *   - Navigations   → network-first (a new deploy wins), cache as fallback.
 *   - Same-origin   → stale-while-revalidate (instant, refreshes silently).
 *   - Cross-origin  → passthrough. Firebase Auth/Firestore and Google Fonts
 *                     must never be intercepted; caching auth traffic would
 *                     serve stale credentials and break sign-in.
 */
'use strict';

const CACHE_NAME = 'pharmsim-202608050908';

const PRECACHE_URLS = [
    './',
    './index.html',
    './css/style.min.css?v=202608050908',
    './js/qrcode.js?v=202608050908',
    './js/firebase-service.js?v=202608050908',
    './js/ui-controller.js?v=202608050908',
    './js/game-engine.js?v=202608050908',
    './data/case_001.json?v=202608050908',
    './manifest.json?v=202608050908',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// ─── Install ────────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // addAll() is all-or-nothing: one 404 would abort the whole install
        // and leave the app with no offline support at all. Add individually
        // and tolerate misses so a renamed asset degrades instead of failing.
        await Promise.all(PRECACHE_URLS.map(async url => {
            try {
                await cache.add(new Request(url, { cache: 'reload' }));
            } catch (err) {
                console.warn('[SW] Precache skipped:', url, err.message);
            }
        }));
        await self.skipWaiting();
    })());
});

// ─── Activate ───────────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names.filter(n => n.startsWith('pharmsim-') && n !== CACHE_NAME)
                 .map(n => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

// ─── Fetch ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const req = event.request;

    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // Firebase, fonts, CDNs

    if (req.mode === 'navigate') {
        event.respondWith(networkFirst(req));
        return;
    }

    event.respondWith(staleWhileRevalidate(req));
});

/** Fresh HTML when online; last good shell when not. */
async function networkFirst(req) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch (err) {
        return (await cache.match(req))
            || (await cache.match('./index.html'))
            || Response.error();
    }
}

/** Serve from cache immediately, refresh the entry in the background. */
async function staleWhileRevalidate(req) {
    const cache = await caches.open(CACHE_NAME);

    // Exact match first — right version, right file.
    let cached = await cache.match(req);

    // Fallback that ignores the version query string. A cached index.html
    // can outlive the build stamp it was tagged with, and would otherwise
    // request assets at a stamp this cache does not hold, failing every one
    // of them while offline. Serving the older copy beats serving nothing on
    // a ward with no signal; when the network is reachable the revalidate
    // below replaces it anyway.
    if (!cached) cached = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    }).catch(() => null);

    return cached || (await network) || Response.error();
}
