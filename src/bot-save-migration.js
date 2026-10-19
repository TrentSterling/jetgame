import {regionAt,regionsNear,legacyExpeditionPeople} from './regions.js';

export const LEGACY_COUNTER_COUNT=13,BOT_COUNTER_COUNT=15;
export function checkpointRegion(id){
 if(typeof id!=='string'||!/^(-?\d+),(-?\d+)$/.test(id))return null;
 const coords=id.split(',').map(Number);return coords.every(Number.isSafeInteger)?regionAt(...coords):null;
}

// Validate the checkpoint before calling this. Never mutate stored buffers or
// mission records: the original remains a valid rollback checkpoint at commit.
export function migrateBotCheckpoint(snapshot){
 const source=snapshot.gpu.counters;
 if(!(source instanceof ArrayBuffer)||![LEGACY_COUNTER_COUNT*4,BOT_COUNTER_COUNT*4].includes(source.byteLength))throw Error('Invalid checkpoint: counters buffer');
 let counters=source;
 if(source.byteLength===LEGACY_COUNTER_COUNT*4){const padded=new Uint32Array(BOT_COUNTER_COUNT);padded.set(new Uint32Array(source));counters=padded.buffer;}
 const e=snapshot.expeditions,sites=new Map(e.missions?.sites||[]),done=new Set(e.done),repaired=new Set(e.repaired),known=new Set([...done,...repaired,...e.visited,...e.refuges.map(r=>r.id)]);
 if(e.party)known.add(e.party.id);
 // Pre-mission checkpoints have no per-person state. Preserve the old offers
 // that were already loaded at home and around the saved controlled body.
 if(e.missions===undefined){
  const body=snapshot.runtime.mode==='foot'?snapshot.player:snapshot.fleet.bodies.find(b=>b.fleetId===snapshot.fleet.active[snapshot.runtime.mode]);
  for(const site of [...regionsNear(0,70),...regionsNear(body.pos[0],body.pos[2])])known.add(site.id);
 }
 let added=0;
 for(const id of known){
  if(sites.has(id))continue;
  const site=checkpointRegion(id);if(!site)continue;
  const count=e.party?.id===id?e.party.count:legacyExpeditionPeople(site);
  sites.set(id,{kit:site.kind==='quarry'&&repaired.has(id),signal:site.kind==='relay'&&done.has(id)?12:0,people:Array.from({length:count},(_,i)=>({x:site.x-4+i*2,z:site.z-1}))});added++;
 }
 const missions=e.missions!==undefined&&!added?e.missions:{version:1,relays:e.missions?.relays??[...done].filter(id=>checkpointRegion(id)?.kind==='relay').length,sites:[...sites]};
 if(counters===source&&missions===e.missions)return snapshot;
 return {...snapshot,gpu:{...snapshot.gpu,counters},expeditions:{...e,missions}};
}
