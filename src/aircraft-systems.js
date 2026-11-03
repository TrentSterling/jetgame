import {stepFlight,flightMotion} from './flight.js';
import {resetFlightControl} from './flight-control.js';
import {updateBoost} from './movement.js';
import {aircraftHull,rotatedBounds,aircraftTerrainFloor} from './aircraft-collision.js';

// Aircraft simulation follows the game's existing capped simulation interval.
// Rendering, infantry, cars, horde compute and mission clocks keep their clock.
export const AIRCRAFT_TICK=1/120,AIRCRAFT_MAX_FRAME=.035;
const gravity=9.81,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const approach=(v,target,delta)=>v+clamp(target-v,-delta,delta);
const axes=['Throttle','Pitch','Yaw','Bank','Boost'];
const numeric={aircraftRemainder:[0,AIRCRAFT_TICK],aircraftTime:[0,1e10],aircraftTicks:[0,1e12],
 engineSpool:[0,1],engineBurn:[0,1],engineIgnition:[0,.12],
 aircraftVX:[-1e5,1e5],aircraftVY:[-1e5,1e5],aircraftVZ:[-1e5,1e5],
 aircraftAX:[-1e8,1e8],aircraftAY:[-1e8,1e8],aircraftAZ:[-1e8,1e8],
 aircraftNormalLoad:[-1e8,1e8],aircraftTotalLoad:[0,1e8]};
const modes=['off','idle','mil','ignition','boost','cooldown'];
// Optional additive checkpoint group: breakup can happen before the next tick.
// Velocity already lives in aircraftV*. Preserve the other authoritative motion
// values as primitives so GameSave and inactive fleet bodies retain them too.
const motionVectors=['Position','Incoming','Angular','Normal','Correction'];
const motionNumbers={aircraftMotionYaw:[-1e12,1e12],aircraftMotionSpeed:[0,1e5],aircraftMotionImpactSpeed:[0,1e8]};
for(const group of motionVectors)for(const axis of ['X','Y','Z'])motionNumbers['aircraftMotion'+group+axis]=group==='Normal'?[-1,1]:[-1e12,1e12];
const motionFlags=['Contact','BlockedX','BlockedY','BlockedZ'].map(k=>'aircraftMotion'+k);
export const aircraftMotionFields=Object.freeze([...Object.keys(motionNumbers),...motionFlags]);
export const aircraftStateFields=Object.freeze([...Object.keys(numeric),...axes.map(a=>'aircraftInput'+a),'engineMode','aircraftGroundContact','aircraftWallContact',...aircraftMotionFields]);
const observations=new WeakMap();

