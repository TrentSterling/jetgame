// Contact-local simulation clock. Keep transient scrape debt out of save bodies.
const clocks=new WeakMap();
export function resetFlightDamage(body){clocks.delete(body);}
export function groundScrapeDamage(body,flight,dt,time,shielded=false){
 if(!(dt>0)||!Number.isFinite(dt)||!Number.isFinite(time))return 0;
 const c=flight.collision,correction=c?.correction||{x:0,z:0},speed=c?Math.hypot(c.dx-correction.x,c.dz-correction.z)/dt:0;
 const movingContact=flight.groundContact&&speed>.8&&(!body.taxiing||(flight.impact&&(c.blockedX||c.blockedZ)));
 let state=clocks.get(body);
 if(!state||state.id!==body.fleetId||time-state.time>dt*1.5+1e-8||time<state.time){state={seconds:0,time:-Infinity,id:body.fleetId};clocks.set(body,state);}
 if(time===state.time)return 0;
 state.time=time;
 if(!movingContact||shielded||body.health<=0){state.seconds=0;return 0;}
 state.seconds+=Math.min(dt,1);
 if(state.seconds+1e-9<1)return 0;
 state.seconds=Math.max(0,state.seconds-1);return 1;
}
