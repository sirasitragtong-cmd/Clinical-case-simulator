'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/clinic-room.js'),'utf8');
function harness({reduced=false,noCanvas=false}={}){
 const jobs=new Map(),events=[],listeners={},canvasEvents={};let counter=0,time=0;
 const ctx={fillRect(){},fillText(){}};
 const canvas={style:{},getContext:()=>noCanvas?null:ctx,setAttribute(){},addEventListener:(n,f)=>canvasEvents[n]=f,removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:300})};
 const document={hidden:false,getElementById:()=>canvas,addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}};
 const window={matchMedia:()=>({matches:reduced,addEventListener(){},removeEventListener(){}}),requestAnimationFrame:f=>{jobs.set(++counter,f);return counter},cancelAnimationFrame:id=>jobs.delete(id),dispatchEvent:e=>events.push(e)};
 vm.runInNewContext(source,{window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}}});
 function tick(n=1,interval=16){for(let i=0;i<n;i++){time+=interval;const callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(fn=>fn(time));}}
 return{api:window.ClinicRoom,events,jobs,document,listeners,canvasEvents,tick};
}
test('arrival only fires after continuous corridor travel; staff remain fixed',()=>{
 const h=harness(),staff=JSON.stringify(h.api.getState().staff);h.tick();assert.equal(h.events.length,0);h.api.selectRoom('reception');assert.equal(h.events.filter(e=>e.type==='clinic:visit').length,0);
 let previous=h.api.getState().patient;
 for(let i=0;i<420;i++){h.tick();const p=h.api.getState().patient;assert(Math.hypot(p.x-previous.x,p.y-previous.y)<=.7);assert(p.y>=173);if(p.y<204.99)assert(Math.abs(p.x-112)<.01);previous=p;}
 assert.equal(h.events.filter(e=>e.type==='clinic:visit').length,1);assert.equal(h.events.at(-1).detail.room,'reception');assert.equal(JSON.stringify(h.api.getState().staff),staff);assert.equal(h.jobs.size,0);
});
test('reroute has no position jump and never completes stale destination',()=>{
 const h=harness();h.api.selectRoom('reception');h.tick(140);const before=h.api.getState().patient;h.api.selectRoom('pharmacy');assert.deepEqual(h.api.getState().patient,before);h.tick(650);assert.deepEqual(h.events.filter(e=>e.type==='clinic:visit').map(e=>e.detail.room),['pharmacy']);
});
test('manual pause, inactive panel and hidden document freeze travel then resume',()=>{
 const h=harness();h.api.selectRoom('exam');h.tick(35);h.api.setPaused(true);h.tick();const p=JSON.stringify(h.api.getState().patient);h.tick(50);assert.equal(JSON.stringify(h.api.getState().patient),p);h.api.setPaused(false);h.api.setActive(false);h.tick(50);assert.equal(JSON.stringify(h.api.getState().patient),p);h.api.setActive(true);h.document.hidden=true;h.listeners.visibilitychange();h.tick(50);assert.equal(JSON.stringify(h.api.getState().patient),p);h.document.hidden=false;h.listeners.visibilitychange();h.tick(250);assert.equal(h.events.at(-1).type,'clinic:visit');
});
test('reduced motion only arrives on user selection; manual pause still defers arrival',()=>{
 const h=harness({reduced:true});h.tick(50);assert.equal(h.events.length,0);h.api.selectRoom('exam');assert.deepEqual(h.events.map(e=>e.type),['clinic:travel','clinic:visit']);h.api.setPaused(true);h.api.selectRoom('pharmacy');assert.equal(h.events.at(-1).type,'clinic:travel');h.api.setPaused(false);assert.equal(h.events.at(-1).type,'clinic:visit');
});
test('reset cancels old arrival; invalid room ignored; canvas clicks and fallback remain functional',()=>{
 const h=harness();assert.equal(h.api.selectRoom('invalid'),false);h.api.selectRoom('reception');h.tick(10);h.api.reset();h.tick(400);assert.equal(h.events.filter(e=>e.type==='clinic:visit').length,0);assert.equal(h.api.getState().patient.y,266);h.canvasEvents.click({clientX:240,clientY:130});h.tick(300);assert.equal(h.events.at(-1).detail.room,'exam');h.api.destroy();assert.equal(h.api.selectRoom('pharmacy'),false);
 const fallback=harness({noCanvas:true});fallback.api.selectRoom('reception');assert.equal(fallback.events.at(-1).type,'clinic:visit');
});

test('low frame rate preserves walking speed without skipping arrival',()=>{
 const h=harness();h.api.selectRoom('reception');h.tick(7,1000);assert.equal(h.events.at(-1).type,'clinic:visit');assert.equal(h.events.at(-1).detail.room,'reception');assert.equal(h.api.getState().moving,false);
});
