'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/clinic-room.js'),'utf8');
function harness({reduced=false,noCanvas=false}={}){
 const jobs=new Map(),events=[],listeners={},canvasEvents={};let counter=0,time=0;
 const ctx={fillRect(){},fillText(){}};
 const canvas={style:{},getContext:()=>noCanvas?null:ctx,setAttribute(){},addEventListener:(n,f)=>canvasEvents[n]=f,removeEventListener(){},getBoundingClientRect:()=>({left:10,top:20,width:480,height:300})};
 const document={hidden:false,getElementById:()=>canvas,addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}};
 const window={matchMedia:()=>({matches:reduced,addEventListener(){},removeEventListener(){}}),requestAnimationFrame:f=>{jobs.set(++counter,f);return counter},cancelAnimationFrame:id=>jobs.delete(id),dispatchEvent:e=>events.push(e)};
 vm.runInNewContext(source,{window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}}});
 function tick(n=1,interval=100){for(let i=0;i<n;i++){time+=interval;const callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(fn=>fn(time));}}
 return{api:window.ClinicRoom,events,jobs,document,listeners,canvasEvents,tick};
}
test('scaled map hit coordinates select the pharmacist',()=>{const h=harness();h.canvasEvents.click({clientX:10+380/2,clientY:20+440/2});assert.equal(h.events.at(-1).type,'clinic:role');assert.equal(h.events.at(-1).detail.role,'pharmacist');});
test('reduced motion respects manual pause and resumes pending arrival',()=>{const h=harness({reduced:true});h.api.setPaused(true);h.api.selectRoom('lab');assert.equal(h.events.at(-1).type,'clinic:travel');h.api.setPaused(false);assert.equal(h.events.at(-1).type,'clinic:visit');assert.equal(h.events.at(-1).detail.room,'lab');});
test('reset cancels guided arrival even while ambient activity continues',()=>{const h=harness();h.api.selectRoom('lab');h.tick(5);h.api.reset();h.tick(200);assert.equal(h.events.filter(e=>e.type==='clinic:visit').length,0);assert.equal(h.api.getState().target,null);assert(h.api.getState().ambientTime>0);});
test('invalid room and destroyed world reject navigation',()=>{const h=harness();assert.equal(h.api.selectRoom('invalid'),false);h.api.destroy();assert.equal(h.api.selectRoom('exam'),false);assert.equal(h.api.performTask('review'),false);assert.equal(h.jobs.size,0);});
test('low frame rate clamps movement steps rather than skipping through rooms',()=>{const h=harness();h.api.selectRoom('lab');h.tick();let p=h.api.getState().patient;for(let i=0;i<20;i++){h.tick(1,1000);const n=h.api.getState().patient;assert(Math.hypot(n.x-p.x,n.y-p.y)<=7);p=n;}assert.equal(h.events.filter(e=>e.type==='clinic:visit').length,0);h.tick(300);assert.equal(h.events.filter(e=>e.type==='clinic:visit').length,1);});
