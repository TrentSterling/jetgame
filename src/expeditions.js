import * as T from 'three/webgpu';
import {box,cylinder,segment,material} from './art.js';
import {height,obstacles,navigationObstacles} from './nav.js';
import {regionsNear,expeditionOffer} from './regions.js';
import {compositeStatic} from './composite.js';
import {moveSurvivor} from './survivor-motion.js';
import {survivorGeometry} from './bot-art.js';

function survivor(index){
 const geo=survivorGeometry(index),p=geo.getAttribute('position'),part=geo.getAttribute('part');
 const m=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.85}));m.rotation.y=Math.PI;m.castShadow=m.receiveShadow=true;
 m.userData.rest=Float32Array.from(p.array);m.userData.normals=Float32Array.from(geo.getAttribute('normal').array);m.userData.parts=part.array;m.userData.path={};m.userData.clock=index;
 m.userData.limbs=[];
 for(let i=0;i<part.count;){const tag=part.getX(i),start=i;while(i<part.count&&part.getX(i)===tag)i++;if(tag)m.userData.limbs.push({part:tag,start,end:i});}
 geo.boundingSphere=new T.Sphere(new T.Vector3(0,.95,0),1.6);return m;
}
function poseSurvivor(mesh,walking,dt){
 const data=mesh.userData;if(!walking&&!data.walking)return;data.clock+=dt*8;data.walking=walking;
 const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
 // Head and torso are static. Only limb components become dirty; compute each
 // joint rotation once and let Three upload the explicit moving ranges.
 p.clearUpdateRanges();n.clearUpdateRanges();
 for(const {part,start,end} of data.limbs){
  const angle=walking?Math.sin(data.clock+(part===1||part===4?0:Math.PI))*(part<3?.3:.45):0,c=Math.cos(angle),s=Math.sin(angle),pivot=part<3?1.4:.82;
  for(let i=start;i<end;i++){const j=i*3;
   p.setXYZ(i,data.rest[j],pivot+(data.rest[j+1]-pivot)*c-data.rest[j+2]*s,(data.rest[j+1]-pivot)*s+data.rest[j+2]*c);
   n.setXYZ(i,data.normals[j],data.normals[j+1]*c-data.normals[j+2]*s,data.normals[j+1]*s+data.normals[j+2]*c);
  }
  p.addUpdateRange(start*3,(end-start)*3);n.addUpdateRange(start*3,(end-start)*3);
 }
 p.needsUpdate=n.needsUpdate=true;
}
const missionName=site=>site.kind==='relay'?'Restore relay':site.kind==='quarry'?'Medical evacuation':'Evacuate survivors';
export class Expeditions{
 constructor(scene,solids,onReward,onMessage,onSignal){
  this.scene=scene;this.solids=solids;this.onReward=onReward;this.onMessage=onMessage;this.onSignal=onSignal;this.sites=new Map();this.done=new Set();this.repaired=new Set();this.visited=new Set();this.missions=new Map();this.relays=0;this.boarding=null;this.refuges=[{id:'0,0',x:0,z:70,name:'Airfield refuge'}];this.party=null;this.rescued=0;this.progress=0;this.active=null;this.target=null;this.lastRegion='';this.deliveries=0;this.updateSites({x:0,z:70});
 }
 updateSites(pos){
  const key=`${Math.round(pos.x/900)},${Math.round(pos.z/900)}`;if(key===this.lastRegion)return;this.lastRegion=key;
  const nearby=regionsNear(pos.x,pos.z),wanted=new Set(nearby.map(s=>s.id));
  for(const [id,site] of this.sites)if(!wanted.has(id)&&this.party?.id!==id){this.scene.remove(site.group);const materials=new Set();site.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});for(const m of materials)m.dispose();for(const b of site.boxes){for(const list of [obstacles,navigationObstacles]){const i=list.indexOf(b);if(i>=0)list.splice(i,1);}}for(const m of site.solids){const i=this.solids.indexOf(m);if(i>=0)this.solids.splice(i,1);}this.sites.delete(id);}
  for(const spec of nearby)if(!this.sites.has(spec.id))this.sites.set(spec.id,this.build(spec));
 }
 build(spec){
  const savedState=this.missions.get(spec.id),group=new T.Group(),site={...spec,group,boxes:[],solids:[],people:[],count:savedState?.people.length??expeditionOffer(spec).people,reward:expeditionOffer(spec).reward};group.position.set(spec.x,height(spec.x,spec.z),spec.z);this.scene.add(group);site.ready=this.repaired.has(site.id);
  const steel=material('#374b4a',.35),roof=material('#71614b'),stone=material('#9e6241'),paint=material('#d0c4a3');
  const building=(x,z,w,d,h,m=roof)=>{const b={x:spec.x+x,z:spec.z+z,w,d,h};obstacles.push(b);navigationObstacles.push(b);site.boxes.push(b);const mesh=box(group,[w,h,d],[x,h/2,z],m);site.solids.push(mesh);this.solids.push(mesh);box(group,[w+.7,.3,d+.7],[x,h+.15,z],steel);box(group,[w*.45,h*.65,.12],[x,h*.33,z+d/2+.07],steel);};
  if(spec.kind==='home'){
   // Refuge stays on the open apron, clear of the original starting vehicles.
   group.position.set(12,0,70);site.x=12;site.z=70;
   for(const s of [-1,1])segment(group,[s*3,0,0],[s*3,3.4,0],.1,steel);box(group,[7,.18,4],[0,3.4,0],paint);
  }else if(spec.kind==='relay'){
   building(-18,0,10,9,4);for(const s of [-1,1])for(const q of [-1,1])segment(group,[s*3,0,q*3],[s*.5,34,q*.5],.2,steel);
   for(let y=4;y<32;y+=5){segment(group,[-2,y,-2],[2,y+4,2],.12,steel);segment(group,[2,y,-2],[-2,y+4,2],.12,steel);}
   const dish=new T.Mesh(new T.SphereGeometry(3.5,16,8,0,Math.PI*2,0,Math.PI*.42),paint);dish.position.set(0,26,1);dish.rotation.x=Math.PI*.45;group.add(dish);
  }else if(spec.kind==='quarry'){
   building(-20,-6,12,10,5);for(let i=0;i<4;i++)box(group,[9,3+i*2,12],[19+i*4,(3+i*2)/2,-16-i*7],stone);
   segment(group,[-8,0,-19],[-8,18,-19],.6,steel);segment(group,[-8,18,-19],[22,18,-19],.5,paint);segment(group,[20,18,-19],[20,3,-19],.05,steel);
  }else if(spec.kind==='settlement'){
   building(-23,-15,12,11,5,paint);building(23,-15,13,12,6,stone);building(-22,15,10,11,4,roof);
   for(let i=0;i<4;i++)box(group,[.3,4,.3],[-8+i*5,2,-9],steel);box(group,[19,.2,6],[0,4,-9],paint);
  }else{
   building(-24,-6,14,16,6,paint);for(let i=0;i<3;i++){cylinder(group,3,3,8,[16+i*7,4,-13],steel,16);segment(group,[16+i*7,8,-13],[16+i*7,10,-13],.16,roof);}box(group,[30,.25,8],[6,5,14],paint);for(const x of [-6,18])segment(group,[x,0,14],[x,5,14],.15,steel);
  }
  const beacon=new T.Mesh(new T.CylinderGeometry(.2,.2,12,8),new T.MeshBasicMaterial({color:'#eebd64',transparent:true,opacity:.65,depthWrite:false}));beacon.position.set(0,6,3);group.add(beacon);site.beacon=beacon;
  site.radio=box(group,[1.1,1.4,.8],[0,.7,3],steel);segment(group,[0,1.4,3],[0,3.8,3],.025,paint);
  if(spec.kind!=='home')for(let i=0;i<site.count;i++){const m=survivor(i);m.position.set(-4+i*2,0,-1);group.add(m);site.people[i]=m;}
  if(spec.kind==='quarry'){
   const kit=new T.Group();kit.position.set(10,.45,13);group.add(kit);site.kit=kit;
   box(kit,[1.25,.8,.9],[0,0,0],paint);const red=material('#bd5540');box(kit,[.7,.05,.2],[0,.42,0],red);box(kit,[.2,.05,.65],[0,.43,0],red);
   const marker=new T.Mesh(new T.CylinderGeometry(.12,.12,4,8),new T.MeshBasicMaterial({color:'#8ddaca',transparent:true,opacity:.7,depthWrite:false}));marker.position.y=2.5;kit.add(marker);
  }
  site.count=site.people.length;
  site.state=savedState||this.freshState(site);this.missions.set(site.id,site.state);
  const dynamic=new Set([beacon,...site.people]);site.kit?.traverse(o=>dynamic.add(o));compositeStatic(group,dynamic);this.syncPeople(site);this.onAdd?.(group);return site;
 }
 freshState(site){return {kit:false,signal:0,people:site.people.map((_,i)=>({x:site.x-4+i*2,z:site.z-1}))};}
 setPeopleCount(site,count){
  while(site.people.length>count){const mesh=site.people.pop();site.group.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  while(site.people.length<count){const mesh=survivor(site.people.length);site.group.add(mesh);site.people.push(mesh);this.onAdd?.(mesh);}
  site.count=count;
 }
 peopleVisible(site){return (!this.done.has(site.id)||site.kind==='relay')&&this.party?.id!==site.id;}
 syncPeople(site,visibility=true){for(let i=0;i<site.people.length;i++){const p=site.state.people[i],m=site.people[i];m.position.set(p.x-site.group.position.x,height(p.x,p.z)-site.group.position.y,p.z-site.group.position.z);if(visibility)m.visible=this.peopleVisible(site);}if(site.kit)site.kit.visible=!site.state.kit&&!site.ready;}
 missionSnapshot(){return {version:1,relays:this.relays,sites:[...this.missions].map(([id,state])=>[id,structuredClone(state)])};}
 restoreMissions(snapshot){
  this.relays=snapshot?.relays||0;this.missions=new Map((snapshot?.sites||[]).map(([id,state])=>[id,structuredClone(state)]));this.boarding=null;
  for(const site of this.sites.values()){
   const state=this.missions.get(site.id);this.setPeopleCount(site,state?.people.length??(site.kind==='home'?0:expeditionOffer(site).people));
   site.state=state||this.freshState(site);this.missions.set(site.id,site.state);this.syncPeople(site);
   for(const m of site.people){m.userData.path={};poseSurvivor(m,false,0);}
  }
 }
 addRefuge(site){if(!this.refuges.some(r=>r.id===site.id))this.refuges.push({id:site.id,x:site.x,z:site.z,name:site.name+' refuge'});}
 movePeople(site,dt,{pos,mode,body,dead,damaged,capacity}){
  const distance=Math.hypot(pos.x-site.x,pos.z-site.z),grounded=pos.y-height(pos.x,pos.z)<4;
  const collecting=site.ready&&site.kind!=='relay'&&mode!=='foot'&&!dead&&grounded&&distance<60&&Math.abs(body.speed)<3&&body.health!==0&&capacity>=site.count;
  const following=site.ready&&site.kind!=='relay'&&mode==='foot'&&!dead&&grounded&&distance<45;
  const yaw=body.yaw||0,door={x:pos.x+Math.sin(yaw)*3.1,z:pos.z+Math.cos(yaw)*3.1};let arrived=0;
  for(let i=0;i<site.people.length;i++){
   const person=site.state.people[i],mesh=site.people[i],before={...person};
   const destination=collecting?door:following?{x:pos.x-3+i*2,z:pos.z+3}:null;
   const step=moveSurvivor(person,destination,dt,site.kind==='quarry'?1.25:2.8,navigationObstacles,mesh.userData.path);
   if(step>.0001)mesh.rotation.y=Math.atan2(before.x-person.x,before.z-person.z);
   const boarded=collecting&&Math.hypot(person.x-door.x,person.z-door.z)<.75;if(boarded)arrived++;
   mesh.visible=!boarded;poseSurvivor(mesh,step>.0001,dt);
  }
  this.syncPeople(site,false);
  if(collecting){this.boarding={id:site.id,vehicle:body.fleetId,arrived,total:site.count};if(arrived===site.count){
   this.party={id:site.id,x:site.x,z:site.z,name:site.name,count:site.count,reward:site.reward,vehicle:body.fleetId};this.boarding=null;this.onSignal?.('rescue');this.onMessage(`${site.count} passengers aboard. Return to the marked refuge.`,5);
  }}else if(site.ready&&mode!=='foot'&&distance<60&&capacity<site.count)this.onMessage(`Need ${site.count} passenger seats. Find a rescue carrier.`,.3);
 }
 nearestRefuge(pos){return [...this.refuges].sort((a,b)=>Math.hypot(pos.x-a.x,pos.z-a.z)-Math.hypot(pos.x-b.x,pos.z-b.z))[0];}
 update(dt,{pos,mode,body,holding,dead,damaged,capacity}){
  dt=Math.max(0,Math.min(dt,.1));this.updateSites(pos);this.boarding=null;
  for(const s of this.sites.values()){const d=Math.hypot(pos.x-s.x,pos.z-s.z);if(d<80)this.visited.add(s.id);s.beacon.material.color.set(this.done.has(s.id)||s.kind==='home'?'#83d8b2':s.kind==='quarry'?'#8ddaca':'#eebd64');for(const m of s.people)m.visible=this.peopleVisible(s);if(s.kind==='relay'){if(d>12||mode!=='foot'||dead)s.state.signal=0;else if(damaged)s.state.signal=Math.max(0,s.state.signal-dt*.5);}}
  if(this.party){
   const home=this.nearestRefuge(pos);this.target={...home,kind:'return',distance:Math.hypot(pos.x-home.x,pos.z-home.z)};
   if(dead){this.onMessage('Your passengers returned to shelter. Collect them again.',5);const s=this.sites.get(this.party.id);if(s){s.state.people=this.freshState(s).people;this.syncPeople(s);}this.party=null;this.progress=0;return;}
   if(mode==='foot'){
    // Passengers wait at the last parked vehicle; extraction requires transport.
    this.onMessage('Your passengers are waiting in the vehicle.',.25);return;
   }
   if(body.fleetId!==this.party.vehicle){this.onMessage('Return to the vehicle carrying your survivors.',.25);return;}
   if(this.target.distance<24&&Math.abs(body.speed)<6&&pos.y-height(pos.x,pos.z)<4){
    const n=this.party.count;this.rescued+=n;this.deliveries++;this.done.add(this.party.id);this.addRefuge(this.party);this.onReward(this.party.reward,n);this.onSignal?.('rescue');this.onMessage(`${n} survivors safe. +${this.party.reward} scrap, repairs and a new refuge.`,6);this.party=null;this.progress=0;
   }return;
  }
  const candidates=[...this.sites.values()].filter(s=>s.kind!=='home'&&!this.done.has(s.id));candidates.sort((a,b)=>Math.hypot(pos.x-a.x,pos.z-a.z)-Math.hypot(pos.x-b.x,pos.z-b.z));const site=candidates[0];if(!site){this.target=null;return;}
  const distance=Math.hypot(pos.x-site.x,pos.z-site.z),needsKit=site.kind==='quarry'&&!site.state.kit&&!site.ready;
  const taskPos=needsKit?{x:site.x+10,z:site.z+13}:{x:site.x,z:site.z+3},taskDistance=Math.hypot(pos.x-taskPos.x,pos.z-taskPos.z),stage=needsKit?'kit':site.kind==='quarry'?'triage':'radio',duration=needsKit?2:6;
  this.target={id:site.id,name:site.name,x:site.x,z:site.z,kind:'rescue',action:missionName(site),distance,count:site.count,seats:site.kind==='relay'?0:site.count};
  if(!site.ready){
   const key=site.id+':'+stage;if(this.active!==key){this.active=key;this.progress=0;}
   if(taskDistance<(needsKit?3:8)&&pos.y-height(pos.x,pos.z)<3&&mode==='foot'&&!dead){
    // Taking cover or firing back does not undo completed repair/triage work.
    if(holding&&!damaged)this.progress=Math.min(duration,this.progress+dt);
    if(this.progress>=duration){if(needsKit){site.state.kit=true;site.kit.visible=false;this.progress=0;this.active=null;this.onMessage('Medical supplies collected. Return to the survivors and hold F to stabilize them.',5);}
     else{site.ready=true;this.repaired.add(site.id);this.onMessage(site.kind==='relay'?'Radio online. Stay on foot near the relay until calibration finishes.':site.kind==='quarry'?'Survivors stabilized. Lead them to a stopped carrier.':'Survivors ready. They will follow you to a stopped transport.',5);}}
   }
  }
  if(site.ready&&site.kind==='relay'){
   if(distance<12&&mode==='foot'&&!dead&&!damaged&&pos.y-height(pos.x,pos.z)<3)site.state.signal=Math.min(12,site.state.signal+dt);
   if(site.state.signal>=12){this.done.add(site.id);this.relays++;this.addRefuge(site);this.onReward(site.reward,0);this.onSignal?.('rescue');this.onMessage(`Relay restored. +${site.reward} scrap and a new forward refuge.`,6);this.progress=0;}
  }else if(site.ready)this.movePeople(site,dt,{pos,mode,body,dead,damaged,capacity});
 }
 prompt(pos,mode){
  const s=this.sites.get(this.target?.id);if(!s||this.party||this.target.distance>65)return '';
  if(s.ready&&s.kind==='relay')return `Stay on foot within 12 m · relay calibration ${Math.floor(s.state.signal/12*100)}% · damage interrupts`;
  if(this.boarding?.id===s.id)return `Keep transport stopped · ${this.boarding.arrived}/${s.count} survivors aboard`;
  if(s.ready)return mode==='foot'?`Lead ${s.count} survivors to a stopped transport · stay nearby`:`Stop near survivors · ${s.count} passenger seats required`;
  if(s.kind==='quarry'&&!s.state.kit)return `Medical crate · ${Math.round(Math.hypot(pos.x-s.x-10,pos.z-s.z-13))} m · hold F to collect ${Math.floor(this.progress/2*100)}%`;
  return mode==='foot'?`Hold F to ${s.kind==='quarry'?'stabilize survivors':'repair radio'} ${Math.floor(this.progress/6*100)}%`:'Exit and help the shelter';
 }
 reset(){this.done.clear();this.repaired.clear();this.visited.clear();this.refuges.length=1;this.party=null;this.rescued=this.deliveries=this.progress=this.relays=0;this.active=null;this.missions.clear();this.boarding=null;for(const s of this.sites.values()){s.ready=false;this.setPeopleCount(s,s.kind==='home'?0:expeditionOffer(s).people);s.state=this.freshState(s);this.missions.set(s.id,s.state);for(const m of s.people){m.userData.path={};poseSurvivor(m,false,0);}this.syncPeople(s);}}
 report(){return {rescued:this.rescued,deliveries:this.deliveries,relays:this.relays,visited:this.visited.size,completed:[...this.done],party:this.party,boarding:this.boarding,progress:this.progress,target:this.target,sites:[...this.sites.values()].map(s=>({id:s.id,x:s.x,z:s.z,name:s.name,kind:s.kind,count:s.count,ready:!!s.ready,mission:missionName(s),kit:s.state.kit,signal:s.state.signal,people:s.state.people.map(p=>({...p}))})),refuges:this.refuges.length};}
}
