import {aircraftSweepBounds,sweepSolidBody} from './aircraft-collision.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const blend=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const motion=new WeakMap();
export function flightMotion(plane){const m=motion.get(plane);return m&&m.fleetId===plane.fleetId&&Math.hypot(plane.pos.x-m.position.x,plane.pos.y-m.position.y,plane.pos.z-m.position.z)<.1&&Math.abs(plane.yaw-m.yaw)<.01&&Math.abs(plane.speed-m.speed)<.01?m:null;}
export function flightVector(plane){
  const pitch=plane.flightPitch??plane.pitch;
  return {x:-Math.sin(plane.yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(plane.yaw)*Math.cos(pitch)};
}

// Arcade flight with a terrain-following skid. Ground contact removes downward
// travel, rather than reversing it or forcing a nose-up bounce.
export function stepFlight(plane,dt,input,ground,obstacles){
  const before={x:plane.pos.x,y:plane.pos.y,z:plane.pos.z,yaw:plane.yaw,pitch:plane.flightPitch??plane.pitch,roll:plane.roll??0};
  const clearance=1.05;
  const agl=plane.pos.y-ground(plane.pos.x,plane.pos.z);
  const cap=input.boost?62:44;
  plane.speed=clamp(plane.speed+input.throttle*dt*12+(input.boost?dt*16:0),plane.taxiing?0:14,Math.max(cap,plane.speed-dt*9));
  if(plane.speed>=14)plane.taxiing=false;
  const turn=2.35*(1-clamp((plane.speed-25)/90,0,.35));
  plane.yaw-=(input.yaw*turn+input.bank*1.45)*dt;
  plane.pitch=clamp(plane.pitch-input.pitch*dt*1.25,-.7,.8);
  // Begin levelling within six metres, so both the model and chase camera ease
  // into the skid before touching the floor.
  const approach=clamp((agl-clearance)/6,0,1);
  const desiredPitch=plane.taxiing?0:plane.pitch<0?plane.pitch*approach:plane.pitch;
  plane.flightPitch=blend(plane.flightPitch??plane.pitch,desiredPitch,9,dt);
  const direction=flightVector(plane);
  const flightSpeed=plane.speed;
  const nx=plane.pos.x+direction.x*plane.speed*dt;
  const nz=plane.pos.z+direction.z*plane.speed*dt;
  const floor=ground(nx,nz)+clearance;
  const ny=plane.pos.y+direction.y*plane.speed*dt;
  plane.skimming=ny<=floor+.42;
  const groundImpact=ny<floor?Math.max(0,-direction.y*plane.speed):0;
  const nextRoll=blend(plane.roll,(-input.yaw*.48-input.bank*.48)*(plane.skimming?.3:1),6,dt);
  const shapes=aircraftSweepBounds(before,{yaw:plane.yaw,pitch:plane.flightPitch,roll:nextRoll});
  const collision=sweepSolidBody(plane.pos,{x:nx-plane.pos.x,y:Math.max(floor,ny)-plane.pos.y,z:nz-plane.pos.z},shapes,obstacles,ground,ground(plane.pos.x,plane.pos.z)+clearance);
  const impact=collision.hit,impactSpeed=collision.normalDistance/dt;
  const roofContact=collision.blockedY&&collision.normal.y>0;
  plane.skimming=plane.skimming||roofContact;
  // A shallow ground slide is still movement, even below the old 5% stop cutoff.
  // Keep the existing fallback for fully blocked and airborne contacts.
  const groundSlide=plane.skimming&&Math.hypot(collision.blockedX?0:direction.x,collision.blockedZ?0:direction.z)>1e-8;
  if(impact&&!groundSlide&&Math.hypot(collision.dx,collision.dz)<plane.speed*dt*.05)plane.speed=plane.taxiing?0:14;
  plane.pos.y=Math.max(ground(plane.pos.x,plane.pos.z)+clearance,Math.min(ground(plane.pos.x,plane.pos.z)+600,plane.pos.y));
  if(plane.skimming&&plane.pitch<0)plane.pitch=blend(plane.pitch,0,8,dt);
  plane.roll=nextRoll;
  const groundContact=plane.pos.y<=ground(plane.pos.x,plane.pos.z)+clearance+.001||roofContact;
  const velocity={x:collision.blockedX?0:direction.x*flightSpeed,y:groundContact||collision.blockedY?0:direction.y*flightSpeed,z:collision.blockedZ?0:direction.z*flightSpeed};
  const prior=motion.get(plane),normal=collision.normal,newX=collision.blockedX&&!prior?.blockedX,newY=collision.blockedY&&!prior?.blockedY,newZ=collision.blockedZ&&!prior?.blockedZ;
  const impactChanged=!!(impact&&prior?.contact&&(newX||newY||newZ||normal.x*prior.normal.x+normal.y*prior.normal.y+normal.z*prior.normal.z<.5));
  const newImpactSpeed=Math.hypot(newX?direction.x*flightSpeed:0,newY?direction.y*flightSpeed:0,newZ?direction.z*flightSpeed:0);
  const pitchRate=(plane.flightPitch-before.pitch)/dt,yawRate=(plane.yaw-before.yaw)/dt,rollRate=(plane.roll-before.roll)/dt,s=Math.sin(plane.yaw),c=Math.cos(plane.yaw),cp=Math.cos(plane.flightPitch),sp=Math.sin(plane.flightPitch);
  motion.set(plane,{velocity,incoming:{x:direction.x*flightSpeed,y:direction.y*flightSpeed,z:direction.z*flightSpeed},angularVelocity:{x:c*pitchRate+s*cp*rollRate,y:yawRate-sp*rollRate,z:-s*pitchRate+c*cp*rollRate},normal,impactSpeed,contact:impact,blockedX:collision.blockedX,blockedY:collision.blockedY,blockedZ:collision.blockedZ,correction:collision.correction,fleetId:plane.fleetId,position:{x:plane.pos.x,y:plane.pos.y,z:plane.pos.z},yaw:plane.yaw,speed:plane.speed});
  const returning=false;
  return {impact,impactSpeed,impactChanged,newImpactSpeed,groundImpact,groundContact,returning,skimming:plane.skimming,agl:plane.pos.y-ground(plane.pos.x,plane.pos.z),collision};
}
