// Lifetime kills can exceed the fixed actor capacity once dead slots replenish.
// Migration counts saved health, never infers the population from the score.
import {CROWD_COUNTER_COUNT} from './crowd-pressure.js';
export {CROWD_COUNTER_COUNT};
export function migrateCrowdCheckpoint(snapshot){
 const source=new Uint32Array(snapshot.gpu.counters);
 if(source.length===CROWD_COUNTER_COUNT)return snapshot;
 if(source.length!==15)throw Error('Invalid checkpoint: migrate allied counters first');
 const counters=new Uint32Array(CROWD_COUNTER_COUNT);counters.set(source);
 const health=new Float32Array(snapshot.gpu.state),positions=new Float32Array(snapshot.gpu.pos);
 const body=snapshot.runtime.mode==='foot'?snapshot.player:snapshot.fleet.bodies.find(b=>b.fleetId===snapshot.fleet.active[snapshot.runtime.mode]);
 for(let i=0;i<snapshot.count;i++)if(health[i*4]>0){
  counters[15]++;
  if(Math.hypot(positions[i*4]-body.pos[0],positions[i*4+2]-body.pos[2])<=100)counters[16]++;
 }
 return {...snapshot,gpu:{...snapshot.gpu,counters:counters.buffer}};
}
