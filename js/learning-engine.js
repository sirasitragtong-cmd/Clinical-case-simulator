/* PharmVille bounded learning engine. No network calls and no automatic clinical decisions. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LearningEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=1, TYPES=['single','multi','ordered'], CATEGORIES=['decision','reason','evidence'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clone=x=>JSON.parse(JSON.stringify(x));
const safeId=x=>typeof x==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x)&&!['constructor','prototype','__proto__'].includes(x);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=6000;
function validateCase(data){
 const errors=[]; if(!data||typeof data!=='object'||Array.isArray(data))return {valid:false,errors:['รูปแบบเคสต้องเป็น object']};
 if(data.schemaVersion!==VERSION)errors.push('schemaVersion ต้องเป็น 1');
 if(!safeId(data.id)||!text(data.title)||!text(data.version))errors.push('ต้องมี id, title และ version ที่ถูกต้อง');
 if(!data.provenance||!text(data.provenance.source)||!['system-demo','educator-reviewed','draft'].includes(data.provenance.status))errors.push('ต้องระบุแหล่งข้อมูลและสถานะการทบทวน');
 if(!Array.isArray(data.sections)||data.sections.length<1||data.sections.length>24)return {valid:false,errors:[...errors,'ต้องมี sections 1–24 รายการ']};
 const ids=new Set();
 for(const s of data.sections){
  if(!s||!safeId(s.id)||ids.has(s.id)){errors.push('section id ไม่ถูกต้องหรือซ้ำ');continue;}ids.add(s.id);
  if(!text(s.title)||!['S','O','A','P'].includes(s.group))errors.push(s.id+': title/group ไม่ถูกต้อง');
  if(!Array.isArray(s.fields)||!s.fields.length||s.fields.length>24){errors.push(s.id+': fields ต้องมี 1–24 รายการ');continue;}
  const fields=new Set();for(const f of s.fields){
   if(!f||!safeId(f.id)||fields.has(f.id)){errors.push(s.id+': field id ไม่ถูกต้องหรือซ้ำ');continue;}fields.add(f.id);
   if(!text(f.label)||!TYPES.includes(f.type)||!CATEGORIES.includes(f.category)||!Number.isFinite(f.weight)||f.weight<=0||f.weight>100)errors.push(s.id+'.'+f.id+': รูปแบบ field ไม่ถูกต้อง');
   if(!Array.isArray(f.options)||!f.options.length||f.options.length>100){errors.push(s.id+'.'+f.id+': options ไม่ถูกต้อง');continue;}
   const optionIds=new Set();for(const o of f.options){if(!o||!safeId(o.id)||optionIds.has(o.id)||!text(o.label))errors.push(s.id+'.'+f.id+': option ไม่ถูกต้องหรือซ้ำ');else optionIds.add(o.id);}
   if(!Array.isArray(f.correct)||!f.correct.length||new Set(f.correct).size!==f.correct.length||f.correct.some(id=>!optionIds.has(id))||(f.type==='single'&&f.correct.length!==1))errors.push(s.id+'.'+f.id+': เฉลยไม่ตรงตัวเลือก');
  }
 }
 for(const s of data.sections){if(!s||!safeId(s.id))continue;if(s.dependsOn!==undefined&&(!Array.isArray(s.dependsOn)||s.dependsOn.some(id=>!ids.has(id)||id===s.id)))errors.push(s.id+': dependency ไม่ถูกต้อง');}
 const visiting=new Set(),visited=new Set();function visit(id){if(visiting.has(id)){errors.push('dependency วนเป็นวงกลม');return;}if(visited.has(id))return;visiting.add(id);for(const dep of (data.sections.find(s=>s&&s.id===id)?.dependsOn||[])){if(ids.has(dep))visit(dep);}visiting.delete(id);visited.add(id);}ids.forEach(visit);
 if(JSON.stringify(data).length>500000)errors.push('เคสมีขนาดเกิน 500 KB');
 return {valid:errors.length===0,errors};
}
function signature(data){let h=2166136261;for(const c of JSON.stringify(data)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function createSession(caseData,draft){const result=validateCase(caseData);if(!result.valid)throw new Error(result.errors.join('\n'));const session={schemaVersion:VERSION,caseData:clone(caseData),caseId:caseData.id,caseVersion:caseData.version,caseSignature:signature(caseData),answers:{},reviewed:{},stale:{},updatedAt:new Date().toISOString()};return draft?restore(session,draft):session;}
function section(session,id){const found=session.caseData.sections.find(s=>s.id===id);if(!found)throw new Error('ไม่พบหัวข้อ '+id);return found;}
function normalize(field,value){const list=field.type==='single'?(value===''||value==null?[]:[value]):value;if(!Array.isArray(list)||list.length>field.options.length||new Set(list).size!==list.length||list.some(id=>typeof id!=='string'||!field.options.some(o=>o.id===id)))throw new Error('คำตอบอยู่นอกตัวเลือกหรือซ้ำ');return field.type==='single'?(list[0]||''):list.slice();}
function dependentIds(session,id){const found=new Set();function walk(parent){for(const s of session.caseData.sections){if((s.dependsOn||[]).includes(parent)&&!found.has(s.id)){found.add(s.id);walk(s.id);}}}walk(id);return [...found];}
function setAnswer(session,sectionId,fieldId,value){const s=section(session,sectionId),f=s.fields.find(f=>f.id===fieldId);if(!f)throw new Error('ไม่พบช่องคำตอบ');const answer=normalize(f,value);if(JSON.stringify(session.answers[sectionId]?.[fieldId])===JSON.stringify(answer))return session;
 if(!own(session.answers,sectionId))session.answers[sectionId]={};session.answers[sectionId][fieldId]=answer;delete session.reviewed[sectionId];
 for(const id of dependentIds(session,sectionId)){if(session.answers[id])session.stale[id]=true;delete session.reviewed[id];}session.updatedAt=new Date().toISOString();return session;
}
function evaluate(session,id){const s=section(session,id),answers=session.answers[id]||{};let total=0,max=0,complete=true;const feedback=[],categories={decision:{score:0,maxScore:0},reason:{score:0,maxScore:0},evidence:{score:0,maxScore:0}};
 for(const f of s.fields){const raw=answers[f.id],selected=f.type==='single'?(raw?[raw]:[]):Array.isArray(raw)?raw:[],answered=selected.length>0;complete=complete&&answered;let fraction=0;
  if(answered){if(f.type==='ordered'){fraction=selected.reduce((n,id,i)=>n+(f.correct[i]===id?1:0),0)/Math.max(selected.length,f.correct.length);}else{const correct=selected.filter(id=>f.correct.includes(id)).length;const wrong=selected.length-correct;fraction=Math.max(0,(correct-wrong)/f.correct.length);}}
  const earned=f.weight*Math.min(1,fraction);total+=earned;max+=f.weight;categories[f.category].score+=earned;categories[f.category].maxScore+=f.weight;feedback.push({fieldId:f.id,label:f.label,answered,score:round(earned),maxScore:f.weight,correct:fraction===1,message:!answered?'ยังไม่ได้เลือกคำตอบ':fraction===1?'สอดคล้องกับเกณฑ์ของเคส':(f.feedback||'ทบทวนเหตุผลและหลักฐานจากชาร์ต'),expected:f.correct.slice()});
 }
 return {sectionId:id,complete,score:round(total),maxScore:max,percent:max?Math.round(total/max*100):0,feedback,categories,stale:Boolean(session.stale[id]),reviewed:Boolean(session.reviewed[id])};
}
function round(n){return Math.round(n*100)/100;}
function validateSection(session,id){const result=evaluate(session,id);if(result.complete){delete session.stale[id];session.reviewed[id]=true;}return {...result,stale:Boolean(session.stale[id]),reviewed:Boolean(session.reviewed[id])};}
function score(session){const breakdown=session.caseData.sections.map(s=>evaluate(session,s.id)),categories={decision:{score:0,maxScore:0},reason:{score:0,maxScore:0},evidence:{score:0,maxScore:0}};let earned=0,max=0;for(const s of breakdown){earned+=s.score;max+=s.maxScore;for(const c of CATEGORIES){categories[c].score+=s.categories[c].score;categories[c].maxScore+=s.categories[c].maxScore;}}const completed=breakdown.filter(s=>s.complete&&s.reviewed&&!s.stale).length;return {score:round(earned),maxScore:max,percent:max?Math.round(earned/max*100):0,completed,total:breakdown.length,stale:breakdown.filter(s=>s.stale).map(s=>s.sectionId),ready:completed===breakdown.length,breakdown,categories};}
function exportDraft(session){return JSON.stringify({schemaVersion:VERSION,caseId:session.caseId,caseVersion:session.caseVersion,caseSignature:session.caseSignature,answers:session.answers,reviewed:session.reviewed,stale:session.stale,updatedAt:session.updatedAt},null,2);}
function restore(session,input){const data=typeof input==='string'?JSON.parse(input):input;if(!data||data.schemaVersion!==VERSION||data.caseId!==session.caseId||data.caseVersion!==session.caseVersion||data.caseSignature!==session.caseSignature)throw new Error('ฉบับร่างไม่ตรงกับเคสหรือรุ่นข้อมูลนี้');if(!data.answers||typeof data.answers!=='object'||Array.isArray(data.answers))throw new Error('ฉบับร่างไม่มีคำตอบที่ถูกต้อง');for(const [id,fields] of Object.entries(data.answers)){section(session,id);if(!fields||typeof fields!=='object'||Array.isArray(fields))throw new Error('รูปแบบคำตอบไม่ถูกต้อง');for(const [fieldId,value]of Object.entries(fields))setAnswer(session,id,fieldId,value);}session.stale={};for(const s of session.caseData.sections){if(data.stale?.[s.id]===true)session.stale[s.id]=true;if(data.reviewed?.[s.id]===true&&evaluate(session,s.id).complete&&!session.stale[s.id])session.reviewed[s.id]=true;}return session;}
function importDraft(caseData,input){return createSession(caseData,input);}
return Object.freeze({VERSION,validateCase,createSession,setAnswer,validateSection,score,exportDraft,importDraft,evaluate,dependentIds});
});