export function resetAircraftSystems(body){
 resetFlightControl(body);body.boosting=false;for(const key of aircraftStateFields)delete body[key];observations.delete(body);
}
function initialize(body){
 if(body.aircraftRemainder!==undefined)return;
 const burning=body.boosting===true,spool=burning?1:body.speed>=14?.65:0;
 Object.assign(body,{aircraftRemainder:0,aircraftTime:0,aircraftTicks:0,engineSpool:spool,engineBurn:burning?1:0,engineIgnition:burning?.12:0,engineMode:burning?'boost':spool?'mil':'off',aircraftVX:0,aircraftVY:0,aircraftVZ:0,aircraftAX:0,aircraftAY:0,aircraftAZ:0,aircraftNormalLoad:1,aircraftTotalLoad:1,aircraftGroundContact:false,aircraftWallContact:false});
 for(const axis of axes)body['aircraftInput'+axis]=0;
}
export function validAircraftSystems(body){
 if(aircraftStateFields.every(key=>body[key]===undefined))return true;
 for(const [key,[min,max]] of Object.entries(numeric))if(!Number.isFinite(body[key])||body[key]<min||body[key]>max)return false;
 if(body.aircraftRemainder>=AIRCRAFT_TICK||!Number.isInteger(body.aircraftTicks)||!modes.includes(body.engineMode))return false;
 for(const key of ['aircraftGroundContact','aircraftWallContact'])if(typeof body[key]!=='boolean')return false;
 for(const axis of axes){const v=body['aircraftInput'+axis],r=body.aircraftRemainder;if(!Number.isFinite(v)||Math.abs(v)>r+1e-12||(axis==='Boost'&&v<0))return false;}
 if(aircraftMotionFields.some(key=>body[key]!==undefined)){
  for(const [key,[min,max]] of Object.entries(motionNumbers))if(!Number.isFinite(body[key])||body[key]<min||body[key]>max)return false;
  for(const key of motionFlags)if(typeof body[key]!=='boolean')return false;
 }
 return true;
}
function rememberMotion(body,motion,result){
 const zero={x:0,y:0,z:0};
 const vectors={Position:body.pos,Incoming:motion?.incoming||zero,Angular:motion?.angularVelocity||zero,Normal:result.collision.normal,Correction:result.collision.correction};
 for(const [group,vector] of Object.entries(vectors))for(const axis of ['X','Y','Z'])body['aircraftMotion'+group+axis]=vector[axis.toLowerCase()];
 Object.assign(body,{aircraftMotionYaw:body.yaw,aircraftMotionSpeed:body.speed,aircraftMotionImpactSpeed:result.impactSpeed,aircraftMotionContact:result.impact,
  aircraftMotionBlockedX:!!motion?.blockedX,aircraftMotionBlockedY:!!motion?.blockedY,aircraftMotionBlockedZ:!!motion?.blockedZ});
}
function engine(body,input,events){
 const dt=AIRCRAFT_TICK,piloted=input.piloted,target=piloted?(input.boost||input.throttle>0?1:body.taxiing?.18:.65):0;
 body.engineSpool=approach(body.engineSpool,target,(target>body.engineSpool?2.4:1.8)*dt);
 // Keep the original reservoir duration, recovery delay and release-to-unlock
 // contract. Ignition consumes the held boost request, never unlocks the latch.
 const supplied=updateBoost(body,piloted&&input.boost,dt);
 body.engineIgnition=supplied&&body.engineSpool>=.9?Math.min(.12,body.engineIgnition+dt):0;
 const lit=supplied&&body.engineIgnition>=.12;
 body.engineBurn=approach(body.engineBurn,lit?1:0,(lit?6:8)*dt);
 body.boosting=body.engineBurn>.01;
 const mode=body.engineBurn>.01?(lit?'boost':'cooldown'):supplied?'ignition':body.engineSpool>.5?'mil':body.engineSpool>.001||piloted?'idle':'off';
 if(mode!==body.engineMode)events.push({type:'engine-mode',from:body.engineMode,to:mode,time:body.aircraftTime});
 body.engineMode=mode;
 return {...input,throttle:input.throttle>0?input.throttle*body.engineSpool:input.throttle,boost:body.boosting,boostPower:body.engineBurn};
}
function emptyResult(body){return {impact:!!body.aircraftWallContact,impactSpeed:0,impactChanged:false,newImpactSpeed:0,groundImpact:0,groundContact:!!body.aircraftGroundContact,skimming:!!body.skimming,returning:false,agl:0,
 collision:{dx:0,dy:0,dz:0,normalDistance:0,hit:false,normal:{x:0,y:0,z:0},blockedX:false,blockedY:false,blockedZ:false,initialOverlap:false,unresolved:false,correction:{x:0,y:0,z:0},contacts:0}};}
