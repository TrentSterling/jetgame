import {slideMove} from './collision.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const blend=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
export function resetDriving(car){
 Object.assign(car,{vx:-Math.sin(car.yaw)*car.speed,vz:-Math.cos(car.yaw)*car.speed,vy:0,steer:0,yawRate:0,slip:0,roll:0,pitch:0,suspension:0,suspensionV:0,grounded:true,airTime:0,lastAirTime:0,landingSpeed:0,wallContact:false,_speed:car.speed,_x:car.pos.x,_z:car.pos.z});
}
export function stepDriving(car,dt,input,ground,boxes){
 // Short steps make slope contact independent of the render rate. Do not
 // change the loose planar tire model when increasing terrain fidelity.
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
 const incomingX=car.vx,incomingZ=car.vz,oldSpeed=Math.hypot(car.vx,car.vz),oldForward=-Math.sin(car.yaw)*car.vx-Math.cos(car.yaw)*car.vz;
 car.steer=blend(car.steer,input.steer,11,dt);
 const speedTurn=clamp(Math.abs(oldForward)/8,car.wallContact&&input.throttle?.65:0,1);
 const highSpeed=1-clamp((oldSpeed-28)/100,0,.27);
 const yawTarget=-car.steer*speedTurn*(input.handbrake?2.5:1.75)*highSpeed*Math.sign(oldForward||input.throttle||1);
 car.yawRate=blend(car.yawRate,yawTarget,wasGrounded?7:1.3,dt);
 car.yaw+=car.yawRate*dt*(wasGrounded?1:.3);
 const fx=-Math.sin(car.yaw),fz=-Math.cos(car.yaw),rx=Math.cos(car.yaw),rz=-Math.sin(car.yaw);
 let longitudinal=car.vx*fx+car.vz*fz,lateral=car.vx*rx+car.vz*rz;
 const power=input.boost?29:20,opposed=input.throttle*longitudinal< -1;
 const acceleration=input.throttle*(opposed?35:power)*(input.torque??1)*(car.driveTorque??1);
 if(wasGrounded){
  longitudinal+=acceleration*dt;
  longitudinal*=Math.exp(-dt*(input.handbrake?.8:input.throttle?.12:.22));
  const grip=input.handbrake?.7:Math.abs(input.steer)>.15&&input.throttle>0?2.7:5.2;
  lateral*=Math.exp(-dt*grip);
  if(input.throttle<0&&longitudinal< -13)longitudinal=-13;
  car.vx=fx*longitudinal+rx*lateral;car.vz=fz*longitudinal+rz*lateral;
  // A wall supplies the lateral constraint. Do not let tire alignment repeatedly
  // redirect the surviving tangent into that wall and bleed all its speed.
  if(car.wallContact&&car.blockedX)car.vz=incomingZ*Math.exp(-dt*.12)+fz*acceleration*dt;
  if(car.wallContact&&car.blockedZ)car.vx=incomingX*Math.exp(-dt*.12)+fx*acceleration*dt;
 }
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
 car.speed=Math.hypot(car.vx,car.vz)*Math.sign(car.vx*fx+car.vz*fz||1);
 car._speed=car.speed;car._x=car.pos.x;car._z=car.pos.z;
 car.groundSpeed=Math.abs(car.speed);car.slip=Math.atan2(car.vx*rx+car.vz*rz,Math.abs(car.vx*fx+car.vz*fz)+.1);
 car.suspensionV+=(-car.suspension*100-car.suspensionV*12)*dt;car.suspension=clamp(car.suspension+car.suspensionV*dt,-.28,.2);
 const front=ground(car.pos.x+fx*1.3,car.pos.z+fz*1.3),back=ground(car.pos.x-fx*1.3,car.pos.z-fz*1.3);
 const slope=clamp(Math.atan2(front-back,2.6),-.85,.85);
 const left=ground(car.pos.x-rx*1.1,car.pos.z-rz*1.1),right=ground(car.pos.x+rx*1.1,car.pos.z+rz*1.1),bank=clamp(Math.atan2(right-left,2.2),-.65,.65);
 car.pitch=blend(car.pitch,car.grounded?slope-clamp(acceleration*.0018,-.075,.06):Math.atan2(car.vy,Math.max(8,oldSpeed))*.65,7,dt);
 car.roll=blend(car.roll,(car.grounded?bank:0)+clamp(car.yawRate*oldSpeed*.0045,-.17,.17),9,dt);
 const hit=collision.hit&&!car.wallContact;car.wallContact=collision.hit;car.blockedX=collision.blockedX;car.blockedZ=collision.blockedZ;
 return {impactSpeed:hit?impactSpeed:0,landingSpeed:car.landingSpeed,collision};
}
