'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/game-hub.js'), 'utf8');
function harness() {
    const nodes = {}, events = {}, listeners = {}, calls = [];
    function node(id, dataset = {}) {
        const classes = new Set();
        return nodes[id] = { id, dataset, textContent: '', innerHTML: '', attrs: {}, style: {},
            classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, contains: k => classes.has(k) },
            setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
            closest() { return this; }, focus() { this.focused = true; }, scrollIntoView() {}, showModal() { this.open = true; } };
    }
    'clinic-room room-title room-caption tour-button motion-button mission-start mission-reset mission-progress mission-progress-fill mission-list stage-list ranking-list player-name login-button logout-button toast info-dialog dialog-title dialog-copy service-button game-status'.split(' ').forEach(id => node(id));
    const panels = ['hub','missions','stages','ranking'].map(x => node('panel-'+x,{panel:x}));
    const nav = ['hub','missions','stages','ranking'].map(x => node('nav-'+x,{view:x}));
    const buttons = ['reception','exam','pharmacy'].map(x => node('room-'+x,{room:x}));
    let user = null, destination = null;
    const forbidden = () => { throw Error('Unexpected clinical fetch or persistence'); };
    const emit = (name, room) => listeners[name]?.({detail:{room}});
    const window = {
        addEventListener: (k,f) => listeners[k] = f,
        matchMedia: () => ({matches:false}),
        ClinicRoom: {
            selectRoom(room) { destination = room; calls.push(['travel',room]); emit('clinic:travel',room); },
            reset() { destination = null; calls.push(['reset']); },
            setPaused(p) { calls.push(['paused',p]); },
            setActive(a) { calls.push(['active',a]); }
        },
        DBService: new Proxy({}, {get:forbidden}),
        AuthService: {getCurrentUser: () => user, async loginWithGoogle() {user={displayName:'<img onerror=alert(1)>',isAnonymous:false};},async logout(){user=null;},loginAnonymously:forbidden},
        authReadyPromise: Promise.resolve()
    };
    vm.runInNewContext(source, {window, navigator:{},setTimeout:()=>1,clearTimeout:()=>{}, document:{
        getElementById: id => nodes[id] || null,
        querySelectorAll: s => s==='[data-panel]'?panels:s==='[data-view]'?nav:s==='[data-room]'?buttons:[],
        addEventListener: (k,f) => events[k]=f
    },fetch:forbidden,localStorage:new Proxy({},{get:forbidden}),sessionStorage:new Proxy({},{get:forbidden}),console});
    return {nodes,calls,window,click:(id,dataset)=>events.click({target:dataset?node(id,dataset):nodes[id]}),arrive:(room=destination)=>emit('clinic:visit',room),progress:()=>nodes['mission-progress'].textContent};
}
test('initial game awaits start with two locked clinical stages and no ranking records', () => {
    const h=harness(),n=h.nodes;
    assert.equal(h.progress(),'0 / 3');assert.equal(n['service-button'].disabled,true);
    assert.equal((n['stage-list'].innerHTML.match(/data-stage=/g)||[]).length,2);
    assert.match(n['ranking-list'].innerHTML,/ยังไม่มีอันดับคะแนน/);
    assert.equal(n['panel-hub'].hidden,false);assert.equal(n['player-name'].textContent,'ผู้เยี่ยมชม');
});
test('full round requires physical arrival and explicit service at all three stations', () => {
    const h=harness(),n=h.nodes;h.click('mission-start');
    assert.equal(h.progress(),'0 / 3');assert.equal(n['service-button'].disabled,true);
    for(const [i,room] of ['reception','exam','pharmacy'].entries()) {
        if(i)h.click('room-'+room);
        h.click('service-button');assert.equal(h.progress(),i+' / 3');
        h.arrive();assert.equal(n['service-button'].disabled,false);assert.equal(h.progress(),i+' / 3');
        h.click('service-button');assert.equal(h.progress(),(i+1)+' / 3');
        h.click('service-button');assert.equal(h.progress(),(i+1)+' / 3');
    }
    assert.equal(n['info-dialog'].open,true);assert.match(n['dialog-title'].textContent,/จบรอบ/);
    assert.equal(n['mission-progress-fill'].style.width,'100%');
    assert.match(n.toast.textContent,/ไม่มีการบันทึกคะแนน/);
    h.click('mission-start');assert.equal(h.progress(),'0 / 3');assert.equal(n['service-button'].disabled,true);
});
test('wrong destinations, stale arrivals and repeated clicks never advance tasks', () => {
    const h=harness();h.click('mission-start');h.click('room-exam');h.arrive('reception');
    assert.equal(h.nodes['service-button'].disabled,true);h.arrive('exam');h.click('service-button');
    assert.equal(h.progress(),'0 / 3');assert.match(h.nodes.toast.textContent,/ยังไม่ใช่/);
    h.click('room-reception');h.arrive();h.click('service-button');assert.equal(h.progress(),'1 / 3');
    h.arrive('reception');h.click('service-button');assert.equal(h.progress(),'1 / 3');
});
test('reset cancels travel and stale arrival cannot unlock service until a new round starts', () => {
    const h=harness();h.click('mission-start');h.click('mission-reset');h.arrive('reception');h.click('service-button');
    assert.equal(h.progress(),'0 / 3');assert.equal(h.nodes['service-button'].disabled,true);
    h.click('room-reception');h.arrive();assert.equal(h.nodes['service-button'].disabled,true);
    h.click('mission-start');h.arrive();assert.equal(h.nodes['service-button'].disabled,false);
});
test('locked roles and stages explain unavailable content without starting a round', () => {
    const h=harness();for(const role of ['doctor','nurse','dentist']){h.nodes['info-dialog'].open=false;h.click('role',{role});assert.equal(h.nodes['info-dialog'].open,true);assert.match(h.nodes['dialog-title'].textContent,/ยังไม่เปิด/);}
    h.click('stage',{stage:'2'});assert.match(h.nodes['dialog-title'].textContent,/เคสที่ 2/);assert.equal(h.progress(),'0 / 3');
});
test('navigation suspends world; pause/resume and primary start control are functional', () => {
    const h=harness(),n=h.nodes;h.click('nav-ranking');assert.equal(n['panel-ranking'].hidden,false);assert.equal(n['panel-hub'].inert,true);
    assert.equal(n['nav-ranking'].attrs['aria-current'],'page');assert.deepEqual(h.calls.at(-1),['active',false]);
    h.click('nav-hub');h.click('motion-button');assert.equal(n['motion-button'].attrs['aria-pressed'],'true');
    h.click('motion-button');assert.equal(n['motion-button'].attrs['aria-pressed'],'false');
    h.click('tour-button');assert.equal(n['clinic-room'].focused,true);assert.equal(n['panel-hub'].hidden,false);assert.equal(h.progress(),'0 / 3');
});
test('optional auth uses safe text without anonymous account creation or score persistence', async () => {
    const h=harness();await Promise.resolve();h.click('login-button');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.nodes['player-name'].textContent,'<img onerror=alert(1)>');assert.equal(h.nodes['player-name'].innerHTML,'');
    assert.equal(h.nodes['login-button'].hidden,true);h.click('logout-button');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.nodes['player-name'].textContent,'ผู้เยี่ยมชม');
});