function measure(body,result,motion,events){
 const velocity=motion?.velocity||{x:0,y:0,z:0},dt=AIRCRAFT_TICK;
 const acceleration={x:body.aircraftTicks?(velocity.x-body.aircraftVX)/dt:0,y:body.aircraftTicks?(velocity.y-body.aircraftVY)/dt:0,z:body.aircraftTicks?(velocity.z-body.aircraftVZ)/dt:0};
 const yaw=body.yaw,pitch=body.flightPitch??body.pitch,roll=body.roll,sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),sr=Math.sin(roll),cr=Math.cos(roll);
 const specific={x:acceleration.x/gravity,y:acceleration.y/gravity+1,z:acceleration.z/gravity};
 Object.assign(body,{aircraftVX:velocity.x,aircraftVY:velocity.y,aircraftVZ:velocity.z,aircraftAX:acceleration.x,aircraftAY:acceleration.y,aircraftAZ:acceleration.z,
  aircraftNormalLoad:specific.x*(-cy*sr+sy*sp*cr)+specific.y*cp*cr+specific.z*(sy*sr+cy*sp*cr),aircraftTotalLoad:Math.hypot(specific.x,specific.y,specific.z)});
 if(result.groundContact&&!body.aircraftGroundContact)events.push({type:'terrain-contact',time:body.aircraftTime,speed:result.groundImpact});
 if(result.impact&&(!body.aircraftWallContact||result.impactChanged))events.push({type:'solid-contact',time:body.aircraftTime,speed:result.impactChanged?result.newImpactSpeed:result.impactSpeed,normal:{...result.collision.normal}});
 body.aircraftGroundContact=result.groundContact;body.aircraftWallContact=result.impact;
}
function combine(total,next){
 if(!total)return {...next,collision:{...next.collision,correction:{...next.collision.correction}}};
 const a=total.collision,b=next.collision;if(next.impactSpeed>total.impactSpeed)a.normal=b.normal;
 if(next.impactMotion&&(!total.impactMotion||next.impactMotion.impactSpeed>total.impactMotion.impactSpeed))total.impactMotion=next.impactMotion;
 for(const field of ['impactSpeed','newImpactSpeed','groundImpact'])total[field]=Math.max(total[field],next[field]);
 for(const field of ['impact','impactChanged','groundContact','skimming'])total[field]||=next[field];
 for(const field of ['hit','blockedX','blockedY','blockedZ','initialOverlap','unresolved'])a[field]||=b[field];
 for(const field of ['dx','dy','dz','normalDistance','contacts'])a[field]=(a[field]||0)+(b[field]||0);
 for(const axis of ['x','y','z'])a.correction[axis]+=b.correction[axis];total.agl=next.agl;return total;
}

