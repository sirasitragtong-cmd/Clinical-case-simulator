'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function scene(){
 const pixels=new Array(960*600),jobs=new Map(),labels=[];let id=0;
 const ctx={fillStyle:'',fillText(s){labels.push(s);},fillRect(x,y,w,h){for(let yy=Math.max(0,Math.ceil(y));yy<Math.min(600,y+h);yy++)for(let xx=Math.max(0,Math.ceil(x));xx<Math.min(960,x+w);xx++)pixels[yy*960+xx]=this.fillStyle;}};
 const window={matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:f=>{jobs.set(++id,f);return id;},cancelAnimationFrame:i=>jobs.delete(i),dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/clinic-room.js'),'utf8'),{window,document:{hidden:false,getElementById:()=>({style:{},getContext:()=>ctx,addEventListener(){}}),addEventListener(){}},CustomEvent:class{}});
 const paint=()=>{const list=[...jobs.values()];jobs.clear();list.forEach(f=>f(100));};paint();
 return{pixel:(x,y)=>pixels[y*960+x],api:window.ClinicRoom,paint,labels};
}
test('patient has two visible eyes and pharmacy actor is identifiable',()=>{const s=scene(),p=s.api.getState().patient;assert.equal(s.pixel(p.x-5,p.y-33),'#263c43');assert.equal(s.pixel(p.x+3,p.y-33),'#263c43');assert(s.labels.includes('!'));});
test('all clinical departments receive labels and central hallway is rendered',()=>{const s=scene();for(const r of Object.values(s.api.getState().rooms))if(r.side!=='hall')assert(s.labels.includes(r.label));assert.equal(s.pixel(270,300),'#e7e9de');assert.notEqual(s.pixel(10,300),s.pixel(270,300));});
test('controlled pharmacist receives visual selection marker',()=>{const s=scene();s.api.setControlled(true);s.paint();const p=s.api.getState().staff[0];assert.equal(s.pixel(p.x,p.y+6),'#e8b735');assert(s.labels.includes('✓'));});
