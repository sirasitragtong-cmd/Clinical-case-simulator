'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real controller and shell. This DOM double models only their
// catalogue buttons, role dialogs, focus calls and view-change events.
// It does not substitute implementations of renderCaseMap or shell handlers.
function boot({ completed = [], thai = true } = {}) {
    const documentEvents = new Map();
    const windowEvents = new Map();
    const elements = new Map();
    const engineCalls = [];
    const sceneCalls = [];
    const attributes = markup => {
        const result = {};
        for (const match of markup.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) result[match[1]] = match[2] ?? '';
        return result;
    };
    const dataKey = attr => attr.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    function element(id, attrs = {}) {
        const listeners = new Map();
        const classes = new Set((attrs.class || '').split(/\s+/));
        const el = {
            id, attrs, dataset: {}, style: { setProperty(name, value) { this[name] = value; } },
            textContent: '', open: false, scrollCount: 0, focusCount: 0,
            disabled: Object.hasOwn(attrs, 'disabled'),
            classList: { add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
            setAttribute(name, value) { this.attrs[name] = value; },
            addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
            scrollIntoView() { this.scrollCount++; }, focus() { this.focusCount++; },
            showModal() { this.open = true; }, close() { this.open = false; },
            closest(selector) {
                if (selector.startsWith('[')) return Object.hasOwn(this.attrs, selector.slice(1, -1)) ? this : null;
                if (selector.startsWith('.')) return classes.has(selector.slice(1)) ? this : null;
                return null;
            },
            click() {
                if (this.disabled) return;
                const event = { target: this };
                for (const handler of listeners.get('click') || []) handler.call(this, event);
                for (const handler of documentEvents.get('click') || []) handler(event);
            }
        };
        for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) el.dataset[dataKey(key)] = value;
        return el;
    }
    const add = (id, attrs) => { const el = element(id, attrs); elements.set(id, el); return el; };
    ['login-view', 'dashboard-view', 'simulation-view', 'game-content-area',
        'pv-role-dialog', 'pv-role-dialog-title', 'pv-open-work'].forEach(id => add(id));
    const track = add('quest-track');
    let html = '', buttons = [];
    Object.defineProperty(track, 'innerHTML', {
        get() { return html; },
        set(value) {
            html = value;
            buttons = Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g), match => {
                const button = element('', attributes(match[1]));
                button.textContent = match[2].trim();
                return button;
            });
        }
    });
    track.insertAdjacentHTML = (position, content) => {
        assert.equal(position, 'beforeend'); track.innerHTML = html + content;
    };
    track.querySelectorAll = selector => buttons.filter(button => button.closest(selector));
    const roles = ['pharmacist', 'doctor', 'nurse', 'dentist'].map(role => add('role-' + role, { 'data-pv-role': role }));
    const I18n = { isThai: () => thai, t: key => key, applyStatic() {}, initSwitcher() {} };
    const document = {
        body: { style: {} },
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: selector => selector === '[data-pv-role]' ? roles : [],
        addEventListener(name, handler) { if (!documentEvents.has(name)) documentEvents.set(name, []); documentEvents.get(name).push(handler); }
    };
    class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
    const window = {
        I18n, scrollTo() {},
        HospitalScene: { setActive: value => sceneCalls.push(['active', value]), selectStation: value => sceneCalls.push(['station', value]) },
        addEventListener(name, handler) { if (!windowEvents.has(name)) windowEvents.set(name, []); windowEvents.get(name).push(handler); },
        dispatchEvent(event) { for (const handler of windowEvents.get(event.type) || []) handler(event); }
    };
    const GameEngine = new Proxy({}, { get: (_, name) => (...args) => engineCalls.push([name, ...args]) });
    const context = vm.createContext({ window, document, I18n, GameEngine, CustomEvent, console,
        localStorage: { getItem: key => key === 'ccs_progress_v1' ? JSON.stringify({ completed }) : null },
        setTimeout: () => 1, clearTimeout() {}, matchMedia: () => ({ matches: false }) });
    for (const file of ['js/ui-controller.js', 'js/pharmville-shell.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    return { ui: window.UIController, window, elements, track, buttons: () => buttons,
        slots: () => Array.from(html.matchAll(/data-case-slot="(\d+)"/g), match => Number(match[1])),
        engineCalls, sceneCalls };
}
const cases = count => Array.from({ length: count }, (_, index) => ({
    case_id: 'case_' + (index + 1), map_title: 'Presenting complaint ' + (index + 1),
    patient: { chief_complaint: 'Synthetic test complaint' },
    stages: { stage: { steps: { first: { type: 'info', point_value: 10 } } } }
}));

