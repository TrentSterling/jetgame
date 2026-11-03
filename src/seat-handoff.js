import {canRide} from './passenger.js';

const owners=new WeakMap();
function clearPlan(driver,time){
 driver.target=driver.goal=null;driver.path=[];
 driver.nextPlan=driver.nextDecision=driver.progressAt=time;
 driver.reverseUntil=driver.yieldTime=driver.stuckTime=0;
 driver.lastProgress={x:driver.body.pos.x,z:driver.body.pos.z};
 driver.old.copy(driver.body.pos);driver.blocked=false;
 driver.control={throttle:0,steer:0,boost:false,handbrake:false};
}

// Borrow the live allied vehicle; never clone its body or insert it into Fleet.
// Main binds its player car/mesh to `active.body/mesh` until release, owns their
// physics and player damage sweep, then restores its canonical Fleet bindings.
export class SeatHandoff{
 constructor(bots){this.bots=bots;this.active=null;}
 owns(binding=this.active){
  return !!binding&&this.bots.epoch===binding.epoch&&this.bots.cars.includes(binding.driver)&&binding.driver.body===binding.body&&binding.driver.mesh===binding.mesh&&binding.driver.playerControlled===true&&owners.get(binding.driver)===binding;
 }
 valid(){return this.owns()&&(this.active.body.health??100)>0&&this.active.mesh.visible!==false;}
 take(driver,time=0){
  if(this.active||!this.bots.cars.includes(driver)||driver.playerControlled||!driver.mesh||!canRide(driver))return null;
  const binding={driver,body:driver.body,mesh:driver.mesh,epoch:this.bots.epoch};
  this.active=binding;owners.set(driver,binding);driver.playerControlled=true;
  clearPlan(driver,time);driver.mode='player';driver.mesh.userData.occupantSeat='passenger';
  return binding;
 }
 release(time=0){
  const binding=this.active;if(!binding)return null;
  const owned=this.owns(binding);this.active=null;
  if(owners.get(binding.driver)===binding)owners.delete(binding.driver);
  // A reset may reuse these same body/mesh objects. Never modify that new
  // driver's state, or another controller's later handoff, from an old epoch.
  if(!owned)return null;
  const {driver,body,mesh}=binding;driver.playerControlled=false;
  clearPlan(driver,time);driver.mode='follow';mesh.userData.occupantSeat='driver';
  body.boosting=false;for(const flame of mesh.userData.boost||[])flame.visible=false;
  this.bots.nextDecision=time;
  return binding;
 }
}
