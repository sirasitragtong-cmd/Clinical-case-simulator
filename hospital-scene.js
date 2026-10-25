'use strict';
// Presentation-only hospital world. No case, authentication, score or database dependencies.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('map');
  let ctx;
  try { ctx=canvas?.getContext('2d'); } catch(error) { ctx=null; }
  if(!ctx) {
    window.HospitalScene=Object.freeze({selectStation(){},setActive(){}});
    const status=$('scene-status');
    if(status) status.textContent='อุปกรณ์นี้แสดงฉากไม่ได้ แต่ยังใช้งานบทเรียนและสมุดบันทึกได้';
    ['sound-toggle','motion-toggle','tour-toggle'].forEach(id=>{if($(id)) $(id).disabled=true;});
    return;
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // All movement follows this connected corridor graph. Staff positions never enter it.
  const nodes = {
    entrance: [440, 520], junction: [440, 410], center: [440, 320],
    north: [520, 320], nurse: [680, 260], doctorDoor: [400, 270],
    doctor: [450, 250], pharmacy: [535, 470]
  };
  const edges = {
    entrance: ['junction'], junction: ['entrance', 'center', 'pharmacy'],
    center: ['junction', 'north', 'doctorDoor'], north: ['center', 'nurse'],
    nurse: ['north'], doctorDoor: ['center', 'doctor'], doctor: ['doctorDoor'],
    pharmacy: ['junction']
  };
  const staff = {
    doctor: {x:459, y:192, color:'#f9f7e9'},
    nurse: {x:727, y:104, color:'#e9eee0'},
    pharmacy: {x:700, y:386, color:'#fffceb'}
  };
  const names = {entrance:'ทางเข้า', nurse:'จุดพยาบาล', doctor:'ห้องตรวจแพทย์', pharmacy:'ห้องยา'};
  const tour = ['nurse', 'doctor', 'pharmacy', 'entrance'];
  const patient = {x:440, y:520, node:'entrance', next:null, route:[], destination:'nurse', gait:0, wait:0, facing:'front'};
  let tourIndex=0, autoTour=true, paused=reducedMotion.matches, activeStation='', dirty=true;
  let lastTime=0, animationTime=0, lastFootstep=0;
  let active=true, frameId=null;
  function scheduleFrame() {
    if(active && !document.hidden && frameId===null && (!paused || dirty)) frameId=requestAnimationFrame(frame);
  }
  function stopFrames() {
    if(frameId!==null) cancelAnimationFrame(frameId);
    frameId=null; lastTime=0;
  }
  function syncAudioActivity() {
    if(!audio.context || !audio.master) return;
    const audible=active && !document.hidden && audio.enabled;
    audio.master.gain.value=audible ? audio.volume : 0;
    const operation=audible ? audio.context.resume() : audio.context.suspend();
    operation.then(()=>{
      // A view can close while resume() is pending; never leak sound onto a dashboard.
      if(!active || document.hidden || !audio.enabled) {
        audio.master.gain.value=0;
        if(audio.context.state==='running') audio.context.suspend().catch(audioFailure);
      }
    }).catch(audioFailure);
  }

  // Web Audio is created only after an explicit click. No audio assets or network requests.
  const audio = {context:null, master:null, enabled:false, busy:false, volume:.25};
  function syncAudioUI() {
    $('sound-toggle').textContent = audio.enabled ? 'เสียง: เปิด' : 'เสียง: ปิด';
    $('sound-toggle').setAttribute('aria-pressed', String(audio.enabled));
  }
  function audioFailure() {
    audio.enabled=false;
    if(audio.master) audio.master.gain.value=0;
    syncAudioUI();
    $('audio-status').textContent='เบราว์เซอร์ยังเปิดเสียงไม่ได้ ฉากและข้อมูลยังใช้งานต่อได้';
  }
  function tone(frequency=580, duration=.1, volume=.1) {
    if(!audio.enabled || !audio.context || audio.context.state!=='running' || document.hidden || !active) return;
    const now=audio.context.currentTime;
    const oscillator=audio.context.createOscillator();
    const envelope=audio.context.createGain();
    oscillator.type='sine'; oscillator.frequency.value=frequency;
    envelope.gain.setValueAtTime(0,now);
    envelope.gain.linearRampToValueAtTime(volume,now+.008);
    envelope.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(envelope); envelope.connect(audio.master);
    oscillator.start(now); oscillator.stop(now+duration+.01);
    oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
  }
  async function toggleSound() {
    if(audio.busy || !active || document.hidden) return;
    audio.busy=true; $('sound-toggle').disabled=true;
    try {
      if(audio.enabled) {
        audio.enabled=false; audio.master.gain.value=0;
        await audio.context.suspend();
        $('audio-status').textContent='ปิดเสียงแล้ว · เปิดเสียงอีกครั้งได้ทุกเมื่อ';
      } else {
        if(!audio.context) {
          const AudioConstructor=window.AudioContext || window.webkitAudioContext;
          if(!AudioConstructor) throw Error('Audio unavailable');
          audio.context=new AudioConstructor();
          audio.master=audio.context.createGain(); audio.master.gain.value=0;
          audio.master.connect(audio.context.destination);
          // Quiet room-tone: never imitates a patient alarm or clinical measurement.
          [130.81,196].forEach(frequency=>{
            const oscillator=audio.context.createOscillator();
            const quiet=audio.context.createGain(); quiet.gain.value=.012;
            oscillator.frequency.value=frequency;
            oscillator.connect(quiet); quiet.connect(audio.master); oscillator.start();
          });
        }
        await audio.context.resume();
        if(audio.context.state!=='running') throw Error('Audio suspended');
        audio.enabled=true; syncAudioActivity();
        $('audio-status').textContent='เปิดเสียงบรรยากาศและเอฟเฟกต์แล้ว · เสียงเป็นส่วนตกแต่งฉาก';
        tone(660,.14,.12);
      }
    } catch(error) { audioFailure(); }
    finally { audio.busy=false; $('sound-toggle').disabled=false; syncAudioUI(); }
  }
  $('sound-toggle').addEventListener('click',toggleSound);
  $('sound-volume').addEventListener('input',event=>{
    audio.volume=Number(event.target.value)/100;
    if(audio.master) audio.master.gain.value=audio.enabled && active && !document.hidden ? audio.volume : 0;
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button && button.id!=='sound-toggle') tone(button.dataset.destination ? 440 : 620,.075,.09);
  });
  document.addEventListener('visibilitychange',()=>{
    stopFrames(); dirty=true;
    syncAudioActivity(); scheduleFrame();
  });

  function shortestRoute(from,to) {
    const queue=[[from]], seen=new Set([from]);
    while(queue.length) {
      const path=queue.shift(), node=path[path.length-1];
      if(node===to) return path.slice(1);
      for(const neighbor of edges[node]) if(!seen.has(neighbor)) {
        seen.add(neighbor); queue.push([...path,neighbor]);
      }
    }
    return [];
  }
  function routeTo(destination) {
    patient.destination=destination;
    // Finish the current corridor segment first; rapid clicks cannot teleport the patient.
    const origin=patient.next || patient.node;
    patient.route=shortestRoute(origin,destination);
    patient.wait=0;
    if(!patient.next) patient.next=patient.route.shift() || null;
    $('scene-status').textContent=`คนไข้สาธิต → ${names[destination]}${paused?' · หยุดภาพอยู่':''}`;
    document.querySelectorAll('[data-destination]').forEach(button=>{
      button.classList.toggle('selected',button.dataset.destination===destination);
      button.setAttribute('aria-pressed',String(button.dataset.destination===destination));
    });
    dirty=true; scheduleFrame();
  }
  function syncMotionUI() {
    $('motion-toggle').textContent=paused?'เล่นภาพเคลื่อนไหว':'หยุดภาพเคลื่อนไหว';
    $('motion-toggle').setAttribute('aria-pressed',String(paused));
    document.querySelector('.scene').classList.toggle('motion-paused',paused);
  }
  function syncTourUI() {
    $('tour-toggle').textContent=autoTour?'เดินชมอัตโนมัติ: เปิด':'เดินชมอัตโนมัติ: ปิด';
    $('tour-toggle').setAttribute('aria-pressed',String(autoTour));
  }
  $('motion-toggle').addEventListener('click',()=>{
    paused=!paused; lastTime=0; dirty=true; syncMotionUI(); scheduleFrame();
    $('scene-status').textContent=paused?'หยุดภาพเคลื่อนไหวแล้ว · ยังเปิดข้อมูลและทำงานได้':`คนไข้สาธิต → ${names[patient.destination]}`;
  });
  reducedMotion.addEventListener('change',event=>{
    paused=event.matches; lastTime=0; dirty=true; syncMotionUI(); scheduleFrame();
  });
  document.querySelectorAll('[data-destination]').forEach(button=>button.addEventListener('click',()=>{
    autoTour=false;syncTourUI();routeTo(button.dataset.destination);
  }));
  $('tour-toggle').addEventListener('click',()=>{
    autoTour=!autoTour;syncTourUI();
    if(autoTour){tourIndex=0;routeTo(tour[tourIndex]);}
  });
  window.HospitalScene=Object.freeze({
    selectStation(name){activeStation=name;dirty=true;scheduleFrame();},
    setActive(value){
      active=Boolean(value); stopFrames(); dirty=true;
      syncAudioActivity(); scheduleFrame();
    }
  });

  function updatePatient(dt) {
    if(!patient.next) {
      patient.wait+=dt;
      if(autoTour && patient.wait>2.8) {tourIndex=(tourIndex+1)%tour.length;routeTo(tour[tourIndex]);}
      return;
    }
    const target=nodes[patient.next], dx=target[0]-patient.x, dy=target[1]-patient.y;
    const distance=Math.hypot(dx,dy), step=Math.min(distance,76*dt);
    if(distance>0){patient.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'back':'front');patient.x+=dx/distance*step;patient.y+=dy/distance*step;patient.gait+=step/13;}
    if(animationTime-lastFootstep>.42 && step>0){tone(105,.045,.045);lastFootstep=animationTime;}
    if(distance<=step+.01){
      patient.x=target[0];patient.y=target[1];patient.node=patient.next;
      patient.next=patient.route.shift() || null;
      if(!patient.next){patient.wait=0;$('scene-status').textContent=`คนไข้สาธิตถึง${names[patient.destination]}แล้ว`;tone(780,.12,.08);}
    }
  }
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function plant(x,y){rect(x+5,y+21,23,23,'#a7855e');rect(x+2,y+20,29,6,'#bd9b6c');rect(x+13,y,8,24,'#55744c');rect(x,y+6,18,14,'#76945f');rect(x+19,y-2,16,18,'#8ba573');rect(x+5,y-8,17,15,'#9caf7d');}
function person(x,y,color,hair='#665648'){rect(x-12,y+28,32,7,'#a9b69a');rect(x-5,y+14,8,17,'#516659');rect(x+8,y+14,8,17,'#516659');rect(x-9,y-7,28,24,color);rect(x-14,y-4,6,19,'#dfb88c');rect(x+19,y-4,6,19,'#dfb88c');rect(x-4,y-25,19,19,'#e4be95');rect(x-6,y-29,22,9,hair);rect(x-6,y-23,5,9,hair);rect(x+8,y-19,3,3,'#4b5548');rect(x+3,y-5,5,16,'#eff2dd');}
function bed(x,y){rect(x+8,y+12,92,138,'#9ca98f');rect(x,y,92,132,'#aabdaf');rect(x+6,y+7,80,112,'#f9f8e8');rect(x+14,y+15,64,28,'#e6e9d7');rect(x+12,y+51,68,65,'#a5c3ad');rect(x+12,y+53,68,7,'#bad2bb');rect(x-5,y+15,6,102,'#7e9b8c');rect(x+92,y+15,6,102,'#7e9b8c');rect(x+9,y+128,9,15,'#617a6b');rect(x+75,y+128,9,15,'#617a6b');}
function drawWorld(){ctx.clearRect(0,0,960,620);rect(0,0,960,620,'#d4dfc4');rect(28,32,904,548,'#a5b598');rect(40,32,880,530,'#eceddb');for(let y=80;y<563;y+=40)for(let x=40;x<920;x+=40){rect(x,y,39,39,(x+y)%80===0?'#e6e9d4':'#e9ecd9');}for(let y=115;y<550;y+=80) for(let x=64;x<900;x+=80) rect(x,y,3,2,'#dce3cd');rect(40,32,880,70,'#c5d3b7');rect(40,92,880,10,'#94aa85');rect(40,32,880,8,'#e2e8cf');rect(352,100,12,200,'#b2c0a2');rect(352,100,12,10,'#7f9775');rect(40,360,260,13,'#a9bb9c');rect(570,360,350,13,'#a9bb9c');
for(const x of [94,220,448,766]){rect(x,48,86,40,'#849d83');rect(x+5,52,76,31,'#c2dfd6');rect(x+40,52,4,31,'#edf0dc');rect(x+5,65,76,3,'#edf0dc');}
bed(118,173);bed(249,173);rect(139,193,34,28,'#d8b591');rect(137,190,39,11,'#685a4b');rect(130,228,67,49,'#91b8a1');rect(80,171,25,34,'#789783');rect(84,175,17,19,'#355c4c');rect(85,184,14,3,'#c5e695');rect(92,205,4,45,'#8d9c80');rect(80,248,25,4,'#8d9c80');
rect(580,143,240,65,'#8b9e7d');rect(575,132,250,56,'#c1cda8');rect(575,132,250,8,'#e3e7cd');rect(610,111,48,29,'#526a56');rect(615,115,38,20,'#acd0b4');rect(629,140,10,7,'#536e58');rect(703,139,52,6,'#faf8e7');person(staff.nurse.x,staff.nurse.y,staff.nurse.color);rect(722,73,22,8,'#f8f7e9');rect(730,74,6,6,'#b87965');
person(staff.pharmacy.x,staff.pharmacy.y,staff.pharmacy.color,'#514b3f');rect(711,387,5,7,'#6b9568');rect(593,421,241,65,'#91a17c');rect(588,409,252,54,'#c9bb91');rect(588,409,252,8,'#e0d4ad');rect(614,420,55,27,'#f8f5e4');rect(639,420,2,27,'#b7c3a1');rect(747,391,45,30,'#546e55');rect(751,395,37,22,'#bad4b3');rect(763,421,14,5,'#587457');
for(let i=0;i<6;i++){rect(602+i*34,520,27,28,'#e8e7cc');rect(608+i*34,521,15,5,'#7f9b75');rect(607+i*34,533,17,8,i%2?'#d6ae76':'#93ae94');}rect(587,551,251,7,'#9f9c7a');
rect(99,422,180,47,'#819a77');for(let i=0;i<3;i++){rect(104+i*59,419,52,32,'#a7bb93');rect(108+i*59,453,44,22,'#bacaa6');rect(111+i*59,475,5,14,'#688263');rect(145+i*59,475,5,14,'#688263');}plant(52,320);plant(873,313);plant(855,509);plant(393,55);person(staff.doctor.x,staff.doctor.y,staff.doctor.color);
rect(447,51,44,35,'#eff0da');rect(464,55,10,26,'#819c78');rect(456,63,26,10,'#819c78');
  drawDetails();
  // Subtle activity on stationary equipment, independent from clinical case values.
  const pulse=Math.floor(animationTime*6)%12;
  for(let i=0;i<12;i++)rect(86+i,181+(i===pulse?0:4),1,i===pulse?7:2,i===pulse?'#e4f5b5':'#89b394');
  rect(754,399,Math.floor(animationTime*9)%30+3,2,'#709e89');
  rect(754,405,22,2,'#8db19a');
  rect(618,121,24,2,'#719c84');
  rect(618,126,14,2,'#8ab199');
  // Station highlight is an indicator, not a moving staff character.
  const selected={patient:[164,293],nurse:[699,219],pharmacy:[702,497]}[activeStation];
  if(selected){
    const alpha=.45+Math.sin(animationTime*3)*.12;
    ctx.strokeStyle=`rgba(100,139,86,${alpha})`;ctx.lineWidth=3;
    ctx.strokeRect(selected[0]-24,selected[1]-3,48,9);
  }
  drawPatient();
}
function drawPatient(){
  const x=patient.x,y=patient.y;
  const swing=patient.next?Math.round(Math.sin(patient.gait)*4):0;
  rect(x-13,y+28,33,7,'#afba9f');
  rect(x-5,y+14+swing,8,17,'#756f59');
  rect(x+8,y+14-swing,8,17,'#756f59');
  rect(x-6,y+29+swing,11,4,'#5a614f');
  rect(x+8,y+29-swing,11,4,'#5a614f');
  const bob=patient.next?Math.round(Math.abs(Math.sin(patient.gait))*2):0;
  rect(x-9,y-7-bob,28,25,'#c99969');rect(x-6,y-4-bob,23,6,'#ddb487');
  rect(x-14,y-4+swing,6,18,'#e3bb91');rect(x+19,y-4-swing,6,18,'#e3bb91');
  rect(x-4,y-25-bob,19,19,'#e4be95');rect(x-6,y-29-bob,22,9,'#635543');
  rect(x-6,y-23-bob,5,9,'#635543');
  if(patient.facing==='back') rect(x-4,y-23-bob,19,13,'#635543');
  else rect(x+(patient.facing==='left'?-2:8),y-19-bob,3,3,'#4b5548');
  rect(x+19,y+12-swing,13,15,'#a8b59a');rect(x+22,y+8-swing,7,5,'#74896d');
  // Small nameplate stays with the demonstration patient only.
  ctx.font='12px sans-serif';ctx.textAlign='center';
  rect(x-29,y-54,68,18,'#fbf9e9');ctx.fillStyle='#6d7155';
  ctx.fillText('คนไข้สาธิต',x+5,y-41);
}
function drawDetails(){
  // Pixel texture and warm shadows add depth without changing traversable corridors.
    rect(42,103,308,5,'#d1dac1');rect(366,103,553,5,'#d1dac1');
  rect(580,208,245,6,'#c2cbb1');rect(592,486,244,5,'#c2cbb1');
  // Pharmacy dispensing tools and medicine packaging; no clinical claims or doses.
  rect(673,422,14,21,'#f4efdb');rect(676,417,8,6,'#718c70');rect(676,430,8,7,'#93b19a');
  rect(695,430,26,12,'#eee9d5');rect(699,433,7,4,'#d5a17a');rect(709,433,7,4,'#b0c5a6');
  rect(811,423,16,22,'#efe6c5');rect(813,427,12,3,'#b79869');rect(813,434,12,3,'#b79869');
  rect(619,424,15,2,'#b0b79d');rect(619,430,12,2,'#b0b79d');rect(619,436,15,2,'#b0b79d');
  // Wall clock and a framed guide remain stationary along with all staff.
  rect(866,49,27,28,'#7b9474');rect(869,52,21,22,'#f8f5df');
  rect(879,57,2,10,'#6c7b61');rect(879,65,7,2,'#6c7b61');
  rect(391,137,26,39,'#a9b897');rect(394,140,20,33,'#f6f4df');
  for(let i=0;i<4;i++)rect(398,146+i*6,12,2,'#abb998');
  ctx.textAlign='center';ctx.font='bold 11px sans-serif';ctx.fillStyle='#5c7659';
  ctx.fillText('PHARMACY',709,479);
  ctx.font='9px sans-serif';ctx.fillText('WELCOME',464,550);
}
function frame(time){
  frameId=null;
  if(!active || document.hidden){lastTime=0;return;}
  if(lastTime && time-lastTime<1000/30){scheduleFrame();return;}
  const dt=lastTime?Math.min((time-lastTime)/1000,.08):0;lastTime=time;
  if(!paused){animationTime+=dt;updatePatient(dt);dirty=true;}
  if(dirty){drawWorld();dirty=false;}
  scheduleFrame();
}
syncMotionUI();syncTourUI();routeTo('nurse');scheduleFrame();
})();
