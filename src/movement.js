import {slideMove} from './collision.js';
import {queryObstacles} from './spatial.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
export function resetInfantry(p){Object.assign(p,{vx:0,vz:0,vy:0,grounded:true,sprinting:false,slideTime:0,slideCooldown:0,eyeHeight:1.68,coyote:0,jumpBuffer:0,parachute:false,hasChute:false,chuteDelay:0,landing:0});}
export function groundSurface(x,z,ground,boxes){let y=ground(x,z);for(const o of queryObstacles(boxes,x,z,x,z))if(Math.abs(x-o.x)<o.w/2&&Math.abs(z-o.z)<o.d/2)y=Math.max(y,ground(o.x,o.z)+o.h);return y;}
export function updateBoost(body,held,dt){
 body.boost??=1;body.boostDelay??=0;body.boostLocked??=false;
 if(!held)body.boostLocked=false;
 const active=held&&!body.boostLocked&&body.boost>0;
 if(active){body.boost=Math.max(0,body.boost-dt/3.8);body.boostDelay=1.15;if(body.boost===0)body.boostLocked=true;}
 else{body.boostDelay=Math.max(0,body.boostDelay-dt);if(body.boostDelay===0)body.boost=Math.min(1,body.boost+dt/6);}
 body.boosting=active;return active;
}
export function stepInfantry(p,dt,input,ground,boxes){
 const floor=groundSurface(p.pos.x,p.pos.z,ground,boxes);
 p.grounded=p.pos.y<=floor+.025&&p.vy<=0;
 p.coyote=p.grounded?.11:Math.max(0,p.coyote-dt);
 p.jumpBuffer=input.jump?.13:Math.max(0,p.jumpBuffer-dt);
 p.slideCooldown=Math.max(0,p.slideCooldown-dt);p.landing=Math.max(0,p.landing-dt*3);
 const fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw),rx=Math.cos(p.yaw),rz=-Math.sin(p.yaw);
 let wx=fx*input.forward+rx*input.strafe,wz=fz*input.forward+rz*input.strafe;
 const wish=Math.hypot(wx,wz);if(wish>0){wx/=wish;wz/=wish;}
 p.sprinting=!!(input.sprint&&input.forward>0&&p.grounded&&!input.crouch);
 if(input.slide&&p.grounded&&p.slideCooldown===0&&Math.hypot(p.vx,p.vz)>7){
  const speed=Math.hypot(p.vx,p.vz);p.vx=p.vx/speed*14;p.vz=p.vz/speed*14;p.slideTime=.85;p.slideCooldown=1.1;
 }
 if(input.jump&&!p.grounded&&p.hasChute&&p.pos.y-floor>3){p.parachute=!p.parachute;p.chuteDelay=p.parachute?0:Infinity;p.jumpBuffer=0;}
 if(!p.grounded&&p.hasChute&&!p.parachute){p.chuteDelay-=dt;if(p.chuteDelay<=0&&p.pos.y-floor>3)p.parachute=true;}
 if(p.jumpBuffer>0&&p.coyote>0){p.vy=7.2;p.grounded=false;p.coyote=p.jumpBuffer=0;p.slideTime=0;}
 if(p.parachute){
  // A steerable canopy retains useful launch momentum, then settles into glide.
  const glide=input.sprint?19:12,forward= input.forward<0?5:glide;
  p.vx=approach(p.vx,fx*forward+rx*input.strafe*7,2.5,dt);
  p.vz=approach(p.vz,fz*forward+rz*input.strafe*7,2.5,dt);
  p.vy=approach(p.vy,input.sprint?-8:-4.5,5,dt);p.slideTime=0;
 }else if(p.slideTime>0){
  p.slideTime=Math.max(0,p.slideTime-dt);p.vx*=Math.exp(-dt*1.1);p.vz*=Math.exp(-dt*1.1);
  p.vx+=wx*dt*3;p.vz+=wz*dt*3;
 }else{
  const speed=input.crouch?3.2:p.sprinting?11:6.2,rate=p.grounded?(wish?14:18):2.5;
  p.vx=approach(p.vx,wx*speed,rate,dt);p.vz=approach(p.vz,wz*speed,rate,dt);
 }
 const oldX=p.pos.x,oldZ=p.pos.z;
 const collision=slideMove(p.pos,p.vx*dt,p.vz*dt,.45,boxes,Infinity,o=>p.pos.y<ground(o.x,o.z)+o.h-.02);
 // Walk up slopes, but do not teleport up the vertical back of a stunt ramp.
 const canStep=(x,z)=>groundSurface(x,z,ground,boxes)<=p.pos.y+.45;
 if(!canStep(p.pos.x,p.pos.z)){
  if(canStep(oldX,p.pos.z)){p.pos.x=oldX;collision.blockedX=true;}
  else if(canStep(p.pos.x,oldZ)){p.pos.z=oldZ;collision.blockedZ=true;}
  else{p.pos.x=oldX;p.pos.z=oldZ;collision.blockedX=collision.blockedZ=true;}
  collision.hit=true;
 }
 if(collision.blockedX)p.vx=0;if(collision.blockedZ)p.vz=0;
 if(!p.parachute)p.vy=Math.max(-48,p.vy-22*dt);
 const nextFloor=groundSurface(p.pos.x,p.pos.z,ground,boxes);p.pos.y+=p.vy*dt;
 if(p.pos.y<=nextFloor){
  if(!p.grounded&&p.vy<-3)p.landing=clamp(-p.vy/22,0,.65);
  p.pos.y=nextFloor;p.vy=0;p.grounded=true;p.parachute=p.hasChute=false;
 }
 p.eyeHeight=approach(p.eyeHeight,p.slideTime>0?.78:input.crouch?1.08:1.68,14,dt);
 return collision;
}
