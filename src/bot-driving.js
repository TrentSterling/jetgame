import {resetDriving,stepDriving} from './driving.js';
import {queryObstacles} from './spatial.js';
import {BOT_CAR_RADIUS,botPath,botSegmentClear,friendlyBoxes} from './bot-navigation.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const BOT_POLICIES=Object.freeze(['rammer','circler','escort']);
export function createBotDriver(kind,pos,yaw=0,time=0){
 if(!BOT_POLICIES.includes(kind))throw new Error('Unknown bot policy: '+kind);
 const driver={kind,body:{pos,yaw,speed:0,cruise:kind==='rammer'?25:kind==='circler'?21:18,driveTorque:.85}};
 resetBotDriver(driver,pos,yaw,time);return driver;
}
export function resetBotDriver(driver,pos,yaw=0,time=0){
 Object.assign(driver.body.pos,{x:pos.x,y:pos.y||0,z:pos.z});Object.assign(driver.body,{yaw,speed:0});resetDriving(driver.body);
 Object.assign(driver,{goal:null,path:[],nextPlan:time,nextDecision:time,mode:'follow',reverseUntil:0,recoveryTurn:1,stuckTime:0,yieldTime:0,lastProgress:{x:pos.x,z:pos.z},progressAt:time,recoveries:0,plans:0,distance:0,brakes:0,blocked:false,control:{throttle:0,steer:0,boost:false,handbrake:false}});
 return driver;
}

export function vehiclePolicyGoal(kind,body,player,yaw,target,time=0){
 const forward={x:-Math.sin(yaw),z:-Math.cos(yaw)},right={x:Math.cos(yaw),z:-Math.sin(yaw)};
 let goal,mode='follow';
 if(target&&distance(body.pos,player)<140&&distance(target,player)<108){
  const dx=target.x-body.pos.x,dz=target.z-body.pos.z,n=Math.hypot(dx,dz)||1;
  if(kind==='rammer'){
   goal={x:target.x+dx/n*13,z:target.z+dz/n*13};mode='charge';
  }else if(kind==='circler'){
   // Arc onto a flank, then make an attack pass through it. A permanent orbit
   // outside the target's capsule would look busy without ever helping.
   if((time+1.5)%9>=4&&n<42){goal={x:target.x+dx/n*15,z:target.z+dz/n*15};mode='flank-pass';}
   else{const angle=Math.atan2(body.pos.z-target.z,body.pos.x-target.x)+.95;goal={x:target.x+Math.cos(angle)*16,z:target.z+Math.sin(angle)*16};mode='flank';}
  }else if(distance(target,player)<42){
   goal={x:target.x+dx/n*8,z:target.z+dz/n*8};mode='intercept';
   const px=goal.x-player.x,pz=goal.z-player.z,d=Math.hypot(px,pz);
   if(d>46)goal={x:player.x+px/d*46,z:player.z+pz/d*46};
  }
 }
 if(!goal){
  const side=kind==='rammer'?-19:kind==='circler'?24:16,lead=kind==='rammer'?26:kind==='circler'?18:-15;
  goal={x:player.x+right.x*side+forward.x*lead,z:player.z+right.z*side+forward.z*lead};
 }
 // Aircraft travel can outrun a ground ally. They physically follow in bounded
 // legs rather than respawning, warping or sweeping damage across the map.
 const dx=goal.x-body.pos.x,dz=goal.z-body.pos.z,d=Math.hypot(dx,dz);
 if(d>82)goal={x:body.pos.x+dx/d*82,z:body.pos.z+dz/d*82};
 return {...goal,mode,...(target&&['charge','flank-pass','intercept'].includes(mode)?{attackX:target.x,attackZ:target.z}:{})};
}

function brakeInput(body,steer=0){return {throttle:Math.abs(body.speed)>.6?-Math.sign(body.speed):0,steer,boost:false,handbrake:true};}
function friendlyAhead(body,friendlies,direction=1){
 const speed=Math.hypot(body.vx||0,body.vz||0),vx=speed>1?(body.vx/speed):(-Math.sin(body.yaw)*direction),vz=speed>1?(body.vz/speed):(-Math.cos(body.yaw)*direction);
 const stopping=3.6+speed*.45+speed*speed/48;
 let nearest=Infinity,avoid=0;
 for(const f of friendlies){
  const dx=f.x-body.pos.x,dz=f.z-body.pos.z,along=dx*vx+dz*vz,lateral=dx*vz-dz*vx,r=Math.max(0,f.r)+BOT_CAR_RADIUS+.6;
  if(along>-r&&along<stopping+r&&Math.abs(lateral)<r){nearest=Math.min(nearest,Math.max(0,along-r));avoid=lateral>=0?-1:1;}
 }
 return {danger:Number.isFinite(nearest),distance:nearest,avoid};
}

