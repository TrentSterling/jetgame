import * as T from 'three/webgpu';
import {navigationObstacles,terrainRayDistance} from './nav.js';
import {createFootBot,poseFootBot,createBotVehicle,poseBotVehicle} from './bot-art.js';
import {BOT_FOOT_RADIUS,BOT_CAR_RADIUS,findBotSpot,moveBotFoot,resetBotNavigation,freshBotSnapshot,friendlyBoxes} from './bot-navigation.js';
import {BOT_POLICIES,createBotDriver,resetBotDriver,updateBotDriver,vehiclePolicyGoal} from './bot-driving.js';

const FOOT_SITES=[[-4,63],[5,61]],CAR_SITES=[[-18,44],[22,38],[34,67]];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const copyTarget=t=>({id:t.id,x:t.x,y:t.y,z:t.z,hp:t.hp,type:t.type});
function retainCandidate(list,target,score){
 if(list.length===12&&score>=list[list.length-1].score)return;
 let i=0;while(i<list.length&&list[i].score<=score)i++;
 list.splice(i,0,{target,score});if(list.length>12)list.pop();
}

// Five local allies with their own state. They are never fleet entries, save
// ownership records, player weapon state, or clients in a networking system.
export class BotPlayers{
 constructor(scene,world,fx,ground){
  this.scene=scene;this.world=world;this.fx=fx;this.ground=ground;this.ray=new T.Raycaster();this.enabled=true;
  this.foot=FOOT_SITES.map((site,index)=>{
   const root=createFootBot(index);scene.add(root);
   return {index,root,pos:root.position,origin:new T.Vector3(),direction:new T.Vector3(),point:new T.Vector3(),target:null,goal:null,nav:resetBotNavigation(),nextFire:0,flashUntil:0,shots:0,distance:0,aimPitch:0};
  });
  this.cars=BOT_POLICIES.map((kind,index)=>{
   const mesh=createBotVehicle(kind);scene.add(mesh);
   return {...createBotDriver(kind,new T.Vector3()),index,mesh,target:null,old:new T.Vector3()};
  });
  this.reset(0);
 }
 clearInputs(h){
  if(!h)return;
  if(h.clearBotInputs){h.clearBotInputs();return;}
  h.botIds?.value.set(-1,-1);
  for(const value of h.botOrigins?.array||[])value.w=0;
  for(const value of h.botRays?.array||[])value.w=0;
  for(const value of h.botCars?.array||[])value.w=0;
  for(const value of h.botCarsOld?.array||[])value.w=0;
 }
 reset(time=0,playerPos=null){
  this.epoch=(this.epoch||0)+1;this.generation=-1;this.nextDecision=time;this.lastDecision=-Infinity;this.lastTime=time;this.rounds=0;this.decisions=0;this.blockedShots=0;this.staleFrames=0;
  const base=playerPos||{x:0,z:70},occupied=[];
  const spawn=(site,radius)=>{
   const point={x:base.x+site[0],z:base.z+site[1]-70},boxes=[...navigationObstacles,...friendlyBoxes(occupied,.4)];
   const spot=findBotSpot(point,radius,boxes,28)||findBotSpot(base,radius,boxes,42);
   // All normal spawn sites have open ground; an unusually dense restored
   // location is searched locally, rather than silently moved across the map.
   const result=spot||point;occupied.push({...result,r:radius});return new T.Vector3(result.x,this.ground(result.x,result.z),result.z);
  };
  for(const f of this.foot){
   f.pos.copy(spawn(FOOT_SITES[f.index],BOT_FOOT_RADIUS));f.root.rotation.set(0,0,0);f.root.visible=true;f.target=f.goal=null;f.nextFire=time+.45+f.index*.17;f.flashUntil=0;f.shots=f.distance=f.aimPitch=0;resetBotNavigation(f.nav);poseFootBot(f.root,{walking:0,dt:0,aimPitch:0,firing:false});
  }
  for(const c of this.cars){
   const position=spawn(CAR_SITES[c.index],BOT_CAR_RADIUS);resetBotDriver(c,position,0,time);c.target=null;c.old.copy(c.body.pos);c.mesh.visible=true;poseBotVehicle(c.mesh,c.body,0,this.ground);
  }
  this.clearInputs(this.horde);
 }
 warm(on){for(const f of this.foot)poseFootBot(f.root,{walking:0,dt:0,aimPitch:0,firing:!!on});}
 visible(origin,point){
  const dir=this._visibleDirection||(this._visibleDirection=new T.Vector3());dir.copy(point).sub(origin);const length=dir.length();
  if(length<1||length>58)return false;dir.divideScalar(length);
  if(terrainRayDistance(origin,dir,length)<length-.6)return false;
  this.ray.set(origin,dir);this.ray.near=.08;this.ray.far=Math.max(.1,length-.6);
  return this.ray.intersectObjects(this.world.solids,false).length===0;
 }
 decide(time,context,fresh){
  const player=context.playerPos,yaw=context.playerYaw||0,right={x:Math.cos(yaw),z:-Math.sin(yaw)},forward={x:-Math.sin(yaw),z:-Math.cos(yaw)};
  const choices=[[],[],[],[],[]];
  if(fresh)for(const target of context.snapshot.targets){
   if(!(target.hp>0)||!Number.isInteger(target.id)||![target.x,target.y,target.z].every(Number.isFinite))continue;
   const threat=distance(target,player);if(threat>130)continue;
   for(const f of this.foot){const d=distance(target,f.pos);if(d>1&&d<54)retainCandidate(choices[f.index],target,threat*.55+d);}
   for(const c of this.cars){
    const d=distance(target,c.body.pos);if(d>76||threat>108)continue;
    const score=c.kind==='escort'?threat*1.8+d*.25:c.kind==='rammer'?d+threat*.2:d+threat*.35;
    retainCandidate(choices[c.index+2],target,score);
   }
  }
  const assigned=new Set();
  for(const f of this.foot){
   f.target=null;f.origin.copy(f.pos);f.origin.y+=1.45;
   for(const {target} of choices[f.index]){
    if(assigned.has(target.id))continue;
    f.point.set(target.x,target.y+.95*(target.type===2?1.6:1),target.z);
    if(this.visible(f.origin,f.point)){f.target=copyTarget(target);assigned.add(target.id);break;}this.blockedShots++;
   }
   const side=f.index?6:-6,lead=f.target?7:4;
   f.goal={x:player.x+right.x*side+forward.x*lead,z:player.z+right.z*side+forward.z*lead};
   // Stop to cover a nearby fight, while keeping room around the player.
   if(f.target&&distance(f.pos,player)<17&&distance(f.pos,player)>4&&distance(f.pos,f.target)>9)f.goal={x:f.pos.x,z:f.pos.z};
  }
  for(const c of this.cars){
   c.target=choices[c.index+2][0]?copyTarget(choices[c.index+2][0].target):null;
   // A rammer commits briefly to its straight charge. Circler and escort
   // recompute their flanking/intercept points at the same bounded cadence.
   if(time>=c.nextDecision||!fresh||!c.goal){
    const goal=vehiclePolicyGoal(c.kind,c.body,player,yaw,c.target,time);
    if(!c.goal||distance(goal,c.goal)>6)c.nextPlan=Math.min(c.nextPlan,time);
    c.goal=goal;c.nextDecision=time+(c.kind==='rammer'&&c.target?1.2:.5);
   }
  }
  this.lastDecision=time;this.decisions++;this.nextDecision=time+.25;
 }
 update(dt,time,context){
  const h=context.horde;this.horde=h;this.clearInputs(h);dt=Math.max(0,Math.min(.05,dt));
  if(!this.enabled)return;
  if(this.generation!==h.generation||time<this.lastTime){
   this.generation=h.generation;this.nextDecision=time;this.lastDecision=-Infinity;
   for(const f of this.foot){f.target=null;f.nextFire=Math.max(time+.25,f.nextFire>time+1?time+.25:f.nextFire);f.flashUntil=0;resetBotNavigation(f.nav);}
   for(const c of this.cars){c.target=null;c.goal=null;c.path=[];c.nextDecision=c.nextPlan=c.progressAt=time;c.reverseUntil=c.yieldTime=c.stuckTime=0;c.lastProgress={x:c.body.pos.x,z:c.body.pos.z};c.old.copy(c.body.pos);}
  }
  this.lastTime=time;
  const fresh=freshBotSnapshot(context.snapshot,h.generation,time);if(!fresh)this.staleFrames++;
  if(time>=this.nextDecision)this.decide(time,context,fresh);
  const player=context.playerPos,external=[{x:player.x,z:player.z,r:context.mode==='car'?2.3:context.mode==='jet'?4:.75},...(context.friendlies||[])];
  for(const f of this.foot){
   const friendly=[...external,...this.foot.filter(o=>o!==f).map(o=>({x:o.pos.x,z:o.pos.z,r:.6})),...this.cars.map(c=>({x:c.body.pos.x,z:c.body.pos.z,r:2.35}))];
   const beforeX=f.pos.x,beforeZ=f.pos.z,far=distance(f.pos,player)>32,speed=far?8.5:5.1;
   const moved=moveBotFoot(f.pos,f.goal,dt,time,speed,navigationObstacles,friendly,f.nav);f.distance+=moved;f.pos.y=this.ground(f.pos.x,f.pos.z);
   if(fresh&&f.target){
    f.point.set(f.target.x,f.target.y+.95*(f.target.type===2?1.6:1),f.target.z);f.direction.copy(f.point).sub(f.pos);f.direction.y-=1.45;f.direction.normalize();
    f.root.rotation.y=Math.atan2(-f.direction.x,-f.direction.z);f.aimPitch=Math.asin(f.direction.y);
   }else if(moved>.001){f.root.rotation.y=Math.atan2(beforeX-f.pos.x,beforeZ-f.pos.z);f.aimPitch=0;}
   poseFootBot(f.root,{walking:dt?Math.min(1,moved/dt/5):0,dt,aimPitch:f.aimPitch,firing:time<f.flashUntil});
   if(!fresh||!f.target||time<f.nextFire||distance(f.pos,player)>155)continue;
   f.nextFire=time+.28+f.index*.035;
   f.root.updateMatrixWorld(true);
   if(f.root.userData.muzzle)f.root.userData.muzzle.getWorldPosition(f.origin);else f.origin.copy(f.pos).addScaledVector(f.direction,.85).setY(f.pos.y+1.45);
   f.direction.copy(f.point).sub(f.origin);const range=f.direction.length();f.direction.divideScalar(Math.max(range,.001));
   if(!this.visible(f.origin,f.point)){this.blockedShots++;continue;}
   // The GPU checks this exact live id and ray against its current capsule.
   // There is no local health mutation, nearest-enemy shortcut or fake kill.
   h.botOrigins.array[f.index].set(f.origin.x,f.origin.y,f.origin.z,36);
   h.botRays.array[f.index].set(f.direction.x,f.direction.y,f.direction.z,range+1.1);
   h.botIds.value.setComponent(f.index,f.target.id);
   f.shots++;this.rounds++;f.flashUntil=time+.065;
   poseFootBot(f.root,{walking:dt?Math.min(1,moved/dt/5):0,dt:0,aimPitch:f.aimPitch,firing:true});
   this.fx.tracer(f.origin,f.point,'#addfd0',.07,.022);this.fx.sound('gun',f.origin);
  }
  for(const c of this.cars){
   c.old.copy(c.body.pos);
   const friendlies=[...external,...this.foot.map(f=>({x:f.pos.x,z:f.pos.z,r:.65})),...this.cars.filter(o=>o!==c).map(o=>({x:o.body.pos.x,z:o.body.pos.z,r:2.35}))];
   const result=updateBotDriver(c,dt,time,{ground:this.ground,obstacles:navigationObstacles,friendlies});
   poseBotVehicle(c.mesh,c.body,dt,this.ground);
   h.botCarsOld.array[c.index].set(c.old.x,c.old.y+.9,c.old.z,0);
   h.botCars.array[c.index].set(c.body.pos.x,c.body.pos.y+.9,c.body.pos.z,dt?result.moved/dt:0);
  }
 }
 report(){return {enabled:this.enabled,footCount:this.foot.length,carCount:this.cars.length,rounds:this.rounds,decisions:this.decisions,generation:this.generation,blockedShots:this.blockedShots,staleFrames:this.staleFrames,
  foot:this.foot.map(f=>({id:f.index,position:f.pos.toArray(),shots:f.shots,target:f.target?.id??null,distance:f.distance,plans:f.nav.plans})),
  cars:this.cars.map(c=>({kind:c.kind,position:c.body.pos.toArray(),yaw:c.body.yaw,speed:c.body.speed,target:c.target?.id??null,mode:c.mode,goal:c.goal?{...c.goal}:null,recoveries:c.recoveries,plans:c.plans,brakes:c.brakes,distance:c.distance,blocked:c.blocked}))};}
}
