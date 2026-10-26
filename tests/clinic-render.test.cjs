'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function scene(){
 const pixels=new Array(480*300),jobs=new Map();let id=0;
 const ctx={fillStyle:'',fillRect(x,y,w,h){for(let yy=Math.max(0,y);yy<Math.min(300,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(480,x+w);xx++)pixels[yy*480+xx]=this.fillStyle;}};
 const window={matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:f=>{jobs.set(++id,f);return id;},cancelAnimationFrame:i=>jobs.delete(i),dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/clinic-room.js'),'utf8'),{window,document:{hidden:false,getElementById:()=>({style:{},getContext:()=>ctx,addEventListener(){}}),addEventListener(){}},CustomEvent:class{}});
 const paint=()=>{const list=[...jobs.values()];jobs.clear();list.forEach(f=>f(100));};paint();
 return{pixel:(x,y)=>pixels[y*480+x],api:window.ClinicRoom,paint};
}
test('patient has two visible dark eyes at rest and after arriving',()=>{const s=scene();for(const room of [null,'reception','exam','pharmacy']){if(room){s.api.selectRoom(room);s.paint();}const p=s.api.getState().patient;assert.equal(p.face,'down');assert.equal(s.pixel(p.x-4,p.y-20),'#172d2c');assert.equal(s.pixel(p.x+3,p.y-20),'#172d2c');}});
test('foreground trees cover fence rails while adjacent fence remains visible',()=>{const s=scene();assert.equal(s.pixel(72,289),'#4d7354');assert.equal(s.pixel(401,289),'#4d7354');assert.equal(s.pixel(103,288),'#c3a377');});
test('reception counter occludes staff feet and floor tiles stay within right wall',()=>{const s=scene();assert.equal(s.pixel(92,115),'#c09d70');assert.equal(s.pixel(436,80),'#8ba27b');});
