/* PharmVille living hospital. Deterministic local simulation; no clinical decisions. */
(() => {
'use strict';
const W=960,H=600,canvas=document.getElementById('clinic-room');
const rooms={
 exam:{x:28,y:45,w:220,h:210,door:138,label:'อายุรกรรม',color:'#d9edf1',side:'top'},
 orthopedics:{x:256,y:45,w:220,h:210,door:366,label:'ออร์โธปิดิกส์',color:'#e6e3f3',side:'top'},
 pediatrics:{x:484,y:45,w:220,h:210,door:594,label:'กุมารเวชกรรม',color:'#fae7cc',side:'top'},
 ward:{x:712,y:45,w:220,h:210,door:822,label:'หอผู้ป่วย',color:'#dcebd8',side:'top'},
 reception:{x:28,y:350,w:238,h:210,door:147,label:'เวชระเบียน / รับบริการ',color:'#f3e9d6',side:'bottom'},
 pharmacy:{x:278,y:350,w:420,h:210,door:488,label:'แผนกเภสัชกรรม',color:'#daeee5',side:'bottom'},
 lab:{x:710,y:350,w:222,h:210,door:821,label:'ห้องปฏิบัติการ',color:'#dce9f6',side:'bottom'},
 waiting:{x:400,y:260,w:250,h:80,door:520,label:'โถงพักคอย',side:'hall'}
};
const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
let reduced=!!motion?.matches,paused=false,active=true,destroyed=false,controlled=false,raf=null,last=null,ambientTime=0,dirty=true,target=null,taskToken=0;
let ctx=null;try{ctx=canvas?.getContext('2d')||null;}catch(_){}
if(canvas){canvas.width=W;canvas.height=H;canvas.style.imageRendering='pixelated';}
if(ctx)ctx.imageSmoothingEnabled=false;
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
const actors=[];
function actor(id,role,x,y,room,shirt,skin='#e5b184'){const a={id,role,x,y,room,shirt,skin,path:[],wait:2+actors.length*.65,step:0,face:'down',speech:'',speechUntil:0,destination:null,completion:null,cycle:0};actors.push(a);return a;}
const pharmacist=actor('pharmacist','pharmacist',380,466,'pharmacy','#f8faf4');
actor('doctor','doctor',92,188,'exam','#f6faf6');actor('orthopedist','doctor',315,185,'orthopedics','#f8faf4');
actor('pediatrician','doctor',650,185,'pediatrics','#fbfaf4');actor('nurse','nurse',870,190,'ward','#9dd9e5');
actor('registrar','staff',92,454,'reception','#8acac3');actor('labtech','staff',875,465,'lab','#f6fbff');
const patient=actor('patient','patient',147,315,'waiting','#e0a167');
for(let i=0;i<6;i++)actor('visitor-'+i,'patient',305+i*68,315,'waiting',['#8ba7d2','#cf8d9d','#b6bd74','#a499d0','#7db1ad','#dcb773'][i],i%2?'#bd8b69':'#edc5a0');
const isTop=r=>r?.side==='top';
function endPoint(room,a){const r=rooms[room];if(!r||r.side==='hall')return{x:390+(actors.indexOf(a)%5)*48,y:315};return{x:r.door+(a.role==='patient'?(actors.indexOf(a)%3-1)*18:0),y:isTop(r)?213:408};}
function say(a,text){a.speech=text;a.speechUntil=ambientTime+3.6;}
function route(a,room,point,done){
 const r=rooms[room];if(!r)return false;
 const dest=point||endPoint(room,a),current=Object.values(rooms).find(r=>r.side!=='hall'&&a.x>=r.x&&a.x<=r.x+r.w&&a.y>=r.y&&a.y<=r.y+r.h),p=[];
 // Every room joins the central corridor through its visible doorway.
 if(current!==r){if(current&&current.side!=='hall'){const aisle=isTop(current)?213:408;p.push({x:a.x,y:aisle},{x:current.door,y:aisle},{x:current.door,y:300});}else p.push({x:a.x,y:300});
 p.push({x:r.door,y:300});if(r.side!=='hall')p.push({x:r.door,y:isTop(r)?213:408});}
 p.push(dest);a.path=p.filter((v,i)=>i||Math.hypot(v.x-a.x,v.y-a.y)>.1);a.destination=room;a.completion=done||null;
 if((reduced||!ctx)&&!paused){a.x=dest.x;a.y=dest.y;finish(a);}invalidate();return true;
}
function finish(a){a.path=[];a.room=a.destination||a.room;a.destination=null;a.wait=3+(actors.indexOf(a)%4)*1.3;const callback=a.completion;a.completion=null;if(callback)callback();}
function selectRoom(room){if(destroyed||!rooms[room])return false;target=room;emit('clinic:travel',{room});return route(patient,room,null,()=>{if(target===room){target=null;say(patient,'ถึงจุดบริการแล้ว');emit('clinic:visit',{room});}});}
function setControlled(value){controlled=!!value;taskToken++;pharmacist.completion=null;pharmacist.path=[];pharmacist.destination=null;pharmacist.wait=1;say(pharmacist,controlled?'พร้อมรับคำสั่งของคุณ':'เริ่มงานประจำแผนก');invalidate();}
function performTask(task){if(destroyed||!controlled)return false;const token=++taskToken;const spots={review:{x:340,y:440},dispense:{x:480,y:440},counsel:{x:618,y:465},monitor:{x:340,y:440}};say(pharmacist,'กำลังไปปฏิบัติงาน');return route(pharmacist,'pharmacy',spots[task]||spots.review,()=>{if(controlled&&token===taskToken){say(pharmacist,'พร้อมแล้วครับ');emit('clinic:task-arrived',{task});}});}
function stop(){if(raf!==null)window.cancelAnimationFrame(raf);raf=null;last=null;}
function schedule(){if(ctx&&!destroyed&&active&&!document.hidden&&raf===null&&(dirty||(!paused&&!reduced)))raf=window.requestAnimationFrame(frame);}
function invalidate(){dirty=true;schedule();}
function setPaused(value){paused=!!value;stop();if(!paused&&reduced)actors.filter(a=>a.path.length).forEach(a=>{const end=a.path.at(-1);a.x=end.x;a.y=end.y;finish(a);});invalidate();}
function setActive(value){active=!!value;stop();if(active)invalidate();}
function reset(){target=null;taskToken++;actors.forEach(a=>{a.path=[];a.completion=null;a.destination=null;a.wait=2;a.speech='';});patient.x=147;patient.y=315;patient.room='waiting';invalidate();}
function visibility(){stop();if(!document.hidden)invalidate();}
function preference(e){reduced=e.matches;stop();setPaused(paused);invalidate();}
function click(e){const b=canvas.getBoundingClientRect(),x=(e.clientX-b.left)*W/b.width,y=(e.clientY-b.top)*H/b.height;const a=[...actors].reverse().find(a=>Math.abs(a.x-x)<20&&y>a.y-42&&y<a.y+8);if(a){say(a,a.role==='pharmacist'?'คลิกเพื่อสวมบทเภสัชกร':'ยินดีต้อนรับครับ');emit('clinic:role',{role:a.role,name:a.id});invalidate();return;}const r=Object.entries(rooms).find(([,r])=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);if(r)selectRoom(r[0]);}
function destroy(){destroyed=true;stop();document.removeEventListener('visibilitychange',visibility);motion?.removeEventListener?.('change',preference);canvas?.removeEventListener('click',click);}
window.ClinicRoom=Object.freeze({selectRoom,setPaused,isPaused:()=>paused,setActive,reset,destroy,setControlled,performTask,getState:()=>({patient:{x:patient.x,y:patient.y,face:patient.face},target,moving:!!patient.path.length,paused,active,reduced,controlled,ambientTime,staff:actors.filter(a=>a.role!=='patient').map(a=>({id:a.id,x:a.x,y:a.y,kind:a.role})),actors:actors.map(a=>({id:a.id,role:a.role,x:a.x,y:a.y,room:a.room,moving:!!a.path.length,path:a.path.map(p=>({...p}))})),rooms})});
document.addEventListener('visibilitychange',visibility);motion?.addEventListener?.('change',preference);canvas?.addEventListener('click',click);
if(!ctx){canvas?.setAttribute('aria-label','ใช้ปุ่มแผนกและปุ่มสวมบทเภสัชกรเพื่อเล่นโดยไม่ใช้ฉากภาพ');return;}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function box(x,y,w,h,c,b='#4d6466'){rect(x,y,w,h,b);rect(x+2,y+2,w-4,h-4,c);}
function text(s,x,y,size=13,color='#314f5c',align='center'){ctx.font=`600 ${size}px Tahoma, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);}
function plant(x,y){box(x-8,y-7,16,16,'#c49164');rect(x-5,y-5,10,3,'#ecc49b');const w=reduced?0:Math.round(Math.sin(ambientTime*1.2+x)*1.3);rect(x-2+w,y-29,4,25,'#467957');rect(x-12+w,y-24,12,10,'#55946a');rect(x+w,y-33,10,13,'#70ad7d');rect(x-9+w,y-26,5,3,'#9ccc88');}
function monitor(x,y){box(x,y,34,24,'#334d60');rect(x+4,y+4,26,15,'#98d4e2');rect(x+8,y+7,17,2,'#dff6ef');rect(x+8,y+12,12,2,'#54afad');rect(x+14,y+24,6,6,'#567482');rect(x+7,y+29,20,3,'#567482');}
function desk(x,y,w=82){box(x,y,w,26,'#c39b71');rect(x+3,y+3,w-6,5,'#ebcaa2');rect(x+5,y+26,6,13,'#997554');rect(x+w-11,y+26,6,13,'#997554');}
function chair(x,y,c='#8eb9c8'){box(x-12,y-14,24,14,c);box(x-12,y,24,10,c);rect(x-10,y+10,3,7,'#56727c');rect(x+7,y+10,3,7,'#56727c');}
function bed(x,y){box(x,y,48,76,'#f7f8ed');box(x+3,y+4,42,17,'#e7eee9');rect(x+4,y+25,40,43,'#9bcbc9');rect(x+7,y+28,34,4,'#c8e7de');rect(x+3,y+76,4,7,'#6d8790');rect(x+41,y+76,4,7,'#6d8790');}
function cabinet(x,y,w=66,meds=false){box(x,y,w,54,'#b0c6c4');rect(x+4,y+4,w-8,43,'#e3eeea');for(let k=0;k<2;k++){rect(x+4,y+23+k*20,w-8,3,'#8fa8a7');if(meds)for(let j=0;j<5;j++){rect(x+7+j*(w-12)/5,y+9+k*20,6,12,['#79b1b3','#e5b387','#8f9fc6'][j%3]);rect(x+8+j*(w-12)/5,y+8+k*20,4,2,'#edf3ea');}}}
function room(r){box(r.x,r.y,r.w,r.h,r.color,'#87a4a9');rect(r.x+5,r.y+18,r.w-10,r.h-23,'#f2f2e7');for(let x=r.x+6;x<r.x+r.w-5;x+=28)rect(x,r.y+19,1,r.h-25,'#e1e5df');for(let y=r.y+20;y<r.y+r.h-5;y+=28)rect(r.x+5,y,r.w-10,1,'#e1e5df');rect(r.x,r.y,r.w,18,r.color);rect(r.x+4,r.y+18,r.w-8,6,'#c3d5d3');const doorY=isTop(r)?r.y+r.h-6:r.y;rect(r.door-21,doorY,42,8,'#e8e9da');rect(r.door-21,doorY-1,3,9,'#b99c79');rect(r.door+18,doorY-1,3,9,'#b99c79');text(r.label,r.x+r.w/2,r.y+14,13);}
function environment(){rect(0,0,W,H,'#abc7a2');rect(12,32,936,545,'#688a89');rect(18,38,924,533,'#e7e9de');for(let x=20;x<940;x+=32)rect(x,258,1,89,'#d3d9d0');for(let y=260;y<348;y+=29)rect(20,y,920,1,'#d3d9d0');Object.values(rooms).filter(r=>r.side!=='hall').forEach(room);
text('PHARMVILLE  •  HOSPITAL',480,23,17,'#264c49');
['exam','orthopedics','pediatrics'].forEach(id=>{const r=rooms[id];desk(r.x+24,r.y+99,80);monitor(r.x+31,r.y+70);chair(r.x+63,r.y+150);bed(r.x+r.w-69,r.y+56);cabinet(r.x+20,r.y+30,69);plant(r.x+r.w-18,r.y+r.h-24);});
bed(744,100);bed(850,100);cabinet(798,75,43);plant(906,226);
desk(57,467,172);monitor(70,438);rect(169,473,38,18,'#f5f4df');text('REGISTRATION',143,491,11);plant(242,531);
cabinet(300,374,98,true);cabinet(418,374,95,true);cabinet(535,374,140,true);desk(301,473,229);monitor(309,444);rect(396,478,27,17,'#f5f4e8');rect(436,478,20,17,'#8cb7b4');text('PHARMACY',413,492,14,'#345f59');desk(582,483,78);chair(600,455);chair(639,519);text('ให้คำปรึกษา',622,548,11);plant(294,541);plant(680,541);
cabinet(733,374,76);desk(738,476,157);monitor(748,447);for(let i=0;i<4;i++){rect(816+i*15,457,8,17,'#9ecbd6');rect(818+i*15,454,4,4,'#657c91');}plant(909,534);
for(let i=0;i<6;i++)chair(350+i*49,279,'#98b8ba');text('โถงพักคอย',492,340,11,'#6c827e');plant(44,310);plant(908,310);text('ทางเข้า',147,591,12);rect(107,570,80,5,'#e8e4cb');
}
function sprite(a){const x=Math.round(a.x),y=Math.round(a.y),walk=a.path.length?Math.sin(a.step*10):0,bob=Math.abs(walk)>0.7?-1:0;rect(x-11,y+2,22,4,'#b9c6b9');if(controlled&&a===pharmacist){rect(x-15,y+5,30,3,'#e8b735');rect(x-17,y+1,3,5,'#e8b735');rect(x+14,y+1,3,5,'#e8b735');}
rect(x-7,y-11,5,14+(walk>0?1:-1),'#43546b');rect(x+2,y-11,5,14+(walk<0?1:-1),'#43546b');rect(x-9,y+1+(walk>0?1:-1),8,4,'#304256');rect(x+1,y+1+(walk<0?1:-1),8,4,'#304256');
box(x-11,y-27+bob,22,20,a.shirt,'#54666a');rect(x-15,y-24+bob,4,14,a.skin);rect(x+11,y-24+bob,4,14,a.skin);if(a.role==='pharmacist'||a.role==='doctor'){rect(x-1,y-26+bob,2,18,'#9eb8bd');rect(x+4,y-19+bob,5,5,'#79b4aa');}box(x-10,y-44+bob,20,21,a.skin,'#624f42');rect(x-10,y-44+bob,20,6,'#514438');rect(x-12,y-40+bob,4,10,'#514438');rect(x+8,y-40+bob,4,8,'#514438');rect(x-6,y-45+bob,11,3,'#6c5341');const blink=!reduced&&Math.sin(ambientTime*.8+actors.indexOf(a)*2)>0.997;
if(a.face!=='up'){rect(x-5,y-33+bob,3,blink?1:3,'#263c43');rect(x+3,y-33+bob,3,blink?1:3,'#263c43');rect(x-1,y-27+bob,3,1,'#ad7358');}else rect(x-7,y-39+bob,15,12,'#514438');if(a.role==='nurse'){rect(x-10,y-45+bob,20,5,'#f6f6e9');rect(x-1,y-46+bob,3,7,'#ce7d7e');}if(a===pharmacist){const t=reduced?0:Math.round(Math.sin(ambientTime*3)*2);box(x-9,y-66+t,18,16,controlled?'#e8c255':'#70b5a0');text(controlled?'✓':'!',x,y-54+t,13,'#fff');}}
function bubbles(){let count=0;for(const a of actors){if(a.speechUntil<=ambientTime||!a.speech||count>=2)continue;count++;const width=Math.min(168,a.speech.length*7+18),x=Math.max(5,Math.min(W-width-5,a.x-width/2)),y=Math.max(29,a.y-92);box(x,y,width,25,'#fffef3','#8dacab');rect(a.x-3,y+23,7,5,'#fffef3');text(a.speech,x+width/2,y+17,11);}}
function paint(){environment();[...actors].sort((a,b)=>a.y-b.y).forEach(sprite);bubbles();dirty=false;}
function auto(a){if(a===pharmacist&&controlled)return;if(a===patient&&target)return;a.cycle++;if(a.role==='patient'){const destinations=['reception','waiting',actors.indexOf(a)%2?'exam':'pediatrics','waiting','pharmacy','waiting'];const dest=destinations[(a.cycle+actors.indexOf(a))%destinations.length];route(a,dest,null,()=>{if(dest==='waiting')say(a,'นั่งรอเรียกคิวก่อนครับ');else if(dest==='reception')say(a,'สวัสดีครับ มารับบริการ');else if(dest==='pharmacy')say(a,'มารับยาครับ');});}else{const home=a.id==='pharmacist'?'pharmacy':a.id==='doctor'?'exam':a.id==='orthopedist'?'orthopedics':a.id==='pediatrician'?'pediatrics':a.id==='nurse'?'ward':a.id==='labtech'?'lab':'reception';const r=rooms[home];const x=r.x+48+(a.cycle%2)*(r.w-100),y=isTop(r)?197:436;route(a,home,{x,y},()=>{if(a.cycle%3===0)say(a,a===pharmacist?'เตรียมพร้อมให้คำปรึกษา':'เชิญผู้รับบริการครับ');});}}
function advance(dt){ambientTime+=dt;for(const a of actors){if(a.path.length){const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),speed=35+(actors.indexOf(a)%4)*3,step=Math.min(d,speed*dt);a.step+=dt;a.face=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');if(d<=step+.01){a.x=p.x;a.y=p.y;a.path.shift();if(!a.path.length)finish(a);}else{a.x+=dx/d*step;a.y+=dy/d*step;}}else{a.wait-=dt;if(a.wait<=0)auto(a);}}}
function frame(now){raf=null;if(destroyed||!active||document.hidden)return;const dt=last===null?0:Math.min((now-last)/1000,.15);last=now;if(!paused&&!reduced)advance(dt);paint();schedule();}
invalidate();
})();
