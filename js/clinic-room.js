/* Original pixel-art clinic. Presentation and travel only; no clinical data or audio. */
(() => {
  'use strict';
  const W=480,H=300,canvas=document.getElementById('clinic-room');
  const rooms={reception:{x:112,y:173,left:49,right:174},exam:{x:240,y:173,left:181,right:301},pharmacy:{x:369,y:173,left:309,right:431}};
  const staff=Object.freeze([{x:92,y:116,kind:'reception'},{x:265,y:113,kind:'doctor'},{x:389,y:116,kind:'pharmacy'}].map(Object.freeze));
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced=Boolean(motion?.matches),paused=false,active=true,destroyed=false,raf=null,last=null,lastPaint=null,dirty=true,target=null,path=[],steps=0,ambientTime=0,walkSpeed=0;
  const patient={x:240,y:266,face:'down'};
  let ctx=null;try{ctx=canvas?.getContext('2d')||null;}catch(_){}
  if(canvas){canvas.width=W;canvas.height=H;canvas.style.imageRendering='pixelated';}
  if(ctx)ctx.imageSmoothingEnabled=false;
  const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const snap=n=>Math.round(n);
  function stop(){if(raf!==null)window.cancelAnimationFrame(raf);raf=null;last=null;lastPaint=null;}
  function schedule(){if(ctx&&!destroyed&&active&&!document.hidden&&raf===null&&(dirty||(!paused&&(!reduced||path.length))))raf=window.requestAnimationFrame(frame);}
  function invalidate(){dirty=true;schedule();}
  function arrived(){const room=target;path=[];target=null;patient.face='down';walkSpeed=0;invalidate();if(room)emit('clinic:visit',{room});}
  function selectRoom(room){
    if(destroyed||!Object.hasOwn(rooms,room))return false;
    const destination=rooms[room];target=room;path=[];
    const atDestination=Math.hypot(patient.x-destination.x,patient.y-destination.y)<.01;
    // All doors meet one unobstructed corridor; reroutes leave the current room first.
    if(!atDestination&&Math.abs(patient.y-205)>.01)path.push({x:patient.x,y:205});
    if(Math.abs(patient.x-destination.x)>.01)path.push({x:destination.x,y:205});
    path.push({x:destination.x,y:destination.y});
    emit('clinic:travel',{room});
    if(((reduced||atDestination)&&!paused)||!ctx){patient.x=destination.x;patient.y=destination.y;arrived();}
    else invalidate();
    return true;
  }
  function setPaused(value){paused=Boolean(value);stop();if(!paused&&reduced&&target){const p=rooms[target];patient.x=p.x;patient.y=p.y;arrived();}invalidate();}
  function setActive(value){active=Boolean(value);stop();if(active)invalidate();}
  function reset(){stop();path=[];target=null;patient.x=240;patient.y=266;patient.face='down';steps=0;walkSpeed=0;invalidate();}
  function visibility(){stop();if(!document.hidden)invalidate();}
  function preference(event){reduced=event.matches;stop();if(reduced&&!paused&&target){const p=rooms[target];patient.x=p.x;patient.y=p.y;arrived();}invalidate();}
  function click(event){const b=canvas.getBoundingClientRect(),x=(event.clientX-b.left)*W/b.width,y=(event.clientY-b.top)*H/b.height;if(y<37||y>193)return;for(const [id,r]of Object.entries(rooms))if(x>=r.left&&x<=r.right){selectRoom(id);break;}}
  function destroy(){destroyed=true;stop();document.removeEventListener('visibilitychange',visibility);motion?.removeEventListener?.('change',preference);canvas?.removeEventListener('click',click);}
  window.ClinicRoom=Object.freeze({selectRoom,setPaused,isPaused:()=>paused,setActive,reset,destroy,getState:()=>({patient:{...patient},target,moving:Boolean(path.length),paused,active,reduced,ambientTime,staff:staff.map(s=>({...s}))})});
  document.addEventListener('visibilitychange',visibility);motion?.addEventListener?.('change',preference);canvas?.addEventListener('click',click);
  if(!ctx){canvas?.setAttribute('aria-label','ฉากภาพไม่พร้อม ใช้ปุ่มเลือกห้องเพื่อทำภารกิจต่อได้');return;}
  const C={ink:'#37453f',grass:'#a9c985',grassLight:'#bfd896',grassDark:'#91b872',path:'#ddc89b',pathLight:'#eddbb5',wall:'#e9dfbd',wallLight:'#fff1cf',wallShade:'#b8b18e',wood:'#ae805b',woodLight:'#d6ac7d',white:'#fff5dc',teal:'#5f9d93',blue:'#8dc3c4',shadow:'#7c986c'};
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(snap(x),snap(y),w,h);}
  function box(x,y,w,h,c,b=C.ink){rect(x,y,w,h,b);rect(x+1,y+1,w-2,h-2,c);}
  // Five-by-seven bitmap lettering stays sharp at the scene's native resolution.
  const glyphs={A:['01110','10001','10001','11111','10001','10001','10001'],C:['01111','10000','10000','10000','10000','10000','01111'],E:['11111','10000','10000','11110','10000','10000','11111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],R:['11110','10001','10001','11110','10100','10010','10001'],T:['11111','00100','00100','00100','00100','00100','00100'],V:['10001','10001','10001','10001','10001','01010','00100'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100']};
  function label(text,x,y,color=C.ink){let left=snap(x-(text.length*6-1)/2);for(const letter of text){const rows=glyphs[letter];if(rows)rows.forEach((row,j)=>{for(let i=0;i<5;i++)if(row[i]==='1')rect(left+i,y+j,1,1,color);});left+=6;}}
  const wind=(x,y,amount=1)=>reduced?0:Math.sin(ambientTime*1.45+x*.043+y*.017)*amount;
  function flower(x,y,c){rect(x,y,1,4,'#698b56');x+=snap(wind(x,y));rect(x-2,y,2,2,c);rect(x+1,y,2,2,c);rect(x,y-2,1,2,c);rect(x,y,1,1,'#f9e3a3');}
  function shrub(x,y){rect(x-7,y+2,15,4,'#789760');x+=snap(wind(x,y,.8));rect(x-8,y-4,17,7,'#638e62');rect(x-5,y-8,11,12,'#6fa477');rect(x-5,y-7,7,3,'#9cc38a');rect(x+3,y-3,4,3,'#7caf7b');rect(x-2,y+1,3,2,'#91bb83');}
  function tree(x,y){rect(x-11,y+8,23,5,'#91ad72');rect(x-3,y,6,16,'#7b6349');rect(x-1,y+1,2,12,'#a78458');x+=snap(wind(x,y,1.5));rect(x-13,y-17,26,23,'#4d7354');rect(x-9,y-24,19,34,'#4d7354');rect(x-16,y-13,32,14,'#4d7354');rect(x-12,y-17,24,20,'#6c9c69');rect(x-8,y-22,16,29,'#6c9c69');rect(x-14,y-11,28,10,'#6c9c69');rect(x-10,y-18,12,6,'#94ba79');rect(x-13,y-10,9,6,'#94ba79');rect(x+1,y-16,7,3,'#81ad70');rect(x+6,y-5,6,6,'#5c8c60');rect(x-2,y+2,5,3,'#81ad70');}
  function plant(x,y){box(x-4,y,9,8,'#b57f56');rect(x-3,y+1,6,2,'#e0b181');rect(x,y-9,1,11,'#5b7650');rect(x-6,y-6,6,4,'#6d9a60');rect(x+1,y-10,5,4,'#7eac68');rect(x-4,y-5,4,1,'#a5c982');}
  function windowArt(x,y){box(x,y,29,26,'#729a9d');rect(x+2,y+2,25,20,'#a2ced0');rect(x+3,y+3,8,5,'#d4e9da');rect(x+17,y+7,8,3,'#d8eadd');rect(x+3,y+16,24,4,'#92b988');rect(x+13,y+1,2,21,'#f8edce');rect(x+1,y+12,27,2,'#f8edce');box(x-2,y+23,33,4,'#c9a474');}
  function sign(x,y,w,text,c){box(x-w/2,y,w,13,C.ink);rect(x-w/2+1,y+1,w-2,11,c);label(text,x,y+3,'#263c32');}
  function stool(x,y,c='#b7abc7'){rect(x-4,y+3,2,9,C.ink);rect(x+3,y+3,2,9,C.ink);box(x-6,y-2,13,7,c);rect(x-4,y-1,9,2,'#e5d8df');}
  function desk(x,y,w){rect(x+2,y+9,w-2,5,'#baa980');box(x,y,w,12,'#c09d70');rect(x+2,y+2,w-4,3,'#efd4a0');rect(x+4,y+12,3,10,C.wood);rect(x+w-7,y+12,3,10,C.wood);}
  function monitor(x,y){box(x,y,16,12,'#425b59');rect(x+2,y+2,12,7,'#9cc9ba');rect(x+3,y+3,7,1,'#cfe6d1');rect(x+3,y+6,9,1,'#78a89e');rect(x+7,y+12,2,4,C.ink);rect(x+4,y+15,8,2,C.ink);}
  function bottle(x,y,c){rect(x+1,y,3,2,C.ink);box(x,y+2,5,9,c);rect(x+1,y+5,3,3,C.white);rect(x+1,y+3,1,2,'#ffffff');}
  function person(x,y,kind='patient',face='down',walking=false){
    const phase=kind==='patient'?1.1:kind==='reception'?2.3:kind==='doctor'?3.6:4.2;
    const idle=!walking&&!reduced;
    const look=idle?(ambientTime+phase)%8:0;
    if(idle&&look>6.3&&look<7.1)face=kind==='patient'?'left':'right';
    const blink=!reduced&&(ambientTime+phase)%4.9>4.79;
    const stride=walking?Math.floor(steps/4)%8:0;
    const swing=walking?[0,1,2,1,0,-1,-2,-1][stride]:0;
    x=snap(x);y=snap(y);
    const hair=kind==='patient'?'#674635':kind==='pharmacy'?'#744638':'#454340';
    const skin=kind==='patient'?'#e6b38a':'#edc59c',shirt=kind==='patient'?'#bd7854':'#f9f3df';
    // Feet and ground shadow stay anchored during breathing; only the torso rises.
    rect(x-6,y,13,2,'#879775');rect(x-4,y-1,9,3,'#90a17c');
    rect(x-3,y-6+swing,3,6,'#3e5867');rect(x+1,y-6-swing,3,6,'#3e5867');
    rect(x-4,y-1+swing,4,2,'#303e40');rect(x+1,y-1-swing,4,2,'#303e40');
    const lift=walking?(stride===2||stride===6?1:0):idle&&Math.sin(ambientTime*2+phase)>.35?1:0;
    y-=lift;
    box(x-5,y-15,11,11,shirt);rect(x-4,y-14,9,2,kind==='patient'?'#e3a479':'#fffceb');
    rect(x-7,y-13+swing,2,7,shirt);rect(x+6,y-13-swing,2,7,shirt);rect(x-7,y-7+swing,2,3,skin);rect(x+6,y-7-swing,2,3,skin);
    if(kind!=='patient'){rect(x,y-13,1,9,'#518b7e');rect(x+2,y-11,3,3,'#799aa4');rect(x+3,y-11,1,1,'#fff8df');}else{rect(x-3,y-8,7,1,'#975e40');rect(x-1,y-13,2,1,'#edbf97');}
    box(x-6,y-26,13,12,skin);rect(x-5,y-27,11,4,hair);rect(x-7,y-24,2,6,hair);rect(x+6,y-24,2,6,hair);rect(x-4,y-27,6,1,'#a27a52');
    rect(x-4,y-16,9,1,'#ce956b');
    if(face==='up'){rect(x-5,y-24,11,8,hair);rect(x-4,y-17,9,2,hair);rect(x-3,y-25,6,1,'#906449');}
    else {
      const eye=(ex)=>{if(blink)rect(ex,y-20,3,1,'#273b39');else{rect(ex,y-22,3,4,'#fff4db');rect(ex+(face==='right'?1:0),y-21,2,3,'#172d2c');rect(ex+(face==='right'?2:0),y-22,1,1,'#ffffff');}};
      if(face!=='right')eye(x-4);if(face!=='left')eye(x+3);
      rect(x-4,y-18,2,1,'#db9a7e');rect(x+3,y-18,2,1,'#db9a7e');rect(x,y-19,1,1,'#bf855f');rect(x-1,y-16,3,1,'#8f5d4c');
      if(face==='right')rect(x+6,y-21,2,3,skin);if(face==='left')rect(x-7,y-21,2,3,skin);
      if(kind==='pharmacy'){rect(x-5,y-22,4,1,'#54554e');rect(x+2,y-22,4,1,'#54554e');rect(x-1,y-21,3,1,'#54554e');}
    }
    if(kind==='reception'){rect(x-6,y-26,13,2,'#80b7a3');rect(x+1,y-28,3,3,C.white);}
  }
  function floors(){
    rect(0,0,W,H,C.grass);
    for(let i=0;i<260;i++){const x=(i*79+17)%W,y=(i*47+13)%H;if(x>40&&x<440&&y>22&&y<230)continue;rect(x,y,2,1,i%3?C.grassLight:C.grassDark);if(i%4===0)rect(x+1,y-2,1,2,C.grassDark);}
    rect(213,221,55,79,C.path);rect(217,224,47,76,C.pathLight);rect(20,255,440,21,C.path);rect(20,259,440,13,C.pathLight);
    for(let i=0;i<30;i++)rect(217+(i*13)%45,225+(i*17)%73,2,1,'#cbb58a');
    rect(42,31,398,201,'#8ba27b');box(45,25,390,201,C.wallShade);rect(49,29,382,194,C.wallLight);
    for(let r=0;r<3;r++){const x=49+r*130;rect(x,65,122,124,['#e9d8be','#d9e5c8','#e9dfbd'][r]);for(let xx=x;xx<x+122;xx+=12)for(let yy=65;yy<189;yy+=12){rect(xx,yy,Math.min(11,x+122-xx),Math.min(11,189-yy),(Math.floor((xx-x)/12)+Math.floor((yy-65)/12))%2?['#e3d1b7','#d0debe','#e3d5b3'][r]:['#edddc3','#dde8cf','#eee2c5'][r]);}}
    rect(49,189,382,34,'#e4d8b9');for(let x=52;x<430;x+=16){rect(x,205,4,1,'#bdc3a0');rect(x,220,8,1,'#d1c4a5');}
    rect(49,29,382,35,C.wall);rect(49,29,382,5,C.wallLight);rect(49,59,382,5,'#b4bb9c');
    for(const x of[174,302]){rect(x,31,7,158,C.wallShade);rect(x,31,3,153,C.wallLight);rect(x+3,34,4,152,'#c6c8a8');}
    rect(45,221,168,5,C.wallShade);rect(268,221,167,5,C.wallShade);rect(214,222,53,4,'#c0ab83');
    for(const [id,r] of Object.entries(rooms)){rect(r.left,184,r.x-r.left-12,5,C.wallShade);rect(r.x+13,184,r.right-r.x-12,5,C.wallShade);rect(r.x-12,184,25,4,'#c6b58e');}
    windowArt(61,34);windowArt(190,34);windowArt(399,34);sign(132,38,62,'','#d0c1d8');sign(261,38,62,'','#bad3bc');sign(357,38,61,'','#e8be8a');
  }
  function furniture(){
    // Reception: counter, records, plants and waiting chairs stay out of the central lane.
    plant(151,77);
    for(let x=63;x<96;x+=15){box(x,153,12,11,'#83a99a');rect(x+1,151,10,6,'#a9c9b6');rect(x+1,165,2,6,C.ink);rect(x+9,165,2,6,C.ink);}
    box(144,140,16,31,'#c3a77b');for(let y=142;y<168;y+=5){rect(146,y,12,1,'#e7cfa3');rect(148,y,2,4,'#8caa98');rect(152,y,3,4,'#b399b6');}
    // Exam bed with pillow, linen folds and curtained privacy screen.
    rect(195,86,31,70,'#b2c4b0');box(197,76,27,70,'#7c9589');rect(199,78,23,64,'#e9edda');box(200,81,21,12,'#fff7e2','#b7c6b2');rect(200,98,21,38,'#8cb9a6');rect(201,100,19,3,'#b0d0b9');rect(203,105,1,27,'#a5cbb7');rect(218,104,1,30,'#6e9e90');rect(198,146,3,9,C.ink);rect(220,146,3,9,C.ink);
    box(275,79,17,31,'#abc8ba');monitor(276,64);rect(276,93,15,1,'#829f92');rect(281,96,4,1,C.ink);stool(267,143);rect(289,119,2,52,'#6f7c70');for(let x=278;x<297;x+=3)rect(x,121,2,40,x%2?'#b3a2c2':'#cfbed5');rect(277,119,20,2,'#747b75');
    // Pharmacy: multiple individually coloured bottles, stocked shelves, work bench.
    box(316,72,104,38,'#9d7d58');for(let y=73;y<=98;y+=13){rect(318,y,100,11,'#d4bc8d');for(let x=321;x<413;x+=10)bottle(x,y+1,['#b2c9a6','#c7b3ca','#d7b58d'][Math.floor(x/10)%3]);rect(317,y+11,102,2,'#8d7353');}
    box(317,137,23,35,'#d6bf94');rect(318,148,21,1,'#ab916a');rect(318,160,21,1,'#ab916a');rect(325,151,6,1,C.ink);rect(325,163,6,1,C.ink);plant(421,176);
    for(const s of staff)person(s.x,s.y,s.kind,'down',false);
    // Front counters occlude staff feet; desk objects are drawn on the counters.
    desk(63,114,69);monitor(70,99);box(107,116,13,5,C.white);rect(109,118,8,1,'#b4bdad');
    desk(352,129,66);monitor(398,114);box(358,130,15,6,'#e9e6cd');rect(360,131,10,2,'#afbfab');bottle(381,120,'#9cbfab');
  }
  function garden(){
    for(const [x,y]of[[22,42],[455,44],[20,115],[458,127],[29,226],[452,226]])tree(x,y);
    for(const x of[75,104,133,161,307,336,365,394])shrub(x,240);
    for(const [x,y,c]of[[54,247,'#db9cad'],[94,234,'#f2d18b'],[146,245,'#a8a5d6'],[330,245,'#ecb181'],[380,234,'#db9cad'],[416,248,'#e6ca75'],[192,279,'#db9cad'],[286,279,'#b8a4d1']])flower(x,y,c);
    for(let x=8;x<205;x+=13){box(x,284,3,12,'#a9875e');rect(x+3,288,11,2,'#c3a377');}for(let x=277;x<475;x+=13){box(x,284,3,12,'#a9875e');rect(x+3,288,11,2,'#c3a377');}
    box(166,238,24,10,'#c6aa80');rect(168,240,20,1,'#eed7a7');rect(168,248,3,5,C.wood);rect(185,248,3,5,C.wood);
    box(289,238,24,10,'#c6aa80');rect(291,240,20,1,'#eed7a7');rect(291,248,3,5,C.wood);rect(308,248,3,5,C.wood);
    // These trees grow in front of the boundary fence, so their trunks/canopies occlude it.
    tree(72,282);tree(401,282);
    sign(240,12,111,'PHARMVILLE CLINIC','#e9d6a6');
  }
  function draw(){floors();garden();furniture();if(target){const r=rooms[target];rect(r.x-7,r.y+2,15,2,'#e5bc6e');rect(r.x-5,r.y+4,11,1,'#f5d99e');rect(r.x-3,r.y-32,7,2,'#f5d99e');rect(r.x-2,r.y-30,5,2,'#d9ab59');rect(r.x-1,r.y-28,3,2,'#d9ab59');}person(patient.x,patient.y,'patient',patient.face,path.length>0);}
  function update(dt){walkSpeed=Math.min(43,walkSpeed+160*dt);let remaining=walkSpeed*dt;while(path.length&&remaining>0){const p=path[0],dx=p.x-patient.x,dy=p.y-patient.y,d=Math.hypot(dx,dy);if(d<.01){path.shift();continue;}const distance=Math.min(d,remaining);patient.x+=dx/d*distance;patient.y+=dy/d*distance;patient.face=Math.abs(dx)>.01?(dx<0?'left':'right'):(dy<0?'up':'down');steps+=distance;remaining-=distance;if(distance>=d-.001)path.shift();}if(!path.length&&target)arrived();}
  function frame(time){raf=null;if(destroyed||!active||document.hidden){last=null;return;}const dt=last===null?0:Math.min((time-last)/1000,1);last=time;if(!paused&&!reduced){ambientTime+=dt;dirty=true;}if(!paused&&path.length){update(dt);dirty=true;}if(dirty&&(lastPaint===null||time-lastPaint>=1000/30||paused||reduced)){draw();dirty=false;lastPaint=time;}schedule();}
  invalidate();
})();
