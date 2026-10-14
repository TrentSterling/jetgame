import * as T from 'three/webgpu';
import {box,cylinder,segment,material,humanoid} from './art.js';
import {height,obstacles,navigationObstacles} from './nav.js';
import {regionsNear,expeditionOffer} from './regions.js';
import {compositeStatic} from './composite.js';

function survivor(index){
 const source=humanoid(),geo=new T.BufferGeometry();for(const key of ['position','normal','color'])geo.setAttribute(key,source.getAttribute(key));source.dispose();
 const p=geo.getAttribute('position'),colors=geo.getAttribute('color'),part=source.getAttribute('part');
 const skin=new T.Color('#c6a17f'),jacket=new T.Color(index%2?'#748e87':'#c8954d'),trousers=new T.Color('#3b5054'),boots=new T.Color('#243334');
 for(let i=0;i<p.count;i++){const y=p.getY(i),hand=part.getX(i)>0&&part.getX(i)<3&&y<.96;const c=y>1.5||hand?skin:y>.9?jacket:y>.18?trousers:boots;colors.setXYZ(i,c.r,c.g,c.b);}
 const m=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.85}));m.rotation.y=Math.PI;m.castShadow=m.receiveShadow=true;return m;
}
export class Expeditions{
 constructor(scene,solids,onReward,onMessage,onSignal){
  this.scene=scene;this.solids=solids;this.onReward=onReward;this.onMessage=onMessage;this.onSignal=onSignal;this.sites=new Map();this.done=new Set();this.repaired=new Set();this.visited=new Set();this.refuges=[{id:'0,0',x:0,z:70,name:'Airfield refuge'}];this.party=null;this.rescued=0;this.progress=0;this.active=null;this.target=null;this.lastRegion='';this.deliveries=0;this.updateSites({x:0,z:70});
 }
 updateSites(pos){
  const key=`${Math.round(pos.x/900)},${Math.round(pos.z/900)}`;if(key===this.lastRegion)return;this.lastRegion=key;
  const nearby=regionsNear(pos.x,pos.z),wanted=new Set(nearby.map(s=>s.id));
  for(const [id,site] of this.sites)if(!wanted.has(id)&&this.party?.id!==id){this.scene.remove(site.group);const materials=new Set();site.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});for(const m of materials)m.dispose();for(const b of site.boxes){for(const list of [obstacles,navigationObstacles]){const i=list.indexOf(b);if(i>=0)list.splice(i,1);}}for(const m of site.solids){const i=this.solids.indexOf(m);if(i>=0)this.solids.splice(i,1);}this.sites.delete(id);}
  for(const spec of nearby)if(!this.sites.has(spec.id))this.sites.set(spec.id,this.build(spec));
 }
 build(spec){
  const group=new T.Group(),site={...spec,group,boxes:[],solids:[],people:[],count:expeditionOffer(spec).people,reward:expeditionOffer(spec).reward};group.position.set(spec.x,height(spec.x,spec.z),spec.z);this.scene.add(group);site.ready=this.repaired.has(site.id);
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
  site.count=site.people.length;compositeStatic(group,new Set([beacon,...site.people]));this.onAdd?.(group);return site;
 }
 nearestRefuge(pos){return [...this.refuges].sort((a,b)=>Math.hypot(pos.x-a.x,pos.z-a.z)-Math.hypot(pos.x-b.x,pos.z-b.z))[0];}
 update(dt,{pos,mode,body,holding,dead,damaged,capacity}){
  this.updateSites(pos);for(const s of this.sites.values()){const d=Math.hypot(pos.x-s.x,pos.z-s.z);if(d<80)this.visited.add(s.id);s.beacon.material.color.set(this.done.has(s.id)||s.kind==='home'?'#83d8b2':'#eebd64');for(const m of s.people)m.visible=!this.done.has(s.id)&&this.party?.id!==s.id;}
  if(this.party){
   const home=this.nearestRefuge(pos);this.target={...home,kind:'return',distance:Math.hypot(pos.x-home.x,pos.z-home.z)};
   if(dead){this.onMessage('Your passengers returned to shelter. Collect them again.',5);this.party=null;this.progress=0;return;}
   if(mode==='foot'){
    // Passengers wait at the last parked vehicle; extraction requires transport.
    this.onMessage('Your passengers are waiting in the vehicle.',.25);return;
   }
   if(body.fleetId!==this.party.vehicle){this.onMessage('Return to the vehicle carrying your survivors.',.25);return;}
   if(this.target.distance<24&&Math.abs(body.speed)<6&&pos.y-height(pos.x,pos.z)<4){
    const n=this.party.count;this.rescued+=n;this.deliveries++;this.done.add(this.party.id);this.refuges.push({id:this.party.id,x:this.party.x,z:this.party.z,name:this.party.name+' refuge'});this.onReward(this.party.reward,n);this.onSignal?.('rescue');this.onMessage(`${n} survivors safe. +${this.party.reward} scrap, repairs and a new refuge.`,6);this.party=null;this.progress=0;
   }return;
  }
  const candidates=[...this.sites.values()].filter(s=>s.kind!=='home'&&!this.done.has(s.id));candidates.sort((a,b)=>Math.hypot(pos.x-a.x,pos.z-a.z)-Math.hypot(pos.x-b.x,pos.z-b.z));const site=candidates[0];if(!site){this.target=null;return;}
  const distance=Math.hypot(pos.x-site.x,pos.z-site.z);this.target={id:site.id,name:site.name,x:site.x,z:site.z,kind:'rescue',distance,count:site.count};
  if(distance<9&&pos.y-height(pos.x,pos.z)<3&&mode==='foot'&&!dead){
   if(this.active!==site.id){this.active=site.id;this.progress=0;}
   this.progress=holding&&!damaged?Math.min(6,this.progress+dt):Math.max(0,this.progress-dt*.35);
   if(this.progress>=6){site.ready=true;this.repaired.add(site.id);this.onMessage('Radio repaired. Bring a vehicle to collect the survivors.',.3);}
  }
  if(site.ready&&distance<16&&mode!=='foot'&&!dead&&Math.abs(body.speed)<3&&pos.y-height(pos.x,pos.z)<4){
   if(capacity<site.count){this.onMessage(`Need ${site.count} passenger seats. Find a rescue carrier.`,.3);return;}
   this.party={id:site.id,x:site.x,z:site.z,name:site.name,count:site.count,reward:expeditionOffer(site).reward,vehicle:body.fleetId};this.onSignal?.('rescue');this.onMessage(`${site.count} passengers aboard. Return to the marked refuge.`,5);
  }
 }
 prompt(pos,mode){const s=this.sites.get(this.target?.id);if(!s||this.party||this.target.distance>16)return '';if(s.ready)return `Collect ${s.count} survivors in a vehicle with enough seats`;return mode==='foot'?`Hold F to repair radio ${Math.floor(this.progress/6*100)}%`: 'Exit and repair the shelter radio';}
 reset(){this.done.clear();this.repaired.clear();this.visited.clear();this.refuges.length=1;this.party=null;this.rescued=this.deliveries=this.progress=0;this.active=null;for(const s of this.sites.values())s.ready=false;}
 report(){return {rescued:this.rescued,deliveries:this.deliveries,visited:this.visited.size,completed:[...this.done],party:this.party,progress:this.progress,target:this.target,sites:[...this.sites.values()].map(s=>({id:s.id,x:s.x,z:s.z,name:s.name,kind:s.kind,count:s.count,ready:!!s.ready})),refuges:this.refuges.length};}
}
