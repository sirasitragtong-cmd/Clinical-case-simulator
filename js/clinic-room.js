'use strict';
// A presentation-only clinic. No clinical records, audio, persistence or scoring.
(() => {
  const WIDTH = 1100;
  const HEIGHT = 680;
  const canvas = document.getElementById('clinic-room');
  const rooms = new Set(['reception', 'exam', 'pharmacy']);
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let context = null;
  try { context = canvas?.getContext('2d') || null; } catch (_) { /* Text controls remain usable. */ }
  let selected = 'reception';
  let paused = Boolean(motion?.matches);
  let destroyed = false;
  let active = true;
  let dirty = true;
  let frameId = null;
  let lastFrame = 0;
  let elapsed = 0;
  const visitor = { x: 170, y: 515, segment: 0, gait: 0, wait: 0, facing: 1 };
  const path = [[170, 515], [490, 515], [825, 515], [825, 448], [825, 515], [490, 515], [170, 515], [170, 450]];
  const C = {
    ink: '#24334c', backdrop: '#17283e', floor: '#f0ead9', mint: '#b5d8c7',
    mintDeep: '#6f9f91', cream: '#fff8e8', lavender: '#c4bbdc', orange: '#eaa36f',
    shadow: '#17223826', white: '#fffdf6', wall: '#dbe3d5'
  };

  function schedule() {
    if (context && !destroyed && active && !document.hidden && frameId === null && (!paused || dirty)) {
      frameId = window.requestAnimationFrame(frame);
    }
  }
  function cancel() {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    frameId = null;
    lastFrame = 0;
  }
  function invalidate() { dirty = true; schedule(); }
  function resize() {
    if (!canvas || !context || destroyed) return;
    const ratio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
    canvas.width = Math.round(WIDTH * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    invalidate();
  }
  function visibility() { cancel(); if (!document.hidden) invalidate(); }
  function preference(event) { paused = event.matches; cancel(); invalidate(); }
  function selectRoom(id) {
    if (destroyed || !rooms.has(id)) return false;
    selected = id;
    invalidate();
    window.dispatchEvent(new CustomEvent('clinic:visit', { detail: { room: id } }));
    return true;
  }
  function setPaused(value) {
    if (destroyed) return;
    paused = Boolean(value);
    cancel();
    invalidate();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancel();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('resize', resize);
    motion?.removeEventListener?.('change', preference);
  }
  window.ClinicRoom = Object.freeze({ selectRoom, setPaused, destroy, isPaused: () => paused, setActive(value) { active=Boolean(value); cancel(); if(active) invalidate(); } });
  if (!context) {
    canvas?.setAttribute('aria-label', 'แสดงฉากไม่ได้ในอุปกรณ์นี้ ยังเลือกห้องและเล่นผ่านปุ่มด้านข้างได้');
    return;
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize);
  motion?.addEventListener?.('change', preference);

  // Oblique projection gives each room visible floors, walls and furniture depth.
  function point(x, y, z = 0) { return [42 + x * .85 + y * .32, 166 + y * .64 - z]; }
  function polygon(points, fill, stroke = C.ink, lineWidth = 2) {
    context.beginPath();
    points.forEach((p, i) => i ? context.lineTo(p[0], p[1]) : context.moveTo(p[0], p[1]));
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
  }
  function rect(x, y, w, h, fill, stroke = null, radius = 0) {
    context.beginPath();
    if (radius && context.roundRect) context.roundRect(x, y, w, h, radius);
    else context.rect(x, y, w, h);
    context.fillStyle = fill; context.fill();
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); }
  }
  function line(a, b, color = C.ink, width = 2) {
    context.beginPath(); context.moveTo(...a); context.lineTo(...b);
    context.strokeStyle = color; context.lineWidth = width; context.stroke();
  }
  function ellipse(x, y, rx, ry, fill, stroke = null) {
    context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    context.fillStyle = fill; context.fill();
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); }
  }
  function text(value, x, y, size = 12, color = C.ink, align = 'center') {
    context.fillStyle = color; context.font = `600 ${size}px "Noto Sans Thai", sans-serif`;
    context.textAlign = align; context.fillText(value, x, y);
  }
  function floor(x, y, w, d, color, outline = C.ink) {
    polygon([point(x,y), point(x+w,y), point(x+w,y+d), point(x,y+d)], color, outline);
  }
  function box(x, y, w, d, h, top, front = '#a7bfae', side = '#92aa9c', z = 0) {
    const a=point(x,y,z+h), b=point(x+w,y,z+h), c=point(x+w,y+d,z+h), d1=point(x,y+d,z+h);
    polygon([d1,c,point(x+w,y+d,z),point(x,y+d,z)],front);
    polygon([b,c,point(x+w,y+d,z),point(x+w,y,z)],side);
    polygon([a,b,c,d1],top);
  }
  function shadow(x,y,w,d) { floor(x+7,y+9,w,d,C.shadow,null); }
  function label(x,y,z,value,color=C.cream,width=112) {
    const p=point(x,y,z);
    rect(p[0]-width/2,p[1]-13,width,25,color,C.ink,5);
    text(value,p[0],p[1]+4,11);
  }
  function plant(x,y,size=1) {
    const p=point(x,y); ellipse(p[0]+4,p[1]+4,20*size,9*size,C.shadow);
    box(x-12*size,y-10*size,25*size,22*size,24*size,'#dca985','#c68f6c','#b57e5e');
    const s=point(x,y,25*size);
    line(s,[s[0],s[1]-32*size], '#4f7c68',3);
    [[-12,-20],[12,-29],[-9,-39],[10,-11]].forEach(([dx,dy])=>{
      ellipse(s[0]+dx*size,s[1]+dy*size,12*size,7*size,dy<-25?'#8fbca0':'#64977d',C.ink);
    });
  }
  function windowPanel(x,w) {
    const p=point(x,0,95);
    rect(p[0],p[1],w*.85,63,'#e4ece8',C.ink,4);
    rect(p[0]+6,p[1]+6,w*.85-12,51,'#accbd1');
    polygon([[p[0]+8,p[1]+8],[p[0]+48,p[1]+8],[p[0]+8,p[1]+48]],'#d8ece6',null);
    line([p[0]+w*.425,p[1]+5],[p[0]+w*.425,p[1]+58],'#f5f4e6',5);
    line([p[0]+5,p[1]+35],[p[0]+w*.85-5,p[1]+35],'#f5f4e6',4);
    box(x-5,0,w+10,13,7,'#f8f3df','#c0ccba','#9eb09d',26);
  }
  function person(x,y,role,phase=0,facing=1) {
    const p=point(x,y); const walking=role==='visitor';
    const swing=walking?Math.sin(phase)*3:0;
    ellipse(p[0]+2,p[1]+2,18,7,C.shadow);
    const outfit=walking?C.orange:role==='pharmacist'?'#fdf9e9':role==='receptionist'?C.lavender:'#c4dbdb';
    rect(p[0]-9,p[1]-17+swing,7,18,'#4c6074',C.ink,2);
    rect(p[0]+3,p[1]-17-swing,7,18,'#4c6074',C.ink,2);
    rect(p[0]-12,p[1]-3+swing,11,5,C.ink,null,2);
    rect(p[0]+3,p[1]-3-swing,11,5,C.ink,null,2);
    rect(p[0]-14,p[1]-42,28,29,outfit,C.ink,6);
    rect(p[0]-19,p[1]-37-swing,7,22,'#d9ac87',C.ink,3);
    rect(p[0]+12,p[1]-37+swing,7,22,'#d9ac87',C.ink,3);
    rect(p[0]-12,p[1]-66,24,27,'#e4b894',C.ink,7);
    rect(p[0]-13,p[1]-69,26,10,'#5c4a48',C.ink,4);
    rect(p[0]-13,p[1]-61,6,12,'#5c4a48');
    rect(p[0]+(facing<0?-6:4),p[1]-55,3,3,C.ink);
    if(!walking) {
      rect(p[0]-2,p[1]-40,4,25,C.white);
      rect(p[0]+5,p[1]-33,6,7,role==='pharmacist'?C.mintDeep:'#8c85ad');
    } else {
      rect(p[0]-8,p[1]-34,16,4,'#f0c298');
      rect(p[0]+14,p[1]-20,13,14,'#b3c5ac',C.ink,3);
    }
  }
  function monitor(x,y,z=54,width=41) {
    const p=point(x,y,z);
    rect(p[0]-width/2,p[1]-32,width,28,C.ink,C.ink,4);
    rect(p[0]-width/2+4,p[1]-28,width-8,19,'#8bb7af',null,2);
    rect(p[0]-width/2+8,p[1]-24,width-19,3,'#d2e4cc');
    rect(p[0]-width/2+8,p[1]-18,width-24,3,'#b3d2bd');
    rect(p[0]-3,p[1]-4,6,7,C.ink);rect(p[0]-11,p[1]+2,22,4,C.ink,null,2);
  }
  function chair(x,y,color=C.mint) {
    shadow(x,y,39,40);
    [0,30].forEach(dx=>[0,28].forEach(dy=>box(x+dx,y+dy,5,5,25,C.ink,C.ink,C.ink)));
    box(x-3,y-3,43,36,11,color,'#83a99b','#6a9186',22);
    box(x-3,y-4,43,9,37,color,'#83a99b','#6a9186',25);
  }
  function reception(){
    windowPanel(38,106);
    label(217,0,77,'RECEPTION',C.lavender,115);
    shadow(30,80,230,90);person(135,112,'receptionist');
    box(28,120,245,72,60,'#e9dac0','#c9b89e','#ac9c88');
    box(21,113,258,82,9,C.cream,'#dccaaa','#b5a68c',60);
    monitor(79,150,70);const p=point(177,151,70);
    rect(p[0]-17,p[1]-8,35,17,C.white,C.ink,2);
    for(let i=0;i<3;i++)line([p[0]-12,p[1]-4+i*4],[p[0]+12,p[1]-4+i*4],'#b1b5ac',1);
    const cross=point(222,193,30);rect(cross[0]-4,cross[1]-11,8,22,C.cream);rect(cross[0]-11,cross[1]-4,22,8,C.cream);
    floor(37,260,224,135,'#c9c0dc','#a99bbc');
    for(let i=0;i<3;i++)chair(55+i*67,270,i===1?'#d3c8e3':'#b8cdbc');
    plant(22,400,.9);plant(273,65,.8);
    const rack=point(240,332);rect(rack[0]-15,rack[1]-32,30,37,'#d6b18c',C.ink,3);
    [[-10,'#f2d08b'],[0,'#b6cbd1'],[10,'#b7c79d']].forEach(([dx,color])=>rect(rack[0]+dx-4,rack[1]-28,8,25,color,C.ink,1));
  }
  function exam(){
    windowPanel(370,120);label(580,0,77,'EXAM ROOM','#c8dcd5',110);
    floor(375,130,246,270,'#d4e4d8','#afc9b8');
    // Empty examination bed with a paper roll, pillow and folded blanket.
    shadow(442,153,113,185);
    [[447,161],[538,161],[447,315],[538,315]].forEach(([x,y])=>box(x,y,9,12,41,'#b9c6c0','#819b98','#687d83'));
    box(437,151,124,195,12,'#adc6bf','#6e9290','#597f83',38);
    box(441,155,116,187,15,C.white,'#d7e0d8','#b3c2bd',50);
    box(451,168,94,43,9,'#e9e8d7','#ced6c8','#b2c3b7',65);
    box(441,260,116,72,7,C.mint,'#8bb0a0','#70978d',65);
    for(let i=0;i<5;i++)line(point(448,270+i*10,73),point(548,270+i*10,73),'#9bc2af',1);
    // Curtain rail and folded fabric along the back-right corner.
    line(point(612,87,115),point(612,276,115),'#738b8a',5);
    for(let y=90;y<210;y+=16){
      polygon([point(609,y,108),point(609,y+15,108),point(609,y+15,24),point(609,y,24)],y%32<16?'#c9c3dc':'#b7b2cf', '#969bb3',1);
    }
    box(351,90,59,55,58,'#f3ecda','#c7d7cc','#9db6af');monitor(379,113,59,43);
    const stool=point(387,310);ellipse(stool[0],stool[1]+4,20,8,C.shadow);
    line([stool[0],stool[1]-6],[stool[0],stool[1]-29],'#617e82',5);
    ellipse(stool[0],stool[1]-30,20,10,C.lavender,C.ink);
    line([stool[0]-15,stool[1]],[stool[0]+15,stool[1]],C.ink,3);
    person(386,234,'clinician');plant(634,388,.8);
    const clock=point(647,0,89);ellipse(clock[0],clock[1],17,17,C.cream,C.ink);
    line([clock[0],clock[1]],[clock[0],clock[1]-10],C.ink,2);line([clock[0],clock[1]],[clock[0]+7,clock[1]+3],C.ink,2);
  }
  function bottle(x,y,z,color){
    box(x,y,13,12,24,'#f6efdb','#e0dac8','#bbbcae',z);
    box(x+2,y+1,9,10,5,color,color,color,z+24);
    const p=point(x+6,y+13,z+14);rect(p[0]-4,p[1]-4,8,8,color,null,1);
  }
  function pharmacy(){
    label(826,0,90,'PHARMACY',C.orange,126);
    // Back-wall apothecary shelving, with individually shaped packaging.
    box(697,25,250,47,104,'#cddbc9','#a5baaa','#829b91');
    for(let row=0;row<3;row++){
      const z=15+row*31;
      box(700,24,244,51,5,'#eff0d9','#d3d6bd','#aebba8',z);
      for(let col=0;col<9;col++){
        const color=[C.lavender,C.mintDeep,'#d5a373'][col%3];
        if(col%3===0)box(707+col*25,39,15,19,22,'#faf5e5',color,'#9ba79b',z+5);
        else bottle(707+col*25,39,z+5,color);
      }
    }
    floor(719,224,207,168,'#e4c9a1','#c5ac87');
    person(818,179,'pharmacist');
    shadow(697,218,257,91);box(697,218,257,91,60,'#b8d0bd','#8dac9e','#739386');
    box(689,210,272,102,8,C.cream,'#e0d3b7','#b6ae95',60);
    monitor(894,249,69,46);
    bottle(741,248,69,C.mintDeep);bottle(764,258,69,C.lavender);
    const tray=point(810,262,70);rect(tray[0]-21,tray[1]-9,42,19,'#dbe0d3',C.ink,4);
    rect(tray[0]-12,tray[1]-3,12,5,C.orange,null,3);rect(tray[0]+4,tray[1]-3,12,5,C.white,null,3);
    const sign=point(827,311,28);rect(sign[0]-37,sign[1]-12,74,24,C.cream,C.ink,5);text('Rx',sign[0],sign[1]+6,18,'#527c6b');
    plant(943,395,.95);box(702,365,53,46,54,'#e7d3b6','#c1ab8d','#aa947c');
    const bags=point(725,386,56);rect(bags[0]-13,bags[1]-26,26,28,'#f6eccf',C.ink,3);
    line([bags[0]-6,bags[1]-23],[bags[0]-6,bags[1]-31],C.ink,2);line([bags[0]+6,bags[1]-23],[bags[0]+6,bags[1]-31],C.ink,2);line([bags[0]-6,bags[1]-31],[bags[0]+6,bags[1]-31],C.ink,2);
  }
  function draw(){
    context.clearRect(0,0,WIDTH,HEIGHT);
    const bg=context.createLinearGradient(0,0,0,HEIGHT);bg.addColorStop(0,'#20364d');bg.addColorStop(1,'#14263b');
    rect(0,0,WIDTH,HEIGHT,bg);
    for(let i=0;i<38;i++){const x=(i*167)%1100,y=(i*83)%680;rect(x,y,2,2,'#b9cfc21f');}
    ellipse(572,584,464,39,'#0c1a2b80');
    // Foundation and open dollhouse walls.
    box(0,0,986,580,21,'#dce5d5','#899e96','#6e8585',-21);
    floor(9,9,968,560,C.floor);
    for(let x=10;x<970;x+=65)line(point(x,10),point(x,570),'#dfdfce',1);
    for(let y=10;y<570;y+=65)line(point(10,y),point(977,y),'#dfdfce',1);
    floor(9,442,968,128,'#d3ddcc','#b1c4b3');
    floor(325,14,329,418,'#e2e9dc','#c0cfbf');
    floor(671,14,305,418,'#e6e3d2','#c8ccba');
    box(0,0,986,12,119,'#eef1dd','#cfdecb','#97b6a5');
    box(0,0,12,430,119,'#eef1dd','#b5c9b8','#8ca99a');
    box(309,0,10,345,100,'#e9e8d8','#d1d7c5','#a5b9a9');
    box(658,0,10,345,100,'#ece8de','#d9d2ce','#b2adb8');
    reception();exam();pharmacy();
    // The route ribbon lives in the shared corridor, clear of all furniture.
    for(let x=70;x<945;x+=58){const p=point(x,507);rect(p[0]-4,p[1],8,3,'#acbfaa');}
    const target={reception:[164,435],exam:[482,435],pharmacy:[824,435]}[selected];
    const halo=point(...target);
    ellipse(halo[0],halo[1],39,13,'#f4c67b30');
    ellipse(halo[0],halo[1],26,8,'#f5c27545');
    const bob=paused?0:Math.sin(elapsed*2.7)*3;
    polygon([[halo[0]-7,halo[1]-21+bob],[halo[0]+7,halo[1]-21+bob],[halo[0],halo[1]-13+bob]],'#f4bd73',C.ink,1.5);
    person(visitor.x,visitor.y,'visitor',visitor.wait?0:visitor.gait,visitor.facing);
    label(70,579,0,'01 · ต้อนรับ','#d0c7e3',106);
    label(415,579,0,'02 · ห้องตรวจ','#c5ded0',119);
    label(774,579,0,'03 · ห้องยา','#edc69d',110);
    text('PHARMVILLE  /  CLINIC FLOOR 01',44,637,11,'#9ab3bc','left');
    text('สำรวจห้องผ่านปุ่มด้านข้าง',1056,637,11,'#9ab3bc','right');
  }
  function update(dt){
    if(visitor.wait>0){visitor.wait=Math.max(0,visitor.wait-dt);return;}
    const target=path[(visitor.segment+1)%path.length];
    const dx=target[0]-visitor.x,dy=target[1]-visitor.y,dist=Math.hypot(dx,dy);
    const step=Math.min(dist,65*dt);
    if(dist>0){visitor.x+=dx/dist*step;visitor.y+=dy/dist*step;visitor.gait+=step*.13;if(Math.abs(dx)>1)visitor.facing=dx<0?-1:1;}
    if(dist<=step+.01){visitor.segment=(visitor.segment+1)%path.length;visitor.wait=visitor.segment%3===0?1.8:.2;}
  }
  function frame(time){
    frameId=null;
    if(destroyed||!active||document.hidden){lastFrame=0;return;}
    if(lastFrame && time-lastFrame<1000/30){schedule();return;}
    const dt=lastFrame?Math.min((time-lastFrame)/1000,.08):0;lastFrame=time;
    if(!paused){elapsed+=dt;update(dt);dirty=true;}
    if(dirty){draw();dirty=false;}
    schedule();
  }
  resize();
})();
