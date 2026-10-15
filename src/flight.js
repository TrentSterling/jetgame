import {slideMove} from './collision.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const blend=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
export function flightVector(plane){
  const pitch=plane.flightPitch??plane.pitch;
  return {x:-Math.sin(plane.yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(plane.yaw)*Math.cos(pitch)};
}

// Arcade flight with a terrain-following skid. Ground contact removes downward
// travel, rather than reversing it or forcing a nose-up bounce.
export function stepFlight(plane,dt,input,ground,obstacles){
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
  const nx=plane.pos.x+direction.x*plane.speed*dt;
  const nz=plane.pos.z+direction.z*plane.speed*dt;
  const floor=ground(nx,nz)+clearance;
  const ny=plane.pos.y+direction.y*plane.speed*dt;
  plane.skimming=ny<=floor+.42;
  const groundImpact=ny<floor?Math.max(0,-direction.y*plane.speed):0;
  const collision=slideMove(plane.pos,nx-plane.pos.x,nz-plane.pos.z,1.8,obstacles,Infinity,o=>ny<ground(o.x,o.z)+o.h+1);
  const impact=collision.hit,impactSpeed=collision.normalDistance/dt;
  if(impact&&Math.hypot(collision.dx,collision.dz)<plane.speed*dt*.05)plane.speed=plane.taxiing?0:14;
  plane.pos.y=Math.max(ground(plane.pos.x,plane.pos.z)+clearance,Math.min(ground(plane.pos.x,plane.pos.z)+600,ny));
  if(plane.skimming&&plane.pitch<0)plane.pitch=blend(plane.pitch,0,8,dt);
  plane.roll=blend(plane.roll,(-input.yaw*.48-input.bank*.48)*(plane.skimming?.3:1),6,dt);
  const returning=false;
  return {impact,impactSpeed,groundImpact,returning,skimming:plane.skimming,agl:plane.pos.y-ground(plane.pos.x,plane.pos.z)};
}
