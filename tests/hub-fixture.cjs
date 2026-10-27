'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const engine=require('../js/learning-engine.js'),demo=require('../data/demo-case.json');
const source=fs.readFileSync(require.resolve('../js/game-hub.js'),'utf8');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
function fixture(storage=new Map()){
 let document;
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.listeners={};this.hidden=false;this.attributes={};this.classList={toggle(){}};this.offsetParent={};this.textContent='';}
  append(...items){this.children.push(...items);for(const item of items)if(item&&typeof item==='object')item.parent=this;}
  replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  addEventListener(k,fn){this.listeners[k]=fn;}
  querySelectorAll(){return [];}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  click(){return this.onclick?.();}
 }
 const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const shell=new Element(),events={},worldCalls=[];document={activeElement:null,getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),querySelectorAll:()=>[],querySelector:s=>s==='.game-shell'?shell:null,addEventListener(k,fn){events[k]=fn;}};
 const context={document,LearningEngine:engine,ClinicRoom:{setControlled(v){worldCalls.push(['controlled',v]);},setActive(v){worldCalls.push(['active',v]);},performTask(v){worldCalls.push(['task',v]);},isPaused(){return this.paused||false;},setPaused(v){this.paused=v;}},AuthService:{onAuthStateChanged(fn){this.notify=fn;},async loginWithGoogle(){this.notify({displayName:'<img onerror=alert(1)>'});},async logout(){this.notify(null);}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},navigator:{},fetch:async url=>({ok:url.includes('demo-case'),json:async()=>demo}),setTimeout:()=>1,clearTimeout(){},addEventListener(k,fn){events[k]=fn;},Blob,URL,console};context.window=context;
 vm.runInNewContext(source,context);
 return {context,ids,storage,events,worldCalls,shell,click:async id=>ids.get(id).listeners.click?.(),settle:async()=>{for(let i=0;i<8;i++)await Promise.resolve();},import:async data=>ids.get('import-input').listeners.change({target:{files:[{size:100,text:async()=>JSON.stringify(data)}]}})};
}
function imported(id){const c=JSON.parse(JSON.stringify(demo));c.id=id;c.title=id;return c;}
function startLast(f){f.ids.get('case-list').children.at(-1).children.at(-1).click();}
function answerFirst(f){const field=f.ids.get('section-content').children.find(n=>n.tagName==='fieldset'),grid=field.children.at(-1),input=grid.children[0].children[0];input.checked=true;input.onchange();}

module.exports={fixture,imported,startLast,answerFirst};
