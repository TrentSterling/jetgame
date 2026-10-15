import * as T from 'three/webgpu';
import {buggy,jet,box,segment,material,disposeVehicle,batchVehicle} from './art.js';
import {height} from './terrain.js';
import {resetDriving} from './driving.js';
export const vehicleKinds={buggy:{name:'Armed buggy',seats:2,cruise:42,boost:62,torque:1,armor:1},scout:{name:'Rally scout',seats:1,cruise:52,boost:76,torque:1.15,armor:1.15},carrier:{name:'Rescue carrier',seats:6,cruise:34,boost:49,torque:.85,armor:.65}};
function model(kind){const mesh=buggy({batch:false});if(kind==='carrier'){const olive=material('#6d8770'),cloth=material('#a7a58b');box(mesh,[2.05,.3,3.7],[0,1.12,.3],olive);box(mesh,[2,.15,3.25],[0,2.6,.25],cloth);for(const s of [-1,1]){box(mesh,[.2,.6,2.4],[s*.95,1.55,.65],olive);segment(mesh,[s*.95,1,1.8],[s*.95,2.6,1.8],.07,olive);}box(mesh,[1.6,.9,.2],[0,1.6,1.8],olive);box(mesh,[.65,.18,.18],[0,2.72,-.8],material('#dbe6d8'));box(mesh,[.18,.5,.19],[0,2.72,-.8],material('#dbe6d8'));}else if(kind==='scout'){const red=material('#b65235',.3);box(mesh,[1.85,.42,1.6],[0,1.12,-1],red);box(mesh,[2.3,.12,.55],[0,2.15,1.7],red);for(const s of [-1,1])segment(mesh,[s*.75,1,1.4],[s*.75,2.15,1.7],.06,red);}mesh.userData.driver.visible=false;for(const f of mesh.userData.boost)f.visible=false;return batchVehicle(mesh);}
const copy=b=>({...b,pos:b.pos.clone()});
export class Fleet{
 constructor(scene,car,carMesh,plane,jetMesh){this.scene=scene;this.car=car;this.plane=plane;this.entries=[];this.saved=new Map();this.active={car:this.register('starter-buggy','car','buggy',car,carMesh),jet:this.register('starter-jet','jet','jet',plane,jetMesh)};this.ensure('home-carrier','carrier',15,100);this.ensure('home-scout','scout',48,102);}
 register(id,type,kind,body,mesh){const spec=vehicleKinds[kind]||{name:'Strike aircraft',seats:2};Object.assign(body,{fleetId:id,kind,seats:spec.seats,cruise:spec.cruise,boostCap:spec.boost,driveTorque:spec.torque,armor:spec.armor??1});const entry={id,type,kind,name:spec.name,body,mesh};this.entries.push(entry);this.onAdd?.(mesh);return entry;}
 ensure(id,kind,x,z){if(this.entries.some(e=>e.id===id))return;const mesh=model(kind),saved=this.saved.get(id),body=saved?copy(saved):{pos:new T.Vector3(x,height(x,z),z),yaw:0,speed:0,health:100,impactAt:0,boost:1,boostDelay:0,boosting:false,boostLocked:false};resetDriving(body);mesh.position.copy(body.pos);mesh.rotation.y=body.yaw;mesh.visible=body.health>0;this.scene.add(mesh);return this.register(id,'car',kind,body,mesh);}
 ensureJet(id,x,z){if(this.entries.some(e=>e.id===id))return;const mesh=jet(),saved=this.saved.get(id),body=saved?copy(saved):{pos:new T.Vector3(x,height(x,z)+1.05,z),yaw:0,pitch:0,flightPitch:0,roll:0,speed:0,health:100,impactAt:0,taxiing:true,skimming:false,boost:1,boostDelay:0,boosting:false,boostLocked:false};mesh.position.copy(body.pos);mesh.visible=body.health>0;for(const f of mesh.userData.boost)f.visible=false;this.scene.add(mesh);return this.register(id,'jet','jet',body,mesh);}
 update(sites,pos,passengerVehicle){
  const canLoad=(id,x,z)=>{if(this.entries.some(e=>e.id===id))return false;const p=this.saved.get(id)?.pos||{x,z};return Math.hypot(p.x-pos.x,p.z-pos.z)<1600;};
  for(const [id,b] of this.saved)if(canLoad(id,b.pos.x,b.pos.z)){if(b.kind==='jet')this.ensureJet(id,b.pos.x,b.pos.z);else this.ensure(id,b.kind,b.pos.x,b.pos.z);}
  for(const s of sites.values())if(s.kind!=='home'){
   if(canLoad('site-'+s.id,s.x+8,s.z+16))this.ensure('site-'+s.id,s.kind==='relay'?'scout':s.kind==='depot'?'buggy':'carrier',s.x+8,s.z+16);
   if(s.kind==='relay'&&canLoad('jet-'+s.id,s.x+28,s.z+15))this.ensureJet('jet-'+s.id,s.x+28,s.z+15);
  }
  for(let i=this.entries.length-1;i>=0;i--){const e=this.entries[i];if(e===this.active[e.type]||e.id.startsWith('home-')||e.id.startsWith('starter-')||e.id===passengerVehicle)continue;if(e.body.pos.distanceTo(pos)>1850){this.saved.set(e.id,copy(e.body));this.scene.remove(e.mesh);disposeVehicle(e.mesh);this.entries.splice(i,1);}}
  // Detailed parked models are useful on approach. Keep their simulation
  // records resident without submitting hundreds of distant vehicle parts.
  for(const e of this.entries)e.mesh.visible=e.body.health>0&&(e===this.active[e.type]||e.body.pos.distanceTo(pos)<(e.type==='jet'?800:400));
 }
 nearest(pos){return this.entries.filter(e=>e.body.health>0&&Math.abs(e.body.speed)<9&&Math.abs(pos.y-e.body.pos.y)<3&&pos.distanceTo(e.body.pos)<(e.type==='jet'?5.8:4.2)).sort((a,b)=>pos.distanceTo(a.body.pos)-pos.distanceTo(b.body.pos))[0]||null;}
 select(entry){const old=this.active[entry.type];if(entry===old)return entry;const body=entry.type==='car'?this.car:this.plane;old.body=copy(body);old.body.speed=old.body.vx=old.body.vz=old.body.vy=0;old.mesh.userData.driver&&(old.mesh.userData.driver.visible=false);for(const f of old.mesh.userData.boost)f.visible=false;const position=body.pos;Object.assign(body,copy(entry.body));position.copy(body.pos);body.pos=position;entry.body=body;this.active[entry.type]=entry;return entry;}
 reset(){this.saved.clear();for(const e of [...this.entries])if(!e.id.startsWith('starter-')){this.scene.remove(e.mesh);disposeVehicle(e.mesh);}this.entries=this.entries.filter(e=>e.id.startsWith('starter-'));for(const type of ['car','jet']){const entry=this.entries.find(e=>e.type===type);this.select(entry);entry.body.health=100;entry.mesh.visible=true;}this.ensure('home-carrier','carrier',15,100);this.ensure('home-scout','scout',48,102);}
 restore(snapshot){
  this.reset();this.saved=new Map(snapshot.bodies.map(b=>[b.fleetId,{...b,pos:new T.Vector3().fromArray(b.pos)}]));
  for(const id of Object.values(snapshot.active))if(!this.entries.some(e=>e.id===id)){const b=this.saved.get(id);if(b.kind==='jet')this.ensureJet(id,b.pos.x,b.pos.z);else this.ensure(id,b.kind,b.pos.x,b.pos.z);}
  for(const type of ['car','jet'])this.select(this.entries.find(e=>e.id===snapshot.active[type]));
  for(const e of this.entries){const b=this.saved.get(e.id);if(!b)continue;const p=e.body.pos;Object.assign(e.body,copy(b));p.copy(b.pos);e.body.pos=p;e.mesh.position.copy(p);e.mesh.rotation.y=e.body.yaw;e.mesh.visible=e.body.health>0;}
 }
 report(){return this.entries.map(e=>({id:e.id,type:e.type,kind:e.kind,name:e.name,seats:e.body.seats,health:e.body.health,position:e.body.pos.toArray(),active:e===this.active[e.type]}));}
}
