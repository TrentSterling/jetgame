import {slideMove} from './collision.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const blend=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
// Arcade forces with finite tire grip. A vehicle can point across its travel
// direction; steering cannot rotate its velocity or cancel a slide instantly.
const handling={
 buggy:{grip:18,inertia:1.75,steering:.52,spring:64,damping:11},
 scout:{grip:20,inertia:1.45,steering:.55,spring:78,damping:12.5},
 carrier:{grip:15.5,inertia:2.5,steering:.48,spring:48,damping:9.5}
};
// Positive means tire forward points toward the chassis's local +X. Render
// pivots use the opposite Y rotation because the vehicle faces local -Z.
// Derive from current motion so posing after a restore/stop needs no saved or
// one-tick-old steering field. Physics passes its already measured slice speed.
export function drivingSteeringAngle(body,speed){
 const magnitude=Number.isFinite(speed)?Math.abs(speed):Number.isFinite(body.vx)&&Number.isFinite(body.vz)?Math.hypot(body.vx,body.vz):Number.isFinite(body.speed)?Math.abs(body.speed):0;
 const steer=Number.isFinite(body.steer)?body.steer:0;
 return steer*(handling[body.kind]||handling.buggy).steering/(1+magnitude*magnitude/650);
}
export function resetDriving(car){
 Object.assign(car,{vx:-Math.sin(car.yaw)*car.speed,vz:-Math.cos(car.yaw)*car.speed,vy:0,steer:0,yawRate:0,slip:0,roll:0,pitch:0,driveRollV:0,drivePitchV:0,lateralAcceleration:0,longitudinalAcceleration:0,suspension:0,suspensionV:0,grounded:true,airTime:0,lastAirTime:0,landingSpeed:0,wallContact:false,_speed:car.speed,_x:car.pos.x,_z:car.pos.z});
}
export function stepDriving(car,dt,input,ground,boxes){
 if(!Number.isFinite(dt)||dt<=0)return {impactSpeed:0,landingSpeed:0,collision:{hit:false,dx:0,dz:0,blockedX:false,blockedZ:false}};
 // Bound the force integration and keep the existing swept terrain contact.
 const count=Math.max(1,Math.ceil(dt*Math.max(120,Math.abs(car.speed)*4)));
 let result,impactSpeed=0,landingSpeed=0;
 for(let i=0;i<count;i++){result=driveStep(car,dt/count,input,ground,boxes);impactSpeed=Math.max(impactSpeed,result.impactSpeed);landingSpeed=Math.max(landingSpeed,result.landingSpeed);}
 return {...result,impactSpeed,landingSpeed};
}
function driveStep(car,dt,input,ground,boxes){
 // Preserve simple scalar-speed fixtures and detect explicit repositioning.
 if(!Number.isFinite(car.vx)||Math.abs(car.speed-car._speed)>.01||Math.hypot(car.pos.x-car._x,car.pos.z-car._z)>.1)resetDriving(car);
 // A descending airborne body must reach the landing branch, even within the
 // ground tolerance. Otherwise the last few centimetres erase its impact.
 const floor=ground(car.pos.x,car.pos.z),wasGrounded=car.grounded&&car.pos.y<=floor+.12;
 car.grounded=wasGrounded;car.landingSpeed=0;
 const tune=handling[car.kind]||handling.buggy;
 const incomingX=car.vx,incomingZ=car.vz,oldSpeed=Math.hypot(car.vx,car.vz);
 car.steer=blend(car.steer,clamp(input.steer,-1,1),8,dt);
 const fx=-Math.sin(car.yaw),fz=-Math.cos(car.yaw),rx=Math.cos(car.yaw),rz=-Math.sin(car.yaw);
 const longitudinal=car.vx*fx+car.vz*fz,lateral=car.vx*rx+car.vz*rz;
 const power=input.boost?29:20,opposed=input.throttle*longitudinal< -1;
 const acceleration=input.throttle*(opposed?35:power)*(input.torque??1)*(car.driveTorque??1);
 if(wasGrounded){
  const frontArm=1.35,rearArm=1.25,wheelbase=frontArm+rearArm;
  const wheelAngle=drivingSteeringAngle(car,oldSpeed),cs=Math.cos(wheelAngle),sn=Math.sin(wheelAngle);
  const frontLoad=tune.grip*rearArm/wheelbase,rearLoad=tune.grip*frontArm/wheelbase;
  // Axle point velocities include yaw momentum. Opposing tire forces turn
  // the body, while their sum accelerates the world-space velocity.
  const front=clamp((longitudinal*sn-(lateral-car.yawRate*frontArm)*cs)*4.5,-frontLoad,frontLoad);
  const rearGrip=rearLoad*(input.handbrake?.42:1);
  const rear=clamp(-(lateral+car.yawRate*rearArm)*5.3,-rearGrip,rearGrip);
  const sideForce=front*cs+rear;
  const drag=input.handbrake?.8:.12;
  let forwardForce=acceleration-front*sn-longitudinal*drag;
  // Braking dissipates momentum before reverse engages. Near rest the
  // handbrake arrests the chassis rather than creeping down a mild slope.
  const gx=(ground(car.pos.x+.35,car.pos.z)-ground(car.pos.x-.35,car.pos.z))/.7;
  const gz=(ground(car.pos.x,car.pos.z+.35)-ground(car.pos.x,car.pos.z-.35))/.7;
  const slopeScale=9.81/(1+gx*gx+gz*gz),hillX=-gx*slopeScale,hillZ=-gz*slopeScale;
  car.vx+=(fx*forwardForce+rx*sideForce+hillX)*dt;
  car.vz+=(fz*forwardForce+rz*sideForce+hillZ)*dt;
  const slip=Math.atan2(lateral,Math.abs(longitudinal)+.5);
  const recovery=clamp(-Math.sign(longitudinal)*slip*5,-3.5,3.5)*clamp((Math.abs(slip)-.1)/.4,0,1)*(input.handbrake?.45:1);
  const yawAcceleration=(-frontArm*front*cs+rearArm*rear)/tune.inertia-car.yawRate*1.2+recovery;
  car.yawRate=clamp(car.yawRate+yawAcceleration*dt,-1.8,1.8);
  // The wall constrains translation; retain the existing low-speed steering
  // escape so a bumper stop never strands a keyboard driver against a prop.
  if(car.wallContact&&oldSpeed<10&&input.throttle)car.yawRate=blend(car.yawRate,-car.steer*1.6*Math.sign(input.throttle),10,dt);
  const reverse=car.vx*fx+car.vz*fz;
  if(reverse< -13){car.vx+=fx*(-13-reverse);car.vz+=fz*(-13-reverse);}
  if(input.handbrake&&input.throttle===0&&oldSpeed<.5){car.vx=car.vz=car.yawRate=0;}
  // A wall supplies the lateral constraint. Do not let tire alignment repeatedly
  // redirect the surviving tangent into that wall and bleed all its speed.
  if(car.wallContact&&car.blockedX)car.vz=incomingZ*Math.exp(-dt*.12)+fz*acceleration*dt;
  if(car.wallContact&&car.blockedZ)car.vx=incomingX*Math.exp(-dt*.12)+fx*acceleration*dt;
 }else car.yawRate*=Math.exp(-dt*.6);
 car.yaw+=car.yawRate*dt;
 const speed=Math.hypot(car.vx,car.vz),cap=input.boost?(car.boostCap??62):(car.cruise??42),limit=Math.max(cap,oldSpeed-dt*9);
 if(speed>limit){car.vx*=limit/speed;car.vz*=limit/speed;}
 const oldY=car.pos.y,oldX=car.pos.x,oldZ=car.pos.z,dx=car.vx*dt,dz=car.vz*dt;
 const collision=slideMove(car.pos,dx,dz,1.5,boxes,Infinity,o=>oldY<ground(o.x,o.z)+o.h);
 let impactSpeed=collision.normalDistance/dt;
 if(collision.blockedX)car.vx=0;if(collision.blockedZ)car.vz=0;
 let newFloor=ground(car.pos.x,car.pos.z);
 // A continuous grade is not a wall. Compare the measured rise with the
 // local tangent to detect an actual step, such as the back of a stunt ramp.
 // Sample behind the actual movement. A centered normal can see across a
 // nearby ramp back and mistake the vertical discontinuity for a steep hill.
 const moveX=car.pos.x-oldX,moveZ=car.pos.z-oldZ,travel=Math.hypot(moveX,moveZ);
 const grade=travel>1e-8?(floor-ground(oldX-moveX/travel*.25,oldZ-moveZ/travel*.25))/.25:0;
 const stepRise=newFloor-floor-grade*travel;
 if(newFloor-oldY>.6&&stepRise>.55){car.pos.x=oldX;car.pos.z=oldZ;newFloor=floor;impactSpeed=Math.max(impactSpeed,speed);car.vx=car.vz=0;collision.hit=true;}
 const rise=(newFloor-floor)/dt;
 if(wasGrounded&&newFloor>=oldY-.6){car.pos.y=newFloor;car.vy=rise;car.airTime=0;}
 else{
  car.vy-=dt*20;car.pos.y+=car.vy*dt;car.airTime+=dt;
  if(car.pos.y<=newFloor){
   const nx=(ground(car.pos.x+.4,car.pos.z)-ground(car.pos.x-.4,car.pos.z))/.8,nz=(ground(car.pos.x,car.pos.z+.4)-ground(car.pos.x,car.pos.z-.4))/.8;
   car.landingSpeed=Math.max(0,(nx*car.vx+nz*car.vz-car.vy)/Math.hypot(nx,1,nz));car.lastAirTime=car.airTime;car.airTime=0;car.pos.y=newFloor;car.vy=nx*car.vx+nz*car.vz;
   car.suspensionV-=Math.min(5,car.landingSpeed*.35);car.grounded=true;
  }else car.grounded=false;
 }
 // Use resolved momentum, after speed limits and contacts, for weight transfer.
 // A car cruising at its cap must settle instead of squatting forever because
 // the driver is still holding the throttle.
 car.longitudinalAcceleration=((car.vx-incomingX)*fx+(car.vz-incomingZ)*fz)/dt;
 car.lateralAcceleration=((car.vx-incomingX)*rx+(car.vz-incomingZ)*rz)/dt;
 car.speed=Math.hypot(car.vx,car.vz)*Math.sign(car.vx*fx+car.vz*fz||1);
 car._speed=car.speed;car._x=car.pos.x;car._z=car.pos.z;
 car.groundSpeed=Math.abs(car.speed);car.slip=Math.atan2(car.vx*rx+car.vz*rz,Math.abs(car.vx*fx+car.vz*fz)+.1);
 car.suspensionV+=(-car.suspension*100-car.suspensionV*12)*dt;car.suspension=clamp(car.suspension+car.suspensionV*dt,-.28,.2);
 const front=ground(car.pos.x+fx*1.3,car.pos.z+fz*1.3),back=ground(car.pos.x-fx*1.3,car.pos.z-fz*1.3);
 const slope=clamp(Math.atan2(front-back,2.6),-.85,.85);
 const left=ground(car.pos.x-rx*1.1,car.pos.z-rz*1.1),right=ground(car.pos.x+rx*1.1,car.pos.z+rz*1.1),bank=clamp(Math.atan2(right-left,2.2),-.65,.65);
 const pitchTarget=car.grounded?slope+clamp(car.longitudinalAcceleration*.004,-.12,.10):Math.atan2(car.vy,Math.max(8,oldSpeed))*.65;
 const rollTarget=(car.grounded?bank:0)+clamp(car.lateralAcceleration*.009,-.22,.22);
 car.drivePitchV=(car.drivePitchV??0)+((pitchTarget-car.pitch)*tune.spring-(car.drivePitchV??0)*tune.damping)*dt;
 car.driveRollV=(car.driveRollV??0)+((rollTarget-car.roll)*tune.spring-(car.driveRollV??0)*tune.damping)*dt;
 car.pitch=clamp(car.pitch+car.drivePitchV*dt,-1.05,1.05);car.roll=clamp(car.roll+car.driveRollV*dt,-.85,.85);
 const hit=collision.hit&&!car.wallContact;car.wallContact=collision.hit;car.blockedX=collision.blockedX;car.blockedZ=collision.blockedZ;
 return {impactSpeed:hit?impactSpeed:0,landingSpeed:car.landingSpeed,collision};
}