export function stepAircraft(body,dt,input,ground,obstacles){
 const accepted=Number.isFinite(dt)&&dt>0?Math.min(dt,AIRCRAFT_MAX_FRAME):0;
 if(!accepted)return {...emptyResult(body),simulatedDt:0,contactSteps:[],events:[],droppedDt:0,ticks:0};
 initialize(body);
 const command={piloted:input.piloted!==false};for(const axis of axes){const key=axis.toLowerCase(),raw=axis==='Boost'?Number(input.boost===true):input[key];command[key]=Number.isFinite(raw)?clamp(raw,-1,1):0;}
 const events=[],contactSteps=[];let left=accepted,total=null,ticks=0,lastMotion=null;
 while(left>1e-12){
  const portion=Math.min(left,AIRCRAFT_TICK-body.aircraftRemainder);
  for(const axis of axes)body['aircraftInput'+axis]+=command[axis.toLowerCase()]*portion;
  body.aircraftRemainder+=portion;left-=portion;
  if(body.aircraftRemainder<AIRCRAFT_TICK-1e-12)break;
  const tick={piloted:command.piloted};for(const axis of axes){tick[axis.toLowerCase()]=body['aircraftInput'+axis]/AIRCRAFT_TICK;body['aircraftInput'+axis]=0;}tick.boost=tick.boost>=.5;body.aircraftRemainder=0;
  const driven=engine(body,tick,events);let result;
  if(!tick.piloted&&body.speed<=.02){result=emptyResult(body);result.impact=false;result.groundContact=body.pos.y<=aircraftTerrainFloor(body.pos,rotatedBounds(aircraftHull,body.yaw,body.flightPitch??body.pitch,body.roll),ground)+.001;result.agl=body.pos.y-ground(body.pos.x,body.pos.z);}
  else{
   if(!tick.piloted){body.pitch=-.28;if(body.pos.y-ground(body.pos.x,body.pos.z)<1.55){body.taxiing=true;body.speed=Math.max(0,body.speed-AIRCRAFT_TICK*20);}}
   result=stepFlight(body,AIRCRAFT_TICK,driven,ground,obstacles);
  }
  const moving=tick.piloted||body.speed>.02,motion=moving?flightMotion(body):null;
  lastMotion=motion;
  measure(body,result,motion,events);body.aircraftTicks++;body.aircraftTime=body.aircraftTicks*AIRCRAFT_TICK;
  const c=result.collision;contactSteps.push({dt:AIRCRAFT_TICK,groundContact:result.groundContact,impact:result.impact,taxiing:body.taxiing,blockedX:c.blockedX,blockedZ:c.blockedZ,speed:Math.hypot(c.dx-c.correction.x,c.dz-c.correction.z)/AIRCRAFT_TICK});
  total=combine(total,result);ticks++;
 }
 const result=total||emptyResult(body);result.simulatedDt=ticks*AIRCRAFT_TICK;result.contactSteps=contactSteps;result.events=events;result.droppedDt=Math.max(0,(Number.isFinite(dt)?dt:0)-accepted);result.ticks=ticks;
 if(ticks)rememberMotion(body,lastMotion,result);
 observations.set(body,{events,result});return result;
}
export function aircraftMotion(body){
 if(!(body.aircraftTicks>0))return null; // Legacy/unmeasured/reset bodies keep the existing fallback.
 const velocity={x:body.aircraftVX,y:body.aircraftVY,z:body.aircraftVZ};
 if(!Object.values(velocity).every(Number.isFinite))return null;
 // Earlier stage-two checkpoints have measured velocity but no angular/contact
 // snapshot. Keep that surviving velocity; do not invent an old impact impulse.
 if(body.aircraftMotionYaw===undefined)return {velocity,angularVelocity:{x:0,y:0,z:0},normal:{x:0,y:0,z:0},impactSpeed:0,contact:!!body.aircraftWallContact};
 const vector=group=>({x:body['aircraftMotion'+group+'X'],y:body['aircraftMotion'+group+'Y'],z:body['aircraftMotion'+group+'Z']}),position=vector('Position');
 if(Math.hypot(body.pos.x-position.x,body.pos.y-position.y,body.pos.z-position.z)>=.1||Math.abs(body.yaw-body.aircraftMotionYaw)>=.01||Math.abs(body.speed-body.aircraftMotionSpeed)>=.01)return null;
 return {velocity,incoming:vector('Incoming'),angularVelocity:vector('Angular'),normal:vector('Normal'),correction:vector('Correction'),
  impactSpeed:body.aircraftMotionImpactSpeed,contact:body.aircraftMotionContact,blockedX:body.aircraftMotionBlockedX,blockedY:body.aircraftMotionBlockedY,blockedZ:body.aircraftMotionBlockedZ,
  fleetId:body.fleetId,position,yaw:body.aircraftMotionYaw,speed:body.aircraftMotionSpeed};
}
export function aircraftTelemetry(body){
 return {tickSeconds:AIRCRAFT_TICK,ticks:body.aircraftTicks||0,remainder:body.aircraftRemainder||0,measured:(body.aircraftTicks||0)>1,
  velocity:{x:body.aircraftVX||0,y:body.aircraftVY||0,z:body.aircraftVZ||0},acceleration:{x:body.aircraftAX||0,y:body.aircraftAY||0,z:body.aircraftAZ||0},
  normalLoad:body.aircraftNormalLoad??1,totalLoad:body.aircraftTotalLoad??1,groundContact:body.aircraftGroundContact||false,
  engine:{mode:body.engineMode||'off',spool:body.engineSpool||0,burn:body.engineBurn||0,ignition:body.engineIgnition||0},events:observations.get(body)?.events||[]};
}

// Only a fresh collision causing the lethal damage supplies `impact`. A later
// gun hit, wall-slide death or zero-tick restore keeps the saved surviving
// velocity. Fragments then resolve their own wall contacts; a whole-airframe
// contact must not stop a wing piece that is outside that obstacle.
export function aircraftBreakupMotion(body,impact=null){
 const motion=aircraftMotion(body);
 const vector=v=>v&&['x','y','z'].every(axis=>Number.isFinite(v[axis]));
 if(!impact||!Number.isFinite(impact.impactSpeed)||impact.impactSpeed<=0||!vector(impact.incoming)||!vector(impact.angularVelocity)||!vector(impact.normal))return motion;
 return {...motion,velocity:{...impact.incoming},incoming:{...impact.incoming},angularVelocity:{...impact.angularVelocity},normal:{...impact.normal},impactSpeed:impact.impactSpeed,resolveContactPerFragment:true};
}