for (const count of [0, 1, 2, 4]) {
    test(`catalogue with ${count} cases renders exactly two slots and starts only real cases`, () => {
        const fixture = cases(count);
        const s = boot({ completed: ['case_1'] });
        const started = [];
        s.ui.renderCaseMap(fixture, item => started.push(item));
        assert.deepEqual(s.slots(), [1, 2]);
        const launchers = s.buttons().filter(button => Object.hasOwn(button.dataset, 'caseIndex'));
        assert.equal(launchers.length, Math.min(count, 2));
        for (const button of s.buttons().filter(button => !Object.hasOwn(button.dataset, 'caseIndex'))) button.click();
        assert.equal(started.length, 0, 'placeholder and retry controls must never start a case');
        if (count < 2) {
            const unavailable = s.buttons().filter(button => button.disabled);
            assert.equal(unavailable.length, 1, 'reserved second case remains disabled');
            assert.ok(unavailable.every(button => !Object.hasOwn(button.dataset, 'caseIndex')));
        }
        launchers.forEach(button => button.click());
        assert.equal(started.length, Math.min(count, 2));
        started.forEach((item, index) => assert.strictEqual(item, fixture[index], 'preserve original callback and case identity'));
        assert.equal(s.engineCalls.length, 0, 'catalogue delegates to callback, not an extra engine start');
    });
}

test('catalogue rerender replaces previous callbacks and discarded case cards', () => {
    const s = boot(); const first = cases(1), replacement = cases(1);
    const oldStarts = [], newStarts = [];
    s.ui.renderCaseMap(first, item => oldStarts.push(item));
    s.ui.renderCaseMap(replacement, item => newStarts.push(item));
    s.buttons().find(button => Object.hasOwn(button.dataset, 'caseIndex')).click();
    assert.deepEqual(oldStarts, []); assert.strictEqual(newStarts[0], replacement[0]);
    s.ui.renderCaseMap([], item => newStarts.push(item));
    assert.deepEqual(s.slots(), [1, 2]);
    s.buttons().forEach(button => button.click());
    assert.equal(newStarts.length, 1);
});

test('locked professional roles open information dialog without starting any game', () => {
    const s = boot(); const started = [];
    s.ui.renderCaseMap(cases(1), item => started.push(item));
    for (const [role, title] of [['doctor', 'แพทย์'], ['nurse', 'พยาบาล'], ['dentist', 'ทันตแพทย์']]) {
        s.elements.get('role-' + role).click();
        assert.equal(s.elements.get('pv-role-dialog').open, true);
        assert.equal(s.elements.get('pv-role-dialog-title').textContent, title);
        s.elements.get('pv-role-dialog').close();
    }
    assert.equal(started.length, 0); assert.equal(s.engineCalls.length, 0);
    assert.deepEqual(s.sceneCalls, [['active', false]]);
});

test('pharmacist role focuses catalogue or existing work instead of starting another case', () => {
    const s = boot();
    s.ui.navigateTo('dashboard'); s.elements.get('role-pharmacist').click();
    assert.equal(s.track.scrollCount, 1);
    assert.equal(s.elements.get('pv-role-dialog').open, false);
    s.ui.navigateTo('game'); s.elements.get('role-pharmacist').click();
    assert.equal(s.elements.get('game-content-area').focusCount, 1);
    assert.deepEqual(s.sceneCalls.at(-1), ['station', 'pharmacy']);
    assert.equal(s.engineCalls.length, 0);
});

test('scene is active only for game view and view transitions close role dialogs', () => {
    const s = boot();
    assert.deepEqual(s.sceneCalls, [['active', false]], 'login boot suspends scene');
    for (const view of ['dashboard', 'game', 'dashboard', 'login', 'game', 'unknown']) {
        s.elements.get('role-doctor').click();
        assert.equal(s.elements.get('pv-role-dialog').open, true);
        s.ui.navigateTo(view);
        assert.deepEqual(s.sceneCalls.at(-1), ['active', view === 'game']);
        assert.equal(s.elements.get('pv-role-dialog').open, false);
    }
    assert.equal(s.engineCalls.length, 0);
});

test('empty catalogue retry emits reload request without case launch', () => {
    const s = boot(); let retries = 0, starts = 0;
    s.window.addEventListener('pharmville:retrycases', () => retries++);
    s.ui.renderCaseMap([], () => starts++);
    const retry = s.buttons().find(button => Object.hasOwn(button.dataset, 'pvRetryCases'));
    assert.ok(retry); assert.equal(retry.disabled, false); retry.click();
    assert.equal(retries, 1); assert.equal(starts, 0); assert.equal(s.engineCalls.length, 0);
});
