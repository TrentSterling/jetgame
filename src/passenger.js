import {freeSpot,slideMove} from './collision.js';

// The right front seat belongs to the player; the NPC keeps the left seat and
// its own driving state. Coordinates match the buggy's YXZ body transform.
export const PASSENGER_EYE=Object.freeze({x:.45,y:1.93,z:.30});
export function passengerSeat(body,out={}){
 const p=body.pitch||0,r=body.roll||0,y=body.yaw||0,s=PASSENGER_EYE;
 const x=s.x*Math.cos(r)-s.y*Math.sin(r),yy=s.x*Math.sin(r)+s.y*Math.cos(r);
 const py=yy*Math.cos(p)-s.z*Math.sin(p),z=yy*Math.sin(p)+s.z*Math.cos(p);
 out.x=body.pos.x+x*Math.cos(y)+z*Math.sin(y);
 out.y=body.pos.y+(body.suspension||0)+py;
 out.z=body.pos.z-x*Math.sin(y)+z*Math.cos(y);return out;
}
export function canRide(driver){
 const b=driver?.body;return !!b&&driver.mesh?.visible!==false&&(b.health??100)>0&&Math.abs(b.roll||0)<.85&&Math.abs(b.pitch||0)<.85&&b.grounded!==false;
}
// One decision for the prompt, nearby report and E action. Preserve the old
// closest-vehicle rule, including parked vehicles winning an exact tie.
export function chooseBoardingTarget(ally,parked,pos){
 const distance=b=>Math.hypot(pos.x-b.pos.x,pos.y-b.pos.y,pos.z-b.pos.z);
 if(ally&&(!parked||distance(ally.body)<distance(parked.body)))return {type:'passenger',driver:ally};
 return parked?{type:parked.type,entry:parked}:null;
}
export function nearestPassengerCar(cars,pos,boxes=[]){
 return cars.filter(c=>{
  if(!canRide(c)||Math.abs(c.body.speed)>=9||Math.abs(pos.y-c.body.pos.y)>=2.6||Math.hypot(pos.x-c.body.pos.x,pos.z-c.body.pos.z)>=4.2)return false;
  const probe={x:pos.x,z:pos.z};slideMove(probe,c.body.pos.x-pos.x,c.body.pos.z-pos.z,.6,boxes);
  return Math.hypot(probe.x-c.body.pos.x,probe.z-c.body.pos.z)<.02;
 })
  .sort((a,b)=>Math.hypot(pos.x-a.body.pos.x,pos.z-a.body.pos.z)-Math.hypot(pos.x-b.body.pos.x,pos.z-b.body.pos.z))[0]||null;
}
export function passengerExit(body,ground,boxes,vehicles=[],emergency=false){
 const airborne=body.pos.y-ground(body.pos.x,body.pos.z)>3;
 const walls=boxes.filter(o=>body.pos.y<ground(o.x,o.z)+(o.h||0)+1.8);
 for(const radius of emergency?[4.6,6,8,10]:[4.6,6])for(const angle of [-Math.PI/2,Math.PI/2,Math.PI,0,-Math.PI/4,Math.PI/4]){
  const x=body.pos.x-Math.sin(body.yaw+angle)*radius,z=body.pos.z-Math.cos(body.yaw+angle)*radius;
  const y=ground(x,z);if(!Number.isFinite(y)||(!airborne&&y>body.pos.y+.8)||!freeSpot(x,z,.65,walls))continue;
  if(vehicles.some(v=>v.body!==body&&Math.hypot(x-v.body.pos.x,z-v.body.pos.z)<(v.radius||3.6)+.65))continue;
  const probe={x:body.pos.x,z:body.pos.z};slideMove(probe,x-probe.x,z-probe.z,.65,walls);
  if(Math.hypot(probe.x-x,probe.z-z)>.02)continue;
  return {x,y:airborne?Math.max(y,body.pos.y+1):y,z,airborne,vx:body.vx||0,vz:body.vz||0};
 }
 return null;
}
