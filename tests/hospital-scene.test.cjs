'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../hospital-scene.js'),'utf8');
function boot({reduced=false,noAudio=false,noCanvas=false}={}) {
  const elements=new Map();let clock=0,position,rects=[],contexts=[],nextId=1;const callbacks=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',dataset:{},attrs:{},handlers:{},disabled:false,
      classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},
      addEventListener(k,v){this.handlers[k]=v;}});
    return elements.get(id);
  };
  const destinations=['nurse','doctor','pharmacy'].map(n=>{const e=element(n);e.dataset.destination=n;return e;});
  const context={fillStyle:'',clearRect(){rects=[];},strokeRect(){},fillRect(...args){rects.push([this.fillStyle,...args]);},fillText(text,x,y){if(text==='คนไข้สาธิต')position=[x-5,y+41];}};
  element('map').getContext=()=>noCanvas?null:context;
  const document={hidden:false,handlers:{},getElementById:element,querySelector:()=>element('scene'),querySelectorAll:()=>destinations,addEventListener(k,v){this.handlers[k]=v;}};
  const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};contexts.push(this);}
    createGain(){return {gain:parameter(),connect(){},disconnect(){}};}
    createOscillator(){return {frequency:parameter(),connect(){},disconnect(){},start(){},stop(){}};}
    async resume(){this.state='running';}async suspend(){this.state='suspended';}
  }
  const window=noAudio?{}:{AudioContext};
  vm.runInNewContext(source,{window,document,matchMedia:()=>({matches:reduced,addEventListener(){}}),requestAnimationFrame:fn=>{const id=nextId++;callbacks.set(id,fn);return id;},cancelAnimationFrame:id=>callbacks.delete(id),console});
  const tick=(frames=1)=>{for(let i=0;i<frames;i++){clock+=40;const ready=[...callbacks.values()];callbacks.clear();ready.forEach(fn=>fn(clock));}};
  tick();
  return {element,document,window,contexts,tick,pendingFrames:()=>callbacks.size,position:()=>position,rects:()=>rects,
    click:async id=>element(id).handlers.click({target:element(id)})};
}
test('scene boots without clinical data or auth and audio starts off',()=>{
  const s=boot();assert.deepEqual(s.position(),[440,520]);assert.equal(s.contexts.length,0);s.tick(10);assert(s.position()[1]<520);
});
test('rerouting mid-segment stays continuous and reaches new destination',async()=>{
  const s=boot();s.tick(25);const before=s.position();await s.click('pharmacy');s.tick();const after=s.position();assert(Math.hypot(after[0]-before[0],after[1]-before[1])<4);
  s.tick(400);assert.deepEqual(s.position(),[535,470]);assert.match(s.element('scene-status').textContent,/ถึงห้องยาแล้ว/);
});
test('all staff bodies remain at their stations while patient moves',()=>{
  const s=boot();const coats=()=>s.rects().filter(r=>['#f9f7e9','#e9eee0','#fffceb'].includes(r[0])&&r[3]===28&&r[4]===24);
  const first=coats();assert.equal(first.length,3);s.tick(300);assert.deepEqual(coats(),first);
});
test('manual pause and hidden tab freeze motion without blocking station selection',async()=>{
  const s=boot();s.tick(10);await s.click('motion-toggle');const before=s.position();s.tick(100);assert.deepEqual(s.position(),before);
  s.window.HospitalScene.selectStation('pharmacy');s.tick();assert.deepEqual(s.position(),before);
  await s.click('motion-toggle');s.tick(10);assert.notDeepEqual(s.position(),before);
  s.document.hidden=true;s.document.handlers.visibilitychange();const hidden=s.position();s.tick(100);assert.deepEqual(s.position(),hidden);
});
test('reduced motion starts stationary and explicit play resumes',async()=>{
  const s=boot({reduced:true});s.tick(100);assert.deepEqual(s.position(),[440,520]);await s.click('motion-toggle');s.tick(10);assert(s.position()[1]<520);
});
test('audio toggle, hidden-tab suspend and mute use one context',async()=>{
  const s=boot();await s.click('sound-toggle');assert.equal(s.contexts[0].state,'running');assert.equal(s.element('sound-toggle').attrs['aria-pressed'],'true');
  s.document.hidden=true;s.document.handlers.visibilitychange();assert.equal(s.contexts[0].state,'suspended');
  s.document.hidden=false;s.document.handlers.visibilitychange();assert.equal(s.contexts[0].state,'running');
  await s.click('sound-toggle');assert.equal(s.contexts[0].state,'suspended');await s.click('sound-toggle');assert.equal(s.contexts.length,1);
});
test('unsupported audio fails locally while scene remains usable',async()=>{
  const s=boot({noAudio:true});await s.click('sound-toggle');assert.equal(s.element('sound-toggle').attrs['aria-pressed'],'false');assert.equal(s.element('sound-toggle').disabled,false);s.tick(10);assert(s.position()[1]<520);
});

test('inactive game view cancels frames and audio until reactivated',async()=>{
  const s=boot();await s.click('sound-toggle');s.tick(10);
  s.window.HospitalScene.setActive(false);const before=s.position();
  assert.equal(s.pendingFrames(),0);assert.equal(s.contexts[0].state,'suspended');
  s.tick(100);assert.deepEqual(s.position(),before);
  s.window.HospitalScene.selectStation('pharmacy');assert.equal(s.pendingFrames(),0);
  s.document.hidden=false;s.document.handlers.visibilitychange();assert.equal(s.contexts[0].state,'suspended');
  s.window.HospitalScene.setActive(true);assert.equal(s.pendingFrames(),1);
  assert.equal(s.contexts[0].state,'running');s.tick(10);assert.notDeepEqual(s.position(),before);
});
test('pause draws once and stops scheduling idle frames',async()=>{
  const s=boot();await s.click('motion-toggle');s.tick();assert.equal(s.pendingFrames(),0);
  s.window.HospitalScene.selectStation('pharmacy');assert.equal(s.pendingFrames(),1);s.tick();assert.equal(s.pendingFrames(),0);
});
test('canvas failure leaves a safe integration API and no animation or audio work',()=>{
  const s=boot({noCanvas:true});assert.equal(s.pendingFrames(),0);assert.equal(s.contexts.length,0);
  assert.doesNotThrow(()=>{s.window.HospitalScene.setActive(true);s.window.HospitalScene.selectStation('pharmacy');});
  assert.match(s.element('scene-status').textContent,/ยังใช้งานบทเรียน/);
});
