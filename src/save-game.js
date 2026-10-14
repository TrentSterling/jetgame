// Versioned local checkpoints. Simulation buffers are copied on the same GPU
// queue as the frame, then committed together in one IndexedDB transaction.
export const SAVE_SCHEMA=1,WORLD_VERSION='expeditions-1';
const bodyData=body=>Object.fromEntries(Object.entries(body).filter(([k,v])=>k==='pos'||['number','boolean','string'].includes(typeof v)).map(([k,v])=>[k,k==='pos'?v.toArray():v]));
const setBody=(body,data)=>{for(const [k,v] of Object.entries(data))if(k==='pos')body.pos.fromArray(v);else body[k]=v;};
const modes=['foot','car','jet'],bad=message=>{throw Error('Invalid checkpoint: '+message);};
const runtimeNumbers=['time','ammo','bombs','bombAt','rearm','shotAt','reload','score','previousHits','previousContacts','previousCar','previousFoot','previousCab','previousJet','deathAt','respawnAt','shieldUntil','respawns','jumps','gunRounds','bombImpacts'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const position=p=>Array.isArray(p)&&p.length===3&&p.every(finite);
const bodyValid=b=>b&&position(b.pos)&&finite(b.health)&&b.health>=0&&b.health<=100&&finite(b.yaw)&&Object.entries(b).every(([k,v])=>k==='pos'||['boolean','string'].includes(typeof v)||(typeof v==='number'&&(Number.isFinite(v)||(k==='chuteDelay'&&v===Infinity))));
export function validateCheckpoint(s,count){
 if(!s||s.schema!==SAVE_SCHEMA||s.world!==WORLD_VERSION)bad('unsupported version');
 if(!finite(s.savedAt)||s.count!==count||!bodyValid(s.player))bad('player or population');
 if(!s.runtime||!modes.includes(s.runtime.mode)||!finite(s.runtime.time)||s.runtime.time<0||!position(s.runtime.deathPoint))bad('run state');
 if(!modes.includes(s.runtime.respawnMode)||Object.entries(s.runtime).some(([k,v])=>!['mode','respawnMode','deathPoint'].includes(k)&&!['boolean'].includes(typeof v)&&!finite(v)))bad('run values');
 if(!runtimeNumbers.every(k=>finite(s.runtime[k]))||!['dead','won'].every(k=>typeof s.runtime[k]==='boolean'))bad('missing run values');
 if(!s.upgrades||!modes.every(k=>Number.isInteger(s.upgrades.levels?.[k])&&s.upgrades.levels[k]>=0&&s.upgrades.levels[k]<=3)||!['earned','spent','rewards'].every(k=>finite(s.upgrades[k])&&s.upgrades[k]>=0))bad('upgrades');
 if(!s.fleet||!Array.isArray(s.fleet.bodies)||s.fleet.bodies.length>100000||!s.fleet.bodies.every(b=>bodyValid(b)&&typeof b.fleetId==='string'&&['buggy','scout','carrier','jet'].includes(b.kind)))bad('vehicles');
 const ids=new Set(s.fleet.bodies.map(b=>b.fleetId));
 if(ids.size!==s.fleet.bodies.length||!['car','jet'].every(k=>ids.has(s.fleet.active?.[k]))||!ids.has('starter-buggy')||!ids.has('starter-jet'))bad('vehicle selection');
 if(!s.fleet.bodies.some(b=>b.fleetId===s.fleet.active.jet&&b.kind==='jet')||!s.fleet.bodies.some(b=>b.fleetId===s.fleet.active.car&&b.kind!=='jet'))bad('vehicle type');
 const e=s.expeditions;
 if(!e||!['done','repaired','visited'].every(k=>Array.isArray(e[k])&&e[k].every(v=>typeof v==='string'))||!Array.isArray(e.refuges)||!e.refuges.length||!e.refuges.every(r=>typeof r.id==='string'&&finite(r.x)&&finite(r.z))||!['rescued','deliveries','progress'].every(k=>finite(e[k])&&e[k]>=0))bad('expeditions');
 if(e.party&&(!ids.has(e.party.vehicle)||!finite(e.party.count)||!finite(e.party.reward)||!finite(e.party.x)||!finite(e.party.z)||typeof e.party.id!=='string'))bad('passengers');
 if(!s.combat||!['car','jet'].every(k=>finite(s.combat.ammo?.[k])&&finite(s.combat.reload?.[k])&&finite(s.combat.missileDelay?.[k]))||!['stamina','shoveDelay','recoverDelay','shoveAnimation','shoves','missilesFired'].every(k=>finite(s.combat[k])))bad('combat');
 if(!Array.isArray(s.broken)||s.broken.some(v=>!Number.isInteger(v)||v<0||v>=36))bad('scenery');
 for(const [key,length,Type] of [['pos',count*4,Float32Array],['state',count*4,Float32Array],['vel',count*4,Float32Array],['blood',count*12,Float32Array],['counters',13,Uint32Array]]){
  const b=s.gpu?.[key];if(!(b instanceof ArrayBuffer)||b.byteLength!==length*4)bad(key+' buffer');
  if(Type===Float32Array&&!new Type(b).every(Number.isFinite))bad(key+' values');
 }
 return s;
}

export class GameSave{
 constructor(game,{name='Horde3D-expedition',enabled=true,status=()=>{}}={}){this.game=game;this.name=name;this.enabled=enabled;this.status=status;this.revision=0;this.savedAt=0;this.lastAttempt=0;this.started=false;this.blocked=false;this.loaded=false;this.pending=null;this.lastError=null;}
 async open(){
  if(this.db)return this.db;
  this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('checkpoints');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close another game tab to unlock saves.'));r.onsuccess=()=>resolve(r.result);});
  this.db.onversionchange=()=>{this.db.close();this.blocked=true;this.status('Save storage changed in another tab. Reload to continue saving.');};return this.db;
 }
 async records(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints'),store=tx.objectStore('checkpoints'),a=store.get('current'),b=store.get('previous');tx.oncomplete=()=>resolve({current:a.result,previous:b.result});tx.onerror=()=>reject(tx.error);});}
 async load(){
  if(!this.enabled)return;
  try{
   const {current,previous}=await this.records();this.revision=current?.revision??0;
   if(!current&&!previous){this.status('Autosaves every 10 seconds and when paused.');return;}
   let data,recovered=false;
   try{data=validateCheckpoint(current,this.game.horde.count);}catch{data=validateCheckpoint(previous,this.game.horde.count);recovered=true;}
   this.restore(data);this.savedAt=data.savedAt;this.loaded=true;this.status((recovered?'Recovered previous checkpoint':'Checkpoint loaded')+' · '+new Date(data.savedAt).toLocaleTimeString());
  }catch(e){this.blocked=true;this.lastError=String(e);this.status('Save could not be loaded. Existing checkpoints are protected. '+e.message);}
 }
 async capture(){
  const {horde,fleet,expeditions:e,player,upgrades,combat,course,readRuntime}=this.game;
  const bodies=new Map([...fleet.saved].map(([id,b])=>[id,bodyData(b)]));for(const entry of fleet.entries)bodies.set(entry.id,bodyData(entry.body));
  const record={schema:SAVE_SCHEMA,world:WORLD_VERSION,savedAt:Date.now(),count:horde.count,player:bodyData(player),runtime:readRuntime(),upgrades:structuredClone(upgrades),combat:structuredClone(combat),fleet:{active:{car:fleet.active.car.id,jet:fleet.active.jet.id},bodies:[...bodies.values()]},expeditions:{done:[...e.done],repaired:[...e.repaired],visited:[...e.visited],refuges:structuredClone(e.refuges),party:structuredClone(e.party),rescued:e.rescued,deliveries:e.deliveries,progress:e.progress,active:e.active},broken:course.props.flatMap((p,i)=>p.broken?[i]:[]),streaming:horde.streaming.value};
  const keys=['pos','state','vel','blood','counters'];
  // These calls submit all five copies synchronously before yielding. A later
  // simulation frame cannot land between the copied buffers.
  const buffers=await Promise.all(keys.map(k=>horde.renderer.getArrayBufferAsync(horde[k].value)));
  record.gpu=Object.fromEntries(keys.map((k,i)=>[k,buffers[i]]));return validateCheckpoint(record,horde.count);
 }
 restore(s){
  const {horde,fleet,expeditions:e,player,upgrades,combat,course,writeRuntime}=this.game;validateCheckpoint(s,horde.count);
  fleet.restore(s.fleet);setBody(player,s.player);Object.assign(upgrades,structuredClone(s.upgrades));Object.assign(combat,structuredClone(s.combat));
  for(const k of ['done','repaired','visited'])e[k]=new Set(s.expeditions[k]);
  for(const k of ['refuges','party','rescued','deliveries','progress','active'])e[k]=structuredClone(s.expeditions[k]);
  for(const site of e.sites.values())site.ready=e.repaired.has(site.id);
  course.reset();for(const i of s.broken){const p=course.props[i];p.broken=true;p.mesh.visible=false;course.smashed++;p.mesh.traverse(o=>{const j=course.solids.indexOf(o);if(j>=0)course.solids.splice(j,1);});}
  horde.generation++;
  for(const k of ['pos','state','vel','blood','counters']){const a=horde[k].value;a.array.set(k==='counters'?new Uint32Array(s.gpu[k]):new Float32Array(s.gpu[k]));a.needsUpdate=true;
   // Counters are only bound by the simulation kernel. Upload explicitly using
   // the pinned backend so a paused reload can read them without simulating.
   horde.renderer.backend.updateAttribute(a);
  }
  horde.old.value.array.set(new Float32Array(s.gpu.pos));horde.old.value.needsUpdate=true;horde.streaming.value=s.streaming??1;horde.time.value=s.runtime.time;
  writeRuntime(s.runtime);
 }
 async commit(record){
  const db=await this.open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('checkpoints','readwrite'),store=tx.objectStore('checkpoints'),get=store.get('current');let failure;
   get.onsuccess=()=>{try{const old=get.result;if((old?.revision??0)!==this.revision){this.blocked=true;throw Error('A different game tab saved more recently. Reload before saving.');}
    if(old){try{validateCheckpoint(old,this.game.horde.count);store.put(old,'previous');}catch{}}
    record.revision=this.revision+1;store.put(record,'current');
   }catch(e){failure=e;tx.abort();}};
   tx.oncomplete=()=>resolve(record.revision);tx.onabort=()=>reject(failure||tx.error||Error('Save transaction aborted'));tx.onerror=()=>{};
  });
 }
 async save(){
  if(!this.enabled||this.blocked)return {saved:false,error:this.lastError||'Saving disabled'};
  if(this.pending)return this.pending;
  this.lastAttempt=performance.now();this.status('Saving…');
  this.pending=(async()=>{try{const snapshot=await this.capture();this.revision=await this.commit(snapshot);this.savedAt=snapshot.savedAt;this.lastError=null;this.status('Saved · '+new Date(this.savedAt).toLocaleTimeString());return {saved:true,revision:this.revision,savedAt:this.savedAt};}catch(e){this.lastError=String(e);this.status('Save failed; previous checkpoint kept. '+e.message);return {saved:false,error:this.lastError};}finally{this.pending=null;}})();return this.pending;
 }
 tick(){if(this.started&&performance.now()-this.lastAttempt>=10000)void this.save();}
 report(){return {enabled:this.enabled,loaded:this.loaded,savedAt:this.savedAt,revision:this.revision,saving:!!this.pending,blocked:this.blocked,error:this.lastError};}
}
