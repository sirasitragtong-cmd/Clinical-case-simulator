'use strict';
const CACHE_NAME = 'pharmsim-20261025072904';
const SHELL = ['./', './index.html', './css/game-hub.css?v=20261025072904', './js/game-hub.js?v=20261025072904', './js/clinic-room.js?v=20261025072904', './js/firebase-service.js?v=20261025072904', './manifest.json?v=20261025072904', './icons/icon-192.png', './icons/icon-512.png'];
const RETIRED = /\/(?:data\/|tools\/build-case-001\.js|js\/(?:game-engine|ui-controller|i18n|pharmville-shell)\.js|hospital(?:-scene)?\.js)/;
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(SHELL.map(url => cache.add(new Request(url, {cache:'reload'})).catch(() => {})));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(name => name.startsWith('pharmsim-') && name !== CACHE_NAME).map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (RETIRED.test(url.pathname)) {
    event.respondWith(Promise.resolve(new Response('This content has been retired.', {status:410})));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      return await cache.match(request) || (request.mode === 'navigate' ? await cache.match('./index.html') : null) || new Response('Offline', {status:503});
    }
  })());
});
