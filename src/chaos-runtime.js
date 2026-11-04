import * as T from 'three/webgpu';
import {box,cylinder,segment,material} from './art.js';
import {compositeRigid} from './composite.js';
import {createSurvivorRig,poseSurvivorRig} from './survivor-rig.js';
import {height} from './terrain.js';
import {freeSpot} from './collision.js';
import {VEHICLE_KITS,CHAOS_SITES,kitEnabled,claimEncounter,recordEncounterKills,DemolitionChain} from './chaos-state.js';
const clamp=T.MathUtils.clamp;
// Fixed scenery, one active vehicle kit rig, one crew character and eight mines.
// No DOM, timers, per-enemy objects or additional GPU storage bindings.
export class WastelandChaos{
 constructor(scene,upgrades,fx,{obstacles=[],clip,explode,message=()=>{},save=()=>{}}={}){
  Object.assign(this,{scene,upgrades,fx,obstacles,clip,explode,message,save});
  this.chain=new DemolitionChain();this.track=0;this.hold=0;this.holdSite=-1;
  this.scatterAt=0;this.crewAt=0;this.lastHurt=-100;this.lastHealth=100;this.lastBody=null;this.scouted='';
  this.supportShots=0;this.mineExplosions=0;this.mount=new T.Group();this.mount.name='Active vehicle equipment';this.mount.matrixAutoUpdate=false;scene.add(this.mount);
  const steel=material('#465454',.45,.5),paint=material('#d49648',.2),dark=material('#202c2e',.4),rubber=material('#343c38');
  this.groups={};
  for(const kit of VEHICLE_KITS){const g=new T.Group();g.name=kit.name;g.visible=false;this.groups[kit.id]=g;this.mount.add(g);}
  const ram=this.groups.ram;
  const plow=box(ram,[2.65,.6,.18],[0,.75,-2.28],steel);plow.rotation.x=-.34;
  for(const s of [-1,1])segment(ram,[s*.8,.7,-1.4],[s*.8,.7,-2.26],.09,dark);
  box(ram,[2.75,.12,.25],[0,.47,-2.38],paint);
  for(const s of [-1,1]){
   box(this.groups.side,[.16,.55,2.65],[s*1.2,1,.1],steel);
   for(const z of [-.9,.8])box(this.groups.side,[.2,.13,.5],[s*1.22,1.08,z],paint);
   for(const z of [-1.35,1.35]){segment(this.groups.dampers,[s*.95,1.3,z],[s*1.15,.57,z],.055,paint);for(let j=0;j<4;j++)cylinder(this.groups.dampers,.09,.09,.045,[s*1.05,.76+j*.105,z],steel,8);}
   const gun=this.groups.scatter;box(gun,[.38,.27,.5],[s*1.28,1.45,.3],steel);
   for(const z of [.12,.42])segment(gun,[s*1.32,1.48,z],[s*1.95,1.48,z],.045,dark);
  }
  box(this.groups.mines,[1.3,.14,.55],[0,1.25,1.95],steel);
  for(const x of [-.42,0,.42])cylinder(this.groups.mines,.18,.19,.14,[x,1.4,1.95],paint,10);
  for(const g of Object.values(this.groups))compositeRigid(g);
  this.crew=createSurvivorRig({variant:2,role:'rifle'});this.crew.name='Rescued passenger gunner';this.crew.visible=false;this.mount.add(this.crew);
  this.mineMesh=new T.InstancedMesh(new T.CylinderGeometry(.26,.32,.14,10),paint,8);this.mineMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mineMesh.count=0;this.mineMesh.frustumCulled=false;scene.add(this.mineMesh);
  this.mines=[];this.dummy=new T.Object3D();this.p=new T.Vector3();this.q=new T.Vector3();this.v=new T.Vector3();this.axis=new T.Vector3();
  this.sites=CHAOS_SITES.map((site,index)=>{
   const group=new T.Group();group.name=site.name;group.position.set(site.x,height(site.x,site.z),site.z);scene.add(group);
   const beacon=cylinder(group,.13,.13,13,[0,6.5,0],new T.MeshBasicMaterial({color:index===0?'#dfad5e':index===1?'#83d5cb':'#df825e'}),8);
   if(site.kind==='garage'){
    for(const x of [-5,5])for(const z of [-4,4])segment(group,[x,0,z],[x,4.2,z],.12,steel);
    const roof=box(group,[11,.17,10],[0,4.25,0],paint);roof.rotation.z=.05;
    box(group,[3,1.1,1.5],[0,.65,0],steel);for(const x of [-.9,.9])box(group,[.12,1.25,1.65],[x,.65,0],paint);
   }else if(site.kind==='cache'){
    const truck=new T.Group();truck.position.set(-6,.35,-5);truck.rotation.z=.18;group.add(truck);
    box(truck,[2.3,.55,5],[0,1,0],steel);box(truck,[2.15,1.5,1.7],[0,1.9,-1.6],paint);box(truck,[2.2,1.1,2.7],[0,1.6,.8],steel);
    for(const x of [-1.15,1.15])for(const z of [-1.5,1.55]){const w=cylinder(truck,.5,.5,.3,[x,.55,z],rubber);w.rotation.z=Math.PI/2;}
    box(group,[2,1,1.4],[0,.55,0],paint);box(group,[2.1,.14,1.5],[0,1.08,0],steel);
   }else{
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2,x=Math.cos(a)*105,z=Math.sin(a)*105;const y=height(site.x+x,site.z+z)-group.position.y;segment(group,[x,y,z],[x,y+3.7,z],.08,steel);box(group,[1.1,.6,.08],[x,y+3.1,z],paint);}
   }
   // Cosmetic open shelters and wrecks cannot create invisible collision traps.
   compositeRigid(group,new Set([beacon]));return {group,beacon,index};
  });
 }
 reset(){this.chain.reset();this.mines.length=0;this.mineMesh.count=0;this.crew.visible=false;this.hold=0;this.holdSite=-1;this.scatterAt=this.crewAt=this.dropAt=0;this.scouted='';this.lastBody=null;this.track=0;}
 cycle(){this.track=this.track>=CHAOS_SITES.length-1?-1:this.track+1;this.message(this.track<0?'TRACKING SURVIVOR MISSIONS':'TRACKING '+CHAOS_SITES[this.track].name,2);}
 nearby(pos){return CHAOS_SITES.map((site,index)=>({site,index,distance:Math.hypot(pos.x-site.x,pos.z-site.z)})).sort((a,b)=>a.distance-b.distance)[0];}
 target(pos,expeditions){
  if(this.track<0||expeditions.party||expeditions.boarding)return null;
  const site=CHAOS_SITES[this.track];if(!site||this.upgrades.chaosProgress.done&(1<<this.track))return null;
  if(expeditions.target?.distance<130&&Math.hypot(pos.x-site.x,pos.z-site.z)>130)return null;
  const kills=this.upgrades.chaosProgress.kills[this.track],distance=Math.hypot(pos.x-site.x,pos.z-site.z);
  return {...site,label:site.name,distance,kills,detail:kills<site.goal?`${kills}/${site.goal} CLEARED · N CHANGE TARGET`:site.kind==='horde'?'CROWD CLEARED':distance<12?'STOP AND HOLD F TO SALVAGE':'REACH THE SUPPLIES · N CHANGE TARGET'};
 }
 invalidateRewards(){this.rewardEpoch=(this.rewardEpoch||0)+1;this.chain.reset();}
 onStats(stats,context){if(context.stale)return {kills:0,boost:0,total:0};const reward=this.chain.sample(stats,context);if(context.active&&reward.total>0)recordEncounterKills(this.upgrades.chaosProgress,context.body.pos,reward.total);return reward;}
 clearSupport(horde){for(const list of [horde.supportOrigins?.array,horde.supportRays?.array])for(const v of list||[])v.set(0,0,0,0);this.slots=0;}
 emitShot(horde,origin,dir,range,damage,color='#ffd795'){
  if(this.slots>=8)return false;const d=this.v.copy(dir).normalize(),cast=this.clip(origin,d,range),i=this.slots++;
  horde.supportOrigins.array[i].set(origin.x,origin.y,origin.z,damage);horde.supportRays.array[i].set(d.x,d.y,d.z,cast.range);
  this.fx.tracer(origin,this.q.copy(origin).addScaledVector(d,cast.range),color,.07,.035);this.fx.weaponFire(origin,d,'car');this.supportShots++;return true;
 }
 nearestEnemy(targets,origin,range,axis=null,cosine=-1){
  if(!targets.current())return null;
  const roots=targets.roots({x0:origin.x-range,x1:origin.x+range,y0:origin.y-range,y1:origin.y+range,z0:origin.z-range,z1:origin.z+range},1024)||[];
  roots.sort((a,b)=>{const ac=a.box,bc=b.box;return Math.hypot((ac.x0+ac.x1)/2-origin.x,(ac.z0+ac.z1)/2-origin.z)-Math.hypot((bc.x0+bc.x1)/2-origin.x,(bc.z0+bc.z1)/2-origin.z);});
  let visited=0;const candidates=[];
  outer:for(const bucket of roots)for(let id=targets.grid.heads[bucket.slot];id>=0;id=targets.next[id]){
   if(++visited>384)break outer;if(!targets.live(id))continue;const shape=targets.shape(id),m=targets.motion(id,targets.time),point=new T.Vector3(shape.center.x+m.x,shape.center.y+m.y,shape.center.z+m.z),dir=point.clone().sub(origin),distance=dir.length();
   if(distance<.5||distance>range)continue;dir.multiplyScalar(1/distance);if(axis&&dir.dot(axis)<cosine)continue;
   const rank=distance*(axis?1.4-dir.dot(axis)*.4:1);candidates.push({id,point,dir,distance,rank});
  }
  candidates.sort((a,b)=>a.rank-b.rank);
  for(const c of candidates.slice(0,6))if(this.clip(origin,c.dir,c.distance).range>=c.distance-.12)return c;return null;
 }
 dropMine(body,time){
  const u=this.upgrades;if(!kitEnabled(u,'mines')||u.mineAmmo<=0||!body.grounded||this.mines.length>=8||time<(this.dropAt||0))return false;
  const x=body.pos.x+Math.sin(body.yaw)*3.5,z=body.pos.z+Math.cos(body.yaw)*3.5;if(!freeSpot(x,z,.4,this.obstacles))return false;
  this.mines.push({p:new T.Vector3(x,height(x,z)+.12,z),armed:time+.65,expires:time+24});u.mineAmmo--;this.dropAt=time+.6;this.save();return true;
 }
 step(dt,time,{body,car,carMesh,mode,dead,fire,drop,holding,targets,horde,expeditions,injured=false,allowEquipment=true}){
  this.chain.advance(dt);const u=this.upgrades;
  if(u.mineAmmo<3){u.mineReload+=dt;if(u.mineReload>=8){u.mineAmmo++;u.mineReload-=8;}}else u.mineReload=0;
  this.clearSupport(horde);
  carMesh.updateWorldMatrix(true,false);this.mount.matrix.copy(carMesh.matrixWorld);this.mount.matrixWorldNeedsUpdate=true;this.mount.visible=car.health>0&&carMesh.visible;
  for(const kit of VEHICLE_KITS)this.groups[kit.id].visible=allowEquipment&&kitEnabled(u,kit.id);
  if(this.lastBody!==car){this.lastBody=car;this.lastHealth=car.health;this.lastHurt=time;}
  if(car.health<this.lastHealth||injured)this.lastHurt=time;this.lastHealth=car.health;
  const party=expeditions.party,aboard=!dead&&mode==='car'&&party?.vehicle===car.fleetId&&party.count>0;
  this.crew.visible=!!aboard;let firing=false;
  if(!dead&&mode==='car'&&allowEquipment&&fire&&kitEnabled(u,'scatter')&&time>=this.scatterAt){
   this.scatterAt=time+.42;
   for(const s of [-1,1]){
    const origin=new T.Vector3(s*1.94,1.48,.28).applyMatrix4(carMesh.matrixWorld),axis=new T.Vector3(s,0,0).transformDirection(carMesh.matrixWorld);
    const enemy=this.nearestEnemy(targets,origin,54,axis,.55),aim=enemy?.dir||axis;
    const up=new T.Vector3(0,1,0).transformDirection(carMesh.matrixWorld),across=new T.Vector3().crossVectors(aim,up).normalize();
    for(let j=-1;j<=1;j++){const d=aim.clone().addScaledVector(across,j*.07).addScaledVector(up,(j===0?.02:-.015)).normalize();this.emitShot(horde,origin,d,54,78);}
   }
  }
  if(aboard){
   this.crew.position.set(.64,car.kind==='carrier'?1.52:1.30,.42);
   let enemy=null;
   if(time>=this.crewAt){
    const origin=new T.Vector3(.72,1.85,.25).applyMatrix4(carMesh.matrixWorld),axis=new T.Vector3(0,0,-1).transformDirection(carMesh.matrixWorld);
    enemy=this.nearestEnemy(targets,origin,75,axis,.05);
    this.crewAt=time+(enemy?.22:.3);
    if(enemy){const local=enemy.point.clone();carMesh.worldToLocal(local);local.sub(this.crew.position);this.crewYaw=Math.atan2(-local.x,-local.z);this.crewPitch=Math.atan2(local.y-.34,Math.hypot(local.x,local.z));}
   }
   this.crew.rotation.set(0,clamp(Math.atan2(Math.sin(this.crewYaw||0),Math.cos(this.crewYaw||0)),-1.65,1.65),0);
   poseSurvivorRig(this.crew,{seated:true,seat:'gunner',dt,time,aimPitch:this.crewPitch||0,firing:!!enemy});
   if(enemy){
    this.mount.updateWorldMatrix(true,true);
    const origin=this.crew.userData.muzzle.getWorldPosition(new T.Vector3()),dir=enemy.point.clone().sub(origin),distance=dir.length();
    dir.multiplyScalar(1/Math.max(.001,distance));
    if(this.clip(origin,dir,distance).range>=distance-.12)firing=this.emitShot(horde,origin,dir,distance+2,64,'#8ee5d6');
    this.crew.userData.flash.visible=firing;
   }
   if(party.count>=3&&time-this.lastHurt>5&&car.health<100&&(party.crewRepair||0)<20){const n=Math.min(dt*.7,20-(party.crewRepair||0),100-car.health);car.health+=n;party.crewRepair=(party.crewRepair||0)+n;this.lastHealth=car.health;}
   if(party.count>=5&&this.scouted!==party.id){this.scouted=party.id;const next=CHAOS_SITES.find((s,i)=>!(u.chaosProgress.done&(1<<i)));if(next)this.message('SCOUT FOUND '+next.name+' · N TO TRACK',3);}
  }
  if(!dead&&mode==='car'&&drop&&allowEquipment){if(!this.dropMine(car,time))this.message(kitEnabled(u,'mines')?'MINE RACK RECHARGING · DROP ON SOLID GROUND':'BUY REAR MINE RACK IN UPGRADES',2);}
  for(let i=this.mines.length-1;i>=0;i--){const mine=this.mines[i];let remove=time>=mine.expires;
   if(!remove&&time>=mine.armed&&this.nearestEnemy(targets,mine.p,3.8)&&this.explode(mine.p,8.5)!==false){remove=true;this.mineExplosions++;}
   if(remove)this.mines.splice(i,1);
  }
  this.mineMesh.count=this.mines.length;
  for(let i=0;i<this.mines.length;i++){this.dummy.position.copy(this.mines[i].p);this.dummy.scale.setScalar(time>=this.mines[i].armed?1:.8);this.dummy.updateMatrix();this.mineMesh.setMatrixAt(i,this.dummy.matrix);}this.mineMesh.instanceMatrix.needsUpdate=true;
  const near=this.nearby(body.pos),progress=u.chaosProgress;
  for(const s of this.sites){s.group.visible=body.pos.distanceTo(s.group.position)<1100;s.beacon.visible=!(progress.done&(1<<s.index));}
  if(near&&!(progress.done&(1<<near.index))&&progress.kills[near.index]>=near.site.goal){
   const ready=near.site.kind==='horde'||near.distance<12&&Math.abs(body.speed||0)<7&&body.pos.y-height(body.pos.x,body.pos.z)<4&&holding;
   if(this.holdSite!==near.index){this.hold=0;this.holdSite=near.index;}
   this.hold=ready&&!dead?this.hold+dt:0;
   if(!dead&&(near.site.kind==='horde'&&near.distance<near.site.radius||this.hold>=2.2)){
    const result=claimEncounter(progress,near.index,u);if(result){this.message(`${result.site.name} CLEARED · +${result.site.reward} SCRAP${result.kit?' + '+result.kit.name:''}`,4);this.fx.sound('rescue');this.save();this.hold=0;}
   }
  }else this.hold=0;
  this.pressure=!dead&&near.distance<near.site.radius&&(!(progress.done&(1<<near.index))||near.site.kind==='horde')?{active:true,intensity:1.35,x:near.site.x,z:near.site.z,health:body.health,sheltered:false}:null;
  this.crewLabel=aboard?(party.count>=5?'GUNNER / MECHANIC / SCOUT':party.count>=3?'GUNNER / MECHANIC':'GUNNER'):'';
 }
 report(){return {track:this.track,kit:{...this.upgrades.vehicleKit},progress:structuredClone(this.upgrades.chaosProgress),crew:this.crewLabel||'',supportShots:this.supportShots,mines:this.mines.length,mineAmmo:this.upgrades.mineAmmo,mineExplosions:this.mineExplosions,boostBudget:this.chain.budget};}
}

