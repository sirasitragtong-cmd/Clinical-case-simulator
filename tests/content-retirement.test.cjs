'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

// Protect the deployable tree, not historical Git commits or user/backend records.
test('retired clinical data, generators, chart, avatar and audio sources are absent', () => {
    const retired = [
        'data/case_001.json', 'data/case_001.en.json', 'tools/build-case-001.js',
        'tools/preview-avatar.js', 'js/game-engine.js', 'js/ui-controller.js',
        'js/i18n.js', 'js/pharmville-shell.js', 'hospital-scene.js', 'hospital.js'
    ];
    for (const file of retired) assert.equal(fs.existsSync(path.join(root, file)), false, file + ' must not remain deployable');
});

function worker(options = {}) {
    const handlers = new Map();
    const activity = { opened: [], deleted: [], fetched: [], matched: [], claimed: 0 };
    const cache = {
        match: async request => { activity.matched.push(request); return new Response('stale clinical material'); },
        put: async () => { if(options.putFails) throw Error("quota"); }, add: async () => {}
    };
    const keys = [];
    const context = vm.createContext({
        URL, Request, Response, Promise,
        self: {
            location: { origin: 'https://sirasitragtong-cmd.github.io' },
            addEventListener: (type, callback) => handlers.set(type, callback),
            clients: { claim: async () => { activity.claimed++; } },
            skipWaiting: async () => {}
        },
        caches: {
            keys: async () => keys,
            open: async name => { activity.opened.push(name); if(options.openFails) throw Error("storage unavailable"); return cache; },
            delete: async name => { activity.deleted.push(name); return true; }
        },
        fetch: async request => { activity.fetched.push(request); return new Response('network material'); }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context, { filename: 'sw.js' });
    return {
        activity, keys,
        cacheName: vm.runInContext('CACHE_NAME', context),
        async activate() {
            let completion;
            handlers.get('activate')({ waitUntil: promise => { completion = promise; } });
            assert.ok(completion, 'activation work must be registered with waitUntil');
            await completion;
        },
        fetch(url, method = 'GET') {
            let response;
            handlers.get('fetch')({ request: { url, method, mode: 'cors' }, respondWith: value => { response = value; } });
            return response;
        }
    };
}

test('worker activation removes old app caches and preserves current and unrelated caches', async () => {
    const s = worker();
    s.keys.push(s.cacheName, 'pharmsim-202608060958', 'pharmsim-202610250827', 'another-app-v1', 'pharmsimilar-v1', 'user-content');
    await s.activate();
    assert.deepEqual(s.activity.deleted.sort(), ['pharmsim-202608060958', 'pharmsim-202610250827'].sort());
    assert.equal(s.activity.claimed, 1);
    assert.equal(s.activity.opened.length, 0);
});

test('retired case URLs return 410 before cache or network access, including version queries', async () => {
    const s = worker();
    for (const file of ['case_001.json', 'case_001.en.json?v=202608060958', 'case_001.json?v=latest']) {
        const response = await s.fetch('https://sirasitragtong-cmd.github.io/Clinical-case-simulator/data/' + file);
        assert.ok(response, 'retired request must be handled explicitly');
        assert.equal(response.status, 410);
        assert.doesNotMatch(await response.text(), /stale clinical material|network material/);
    }
    assert.deepEqual(s.activity.opened, []);
    assert.deepEqual(s.activity.matched, []);
    assert.deepEqual(s.activity.fetched, []);
});

test('Firebase and other cross-origin requests are untouched, even if path matches a retired route', () => {
    const s = worker();
    for (const url of [
        'https://firestore.googleapis.com/v1/projects/example/databases/(default)/documents/attempts',
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
        'https://example.org/data/case_001.json'
    ]) assert.equal(s.fetch(url), undefined, url + ' must not be intercepted');
    assert.equal(s.fetch('https://sirasitragtong-cmd.github.io/Clinical-case-simulator/data/case_001.json', 'POST'), undefined);
    assert.deepEqual(s.activity.opened, []);
    assert.deepEqual(s.activity.fetched, []);
    assert.deepEqual(s.activity.matched, []);
});

test('new game scripts contain no audio constructors or backend scoring access', () => {
    for (const file of ['js/game-hub.js', 'js/clinic-room.js']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        assert.doesNotMatch(source, /\b(?:AudioContext|webkitAudioContext)\b|\bnew\s+Audio\s*\(/, file + ' must remain silent');
    }
    const hub = fs.readFileSync(path.join(root, 'js/game-hub.js'), 'utf8');
    assert.doesNotMatch(hub, /\bDBService\b|\b(?:saveAttempt|getLeaderboard|getUserAttempts|getAllAttempts)\s*\(|\bfirebase\s*\.\s*(?:firestore|database)\s*\(/,
        'sandbox missions and empty ranking scaffolds must not access attempt records');
});

test('successful network response survives cache quota and storage errors',async()=>{for(const options of [{putFails:true},{openFails:true}]){const s=worker(options);const r=await s.fetch('https://sirasitragtong-cmd.github.io/Clinical-case-simulator/index.html');assert.equal(r.status,200);assert.equal(await r.text(),'network material');}});
