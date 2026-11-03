// Contact-local simulation clock. Keep transient scrape debt out of save bodies.
const clocks=new WeakMap();
export function resetFlightDamage(body){clocks.delete(body);}
export function groundScrapeDamage(body,flight,dt,time,shielded=false){
 if(!(dt>0)||!Number.isFinite(dt)||!Number.isFinite(time))return 0;
 let state=clocks.get(body);
 if(!state||state.id!==body.fleetId||time-state.time>dt*1.5+1e-8||time<state.time){state={seconds:0,time:-Infinity,id:body.fleetId};clocks.set(body,state);}
 if(time===state.time)return 0;
 state.time=time;
 if(shielded||body.health<=0){state.seconds=0;return 0;}
 const c=flight.collision,correction=c?.correction||{x:0,z:0};
 const steps=flight.contactSteps||[{dt:Math.min(dt,1),groundContact:flight.groundContact,taxiing:body.taxiing,impact:flight.impact,blockedX:c?.blockedX,blockedZ:c?.blockedZ,speed:c?Math.hypot(c.dx-correction.x,c.dz-correction.z)/dt:0}];
 // Render frames without an aircraft tick neither erase scrape debt nor add
 // time. Preserve each simulated contact gap instead of stretching any contact
 // over the whole render frame or applying damage repeatedly to the same tick.
 let damage=0;for(const step of steps){
  const moving=step.groundContact&&step.speed>.8&&(!step.taxiing||(step.impact&&(step.blockedX||step.blockedZ)));
  if(!moving){state.seconds=0;continue;}state.seconds+=step.dt;
  while(state.seconds+1e-9>=1){state.seconds=Math.max(0,state.seconds-1);damage++;}
 }
 return damage;
}