export function updateBotDriver(driver,dt,time,{ground,obstacles,friendlies=[],goal=driver.goal}){
 dt=clamp(dt,0,.05);const body=driver.body;if(!dt)return {moved:0,braking:false};
 friendlies=friendlies.filter(p=>distance(body.pos,p)<110);
 if(goal&&(!driver.goal||distance(goal,driver.goal)>6)){driver.nextPlan=Math.min(driver.nextPlan,time);driver.goal={...goal};}
 else if(goal)driver.goal={...goal};
 driver.mode=driver.goal?.mode||'follow';
 const speed=Math.hypot(body.vx||0,body.vz||0),local=queryObstacles(obstacles,body.pos.x-105,body.pos.z-105,body.pos.x+105,body.pos.z+105);
 const dynamic=friendlyBoxes(friendlies,.45),collision=[...local,...dynamic];
 if(driver.goal&&time>=driver.nextPlan&&time>=driver.reverseUntil){
  driver.path=botPath(body.pos,driver.goal,[...local,...dynamic],BOT_CAR_RADIUS);driver.nextPlan=time+.8;driver.plans++;
 }
 // Discard already-passed corners, never skip a corner through a building.
 while(driver.path.length&&distance(body.pos,driver.path[0])<(driver.path.length===1?3.3:1.2)){
  if(driver.path.length>1&&!botSegmentClear(body.pos,driver.path[1],collision,BOT_CAR_RADIUS))break;
  driver.path.shift();
 }
 if(driver.path.length>1&&botSegmentClear(body.pos,driver.path[1],collision,BOT_CAR_RADIUS+.2))driver.path.shift();
 let input=brakeInput(body),braking=false;
 if(time<driver.reverseUntil){
  driver.mode='reverse';input={throttle:-.65,steer:driver.recoveryTurn,boost:false,handbrake:false};
 }else if(driver.path.length){
  let point=driver.path[0];const remaining=distance(body.pos,point);
  // Finish an attack through the selected capsule. Looking only at a distant
  // exit point makes a turning car miss small targets on the inside of its arc.
  if(driver.path.length===1&&Number.isFinite(driver.goal?.attackX)){
   const attack={x:driver.goal.attackX,z:driver.goal.attackZ},gap=distance(body.pos,attack);
   if(gap>1.8&&gap<28&&botSegmentClear(body.pos,attack,collision,BOT_CAR_RADIUS))point=attack;
  }
  const dx=point.x-body.pos.x,dz=point.z-body.pos.z,desired=Math.atan2(-dx,-dz),turn=angleDelta(desired,body.yaw);
  const steer=clamp(-turn*1.65,-1,1),corner=Math.abs(turn),cruise=driver.mode==='charge'?25:driver.mode==='flank'?19:driver.mode==='intercept'?17:19;
  const desiredSpeed=Math.min(cruise,corner>1.2?5:corner>.55?9:cruise,driver.path.length===1?Math.sqrt(Math.max(0,remaining-2)*13):cruise);
  const throttle=speed>desiredSpeed+1?(body.speed>0?-.7:.7):speed<desiredSpeed-1?.8:.12;
  input={throttle,steer,boost:false,handbrake:corner>1.4&&speed>7};
 }
 const safety=friendlyAhead(body,friendlies,time<driver.reverseUntil?-1:1);
 if(safety.danger){input=brakeInput(body,input.steer);braking=true;driver.brakes++;}
 driver.yieldTime=safety.danger&&speed<1&&time>=driver.reverseUntil?driver.yieldTime+dt:0;
 if(driver.yieldTime>1.25&&!friendlyAhead(body,friendlies,-1).danger){
  driver.recoveries++;driver.recoveryTurn=driver.recoveries%2?1:-1;driver.reverseUntil=time+1.05;driver.nextPlan=driver.reverseUntil;driver.path=[];driver.yieldTime=0;
 }
 // If someone walks into an already stationary chassis, do not accelerate
 // through them. The safety stop has no hit/knockback or friendly-damage path.
 const overlapping=friendlies.some(f=>distance(body.pos,f)<Math.max(0,f.r)+1.95);
 if(overlapping){input=brakeInput(body);body.vx=body.vz=body.speed=body._speed=0;braking=true;}
 const before={x:body.pos.x,z:body.pos.z};
 const result=stepDriving(body,dt,input,ground,collision),moved=distance(before,body.pos);
 driver.distance+=moved;driver.control=input;driver.blocked=result.collision.hit;
 // Collision-safe replanning is driven by real progress, never an enemy kill
 // counter. A deliberate friendly stop must not trigger a reverse into them.
 if(time-driver.progressAt>=.6){
  const progress=distance(driver.lastProgress,body.pos),wantsMove=!!driver.goal&&distance(body.pos,driver.goal)>6;
  driver.stuckTime=wantsMove&&!braking&&progress<.65?driver.stuckTime+(time-driver.progressAt):0;
  driver.progressAt=time;driver.lastProgress={x:body.pos.x,z:body.pos.z};
  if(driver.stuckTime>1.35&&time>=driver.reverseUntil){
   driver.recoveries++;driver.recoveryTurn=driver.recoveries%2?1:-1;driver.reverseUntil=time+1.15;driver.nextPlan=driver.reverseUntil;driver.path=[];driver.stuckTime=0;
  }
 }
 return {moved,braking,impactSpeed:result.impactSpeed};
}
