import {aircraftSweepBounds,aircraftTerrainFloor,rotatedBounds,aircraftHull,sweepSolidBody} from './aircraft-collision.js';
import {flightCommand,stepFlightControl} from './flight-control.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const blend=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const motion=new WeakMap();
export function flightMotion(plane){const m=motion.get(plane);return m&&m.fleetId===plane.fleetId&&Math.hypot(plane.pos.x-m.position.x,plane.pos.y-m.position.y,plane.pos.z-m.position.z)<.1&&Math.abs(plane.yaw-m.yaw)<.01&&Math.abs(plane.speed-m.speed)<.01?m:null;}
export function flightVector(plane){
  const pitch=plane.flightPitch??plane.pitch;
  return {x:-Math.sin(plane.yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(plane.yaw)*Math.cos(pitch)};
}

// Advance the entire supplied interval in bounded aircraft-only substeps. This
// is not a carried fixed clock: there is no hidden remainder or new save state.
// Inputs are held for this frame; smaller substeps stabilize the nonlinear
// bank servo, energy integration and terrain approach under reversing inputs.
// Aggregate contacts so a hit in an early substep cannot disappear before the
// existing frame-level damage, dent and scrape observers consume it.
export function stepFlight(plane,dt,input,ground,obstacles){
  const steps=Math.max(1,Math.ceil(dt*240-1e-10)),h=dt/steps,start={...plane.pos};
  const heights=new Map(),sample=(x,z)=>{const key=x+','+z;if(!heights.has(key))heights.set(key,ground(x,z));return heights.get(key);};
  let result;
  for(let i=0;i<steps;i++){
    const next=stepFlightSlice(plane,h,input,sample,obstacles);
    if(!result){result=next;continue;}
    const a=result.collision,b=next.collision;
    if(next.impactSpeed>result.impactSpeed)a.normal=b.normal;
    for(const field of ['impactSpeed','newImpactSpeed','groundImpact'])result[field]=Math.max(result[field],next[field]);
    for(const field of ['impact','impactChanged','groundContact','skimming'])result[field]||=next[field];
    for(const field of ['hit','blockedX','blockedY','blockedZ','initialOverlap','unresolved'])a[field]||=b[field];
    a.normalDistance=Math.max(a.normalDistance,b.normalDistance);a.contacts=(a.contacts||0)+(b.contacts||0);
    for(const axis of ['x','y','z'])a.correction[axis]+=b.correction[axis];
    result.agl=next.agl;
  }
  Object.assign(result.collision,{dx:plane.pos.x-start.x,dy:plane.pos.y-start.y,dz:plane.pos.z-start.z});
  // Wrecks inherit the final surviving motion plus the strongest contact in
  // this frame, even if a short roof/wall contact ended before the last slice.
  Object.assign(motion.get(plane),{normal:result.collision.normal,impactSpeed:result.impactSpeed,contact:result.impact,correction:result.collision.correction});
  return result;
}

// Arcade flight with an oriented terrain-following skid. Contact arrests
// closing airframe motion without reversing travel or forcing a pitch bounce.
function stepFlightSlice(plane,dt,input,ground,obstacles){
  const before={x:plane.pos.x,y:plane.pos.y,z:plane.pos.z,yaw:plane.yaw,pitch:plane.flightPitch??plane.pitch,roll:plane.roll??0};
  const startFloor=aircraftTerrainFloor(plane.pos,rotatedBounds(aircraftHull,before.yaw,before.pitch,before.roll),ground);
  const heightAboveHullFloor=plane.pos.y-startFloor;
  const command=flightCommand(input),cap=command.boost?62:44;
  plane.speed=clamp(plane.speed+command.throttle*dt*12+(command.boost?dt*16:0),plane.taxiing?0:14,Math.max(cap,plane.speed-dt*9));
  if(plane.speed>=14)plane.taxiing=false;
  const airControl=plane.taxiing?0:clamp(heightAboveHullFloor/6,0,1);
  const response=stepFlightControl(plane,dt,command,airControl);
  plane.speed=Math.max(plane.taxiing?0:14,plane.speed-response.drag*dt);
  plane.yaw+=response.yawRate*dt;
  plane.pitch=clamp(plane.pitch+response.pitchRate*dt,-.7,.8);
  // Begin levelling within six metres, so both the model and chase camera ease
  // into the skid before touching the floor.
  const approach=clamp(heightAboveHullFloor/6,0,1);
  const desiredPitch=plane.taxiing?0:plane.pitch<0?plane.pitch*approach:plane.pitch;
  plane.flightPitch=blend(plane.flightPitch??plane.pitch,desiredPitch,9,dt);
  const direction=flightVector(plane);
  const flightSpeed=plane.speed;
  const nx=plane.pos.x+direction.x*plane.speed*dt;
  const nz=plane.pos.z+direction.z*plane.speed*dt;
  const nextRoll=response.roll;
  const pose={yaw:plane.yaw,pitch:plane.flightPitch,roll:nextRoll};
  const shapes=aircraftSweepBounds(before,pose),terrainShapes=rotatedBounds(aircraftHull,pose.yaw,pose.pitch,pose.roll);
  // Use exact end-pose envelopes for support speed. The building sweep has
  // arc padding; treating that padding as closing motion adds false impacts.
  const ny=plane.pos.y+direction.y*plane.speed*dt;
  const floor=aircraftTerrainFloor({x:nx,y:ny,z:nz},terrainShapes,ground);
  plane.skimming=ny<=floor+.42;
  let groundImpact=ny<floor?Math.max(0,(floor-startFloor)/dt-direction.y*plane.speed):0;
  const collision=sweepSolidBody(plane.pos,{x:nx-plane.pos.x,y:Math.max(floor,ny)-plane.pos.y,z:nz-plane.pos.z},shapes,obstacles,ground,startFloor);
  const impact=collision.hit,impactSpeed=collision.normalDistance/dt;
  const roofContact=collision.blockedY&&collision.normal.y>0;
  plane.skimming=plane.skimming||roofContact;
  // A shallow ground slide is still movement, even below the old 5% stop cutoff.
  // Keep the existing fallback for fully blocked and airborne contacts.
  const groundSlide=plane.skimming&&Math.hypot(collision.blockedX?0:direction.x,collision.blockedZ?0:direction.z)>1e-8;
  if(impact&&!groundSlide&&Math.hypot(collision.dx,collision.dz)<plane.speed*dt*.05)plane.speed=plane.taxiing?0:14;
  const finalFloor=aircraftTerrainFloor(plane.pos,terrainShapes,ground);
  if(plane.pos.y<finalFloor){groundImpact=Math.max(groundImpact,(finalFloor-plane.pos.y)/dt);plane.pos.y=finalFloor;}
  plane.pos.y=Math.min(ground(plane.pos.x,plane.pos.z)+600,plane.pos.y);
  if(plane.skimming&&plane.pitch<0)plane.pitch=blend(plane.pitch,0,8,dt);
  plane.roll=nextRoll;
  const groundContact=plane.pos.y<=finalFloor+.001||roofContact;
  const velocity={x:collision.blockedX?0:direction.x*flightSpeed,y:groundContact||collision.blockedY?0:direction.y*flightSpeed,z:collision.blockedZ?0:direction.z*flightSpeed};
  const prior=motion.get(plane),normal=collision.normal,newX=collision.blockedX&&!prior?.blockedX,newY=collision.blockedY&&!prior?.blockedY,newZ=collision.blockedZ&&!prior?.blockedZ;
  const impactChanged=!!(impact&&prior?.contact&&(newX||newY||newZ||normal.x*prior.normal.x+normal.y*prior.normal.y+normal.z*prior.normal.z<.5));
  const newImpactSpeed=Math.hypot(newX?direction.x*flightSpeed:0,newY?direction.y*flightSpeed:0,newZ?direction.z*flightSpeed:0);
  const pitchRate=(plane.flightPitch-before.pitch)/dt,yawRate=(plane.yaw-before.yaw)/dt,rollRate=(plane.roll-before.roll)/dt,s=Math.sin(plane.yaw),c=Math.cos(plane.yaw),cp=Math.cos(plane.flightPitch),sp=Math.sin(plane.flightPitch);
  motion.set(plane,{velocity,incoming:{x:direction.x*flightSpeed,y:direction.y*flightSpeed,z:direction.z*flightSpeed},angularVelocity:{x:c*pitchRate+s*cp*rollRate,y:yawRate-sp*rollRate,z:-s*pitchRate+c*cp*rollRate},normal,impactSpeed,contact:impact,blockedX:collision.blockedX,blockedY:collision.blockedY,blockedZ:collision.blockedZ,correction:collision.correction,fleetId:plane.fleetId,position:{x:plane.pos.x,y:plane.pos.y,z:plane.pos.z},yaw:plane.yaw,speed:plane.speed});
  const returning=false;
  return {impact,impactSpeed,impactChanged,newImpactSpeed,groundImpact,groundContact,returning,skimming:plane.skimming,agl:plane.pos.y-ground(plane.pos.x,plane.pos.z),collision};
}
