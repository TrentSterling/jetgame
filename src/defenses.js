import * as T from 'three/webgpu';
import {box,cylinder,material} from './art.js';
import {height,terrainRayDistance} from './nav.js';
import {CrowdSnapshot} from './crowd-snapshot.js';
import {turretSites} from './spawn-layout.js';

// Two independent guns. Asynchronous snapshots are sampled four times a second;
// no readback blocks the animation loop and no player weapon state is reused.
export class SpawnDefenses{
 constructor(scene,world,fx){
  this.world=world;this.fx=fx;this.crowdSnapshot=new CrowdSnapshot();this.ray=new T.Raycaster();this.pending=null;
  const steel=material('#435554',.35,.62),dark=material('#293d3d',.3,.65),trim=material('#d59b47');
  this.guns=turretSites.map(({x,z},i)=>{
   const root=new T.Group();root.position.set(x,height(x,z),z);scene.add(root);
   cylinder(root,1.05,1.25,.35,[0,.175,0],dark,8);
   cylinder(root,.55,.8,1.8,[0,1.2,0],steel,8);
   cylinder(root,.9,.9,.22,[0,2.22,0],trim,10);
   const pivot=new T.Group();pivot.position.set(0,2.8,0);pivot.rotation.order='YXZ';root.add(pivot);
   box(pivot,[1.5,.7,1.05],[0,0,.18],steel);
   box(pivot,[1.56,.12,.4],[0,.25,.1],trim);
   box(pivot,[.45,.35,1.3],[0,0,-.85],dark);
   const flash=new T.Mesh(new T.IcosahedronGeometry(.15,0),new T.MeshBasicMaterial({color:'#ffe2a0'}));
   flash.position.set(0,0,-1.55);flash.scale.set(.8,.8,2);flash.visible=false;pivot.add(flash);
   root.traverse(o=>{if(o.isMesh&&o!==flash){o.userData.defenseGun=i;world.solids.push(o);}});
   return {root,pivot,flash,origin:new T.Vector3(x,height(x,z)+2.8,z),direction:new T.Vector3(),target:null,nextFire:i*.16,flashUntil:0,shots:0};
  });
  this.reset();
 }
 reset(time=0){this.crowdSnapshot.reset();this.epoch=(this.epoch||0)+1;this.generation=-1;this.nextScan=time;this.lastScan=-Infinity;this.scans=0;this.errors=[];this.rounds=0;this.blocked=0;for(const [i,g] of this.guns.entries()){g.target=null;g.nextFire=time+.3+i*.16;g.flashUntil=0;g.shots=0;g.flash.visible=false;g.pivot.rotation.set(0,i?Math.PI:0,0);}}
 warm(on){for(const g of this.guns)g.flash.visible=on;}
 clearShots(h){h.defenseIds.value.set(-1,-1);for(const o of h.defenseOrigins.array)o.w=0;}
 visible(origin,point,ownGun=-1){
  const dir=point.clone().sub(origin),distance=dir.length();if(distance<2||distance>58)return false;dir.divideScalar(distance);
  if(terrainRayDistance(origin,dir,distance)<distance-.55)return false;
  this.ray.set(origin,dir);this.ray.near=.1;this.ray.far=distance-.55;
  if(this.ray.intersectObjects(this.world.solids,false).some(hit=>hit.object.userData.defenseGun!==ownGun))return false;
  // Friendly bodies do not receive these target-specific rays. Do not stop
  // covering the player precisely when attackers reach their collision capsule.
  return true;
 }
 scan(h,time){
  if(this.pending)return this.pending;
  const epoch=this.epoch,generation=h.generation;
  const task=(async()=>{
   const snapshot=await this.crowdSnapshot.read(h,time);
   if(!snapshot||epoch!==this.epoch||generation!==h.generation)return;
   const p=snapshot.positions,s=snapshot.states,choices=this.guns.map(()=>[]);
   for(let id=0;id<h.count;id++){const k=id*4;if(s[k]<=0)continue;
    for(let i=0;i<this.guns.length;i++){const g=this.guns[i],d=(p[k]-g.origin.x)**2+(p[k+2]-g.origin.z)**2;if(d<58*58&&d>4)choices[i].push({id,d,threat:p[k]**2+(p[k+2]-70)**2,x:p[k],y:p[k+1]+.95*(s[k+3]===2?1.6:1),z:p[k+2]});}
   }
   const assigned=new Set();
   for(let i=0;i<this.guns.length;i++){
    const g=this.guns[i];g.target=null;choices[i].sort((a,b)=>a.threat-b.threat||a.d-b.d);
    // Bound occlusion work even when an entire crowd stands behind a hangar.
    for(const candidate of choices[i].slice(0,32)){if(assigned.has(candidate.id))continue;const point=new T.Vector3(candidate.x,candidate.y,candidate.z);if(this.visible(g.origin,point,i)){g.target={...candidate,point};assigned.add(candidate.id);break;}this.blocked++;}
   }
   this.lastScan=time;this.scans++;
  })().catch(e=>{if(epoch===this.epoch){this.errors.push(String(e));this.errors=this.errors.slice(-4);for(const g of this.guns)g.target=null;}}).finally(()=>{if(this.pending===task)this.pending=null;});
  this.pending=task;return task;
 }
 update(dt,time,h){
  if(this.generation!==h.generation){this.reset(time);this.generation=h.generation;}
  this.clearShots(h);
  if(time>=this.nextScan&&!this.pending){this.nextScan=time+.25;void this.scan(h,time);}
  for(const [i,g] of this.guns.entries()){
   g.flash.visible=time<g.flashUntil;
   if(!g.target||time-this.lastScan>.65)continue;
   const point=g.target.point,dir=g.direction.copy(point).sub(g.origin).normalize();
   g.pivot.rotation.set(Math.asin(dir.y),Math.atan2(-dir.x,-dir.z),0);
   if(time<g.nextFire)continue;
   g.nextFire=time+.18;
   const origin=g.origin.clone().addScaledVector(dir,1.55);
   if(!this.visible(origin,point,i)){this.blocked++;continue;}
   h.defenseOrigins.array[i].set(origin.x,origin.y,origin.z,60);
   h.defenseRays.array[i].set(dir.x,dir.y,dir.z,origin.distanceTo(point)+.8);
   h.defenseIds.value.setComponent(i,g.target.id);
   g.shots++;this.rounds++;g.flashUntil=time+.07;g.flash.visible=true;
   this.fx.tracer(origin,point,'#ffcf81',.085,.035);this.fx.sound('gun',origin);
  }
 }
 snapshot(time){return {version:1,rounds:this.rounds,guns:this.guns.map(g=>({shots:g.shots,cooldown:Math.max(0,g.nextFire-time)}))};}
 restore(data,time,h){this.reset(time);this.generation=h.generation;this.clearShots(h);if(!data)return;this.rounds=data.rounds;data.guns.forEach((s,i)=>{this.guns[i].shots=s.shots;this.guns[i].nextFire=time+s.cooldown;});}
 report(){return {rounds:this.rounds,scans:this.scans,blocked:this.blocked,pending:!!this.pending,errors:[...this.errors],guns:this.guns.map(g=>({position:g.origin.toArray(),shots:g.shots,target:g.target?.id??null}))};}
}
