import {obstacles,solid,height} from './nav.js';

// Old checkpoints predate these solids. Move only intersecting low bodies,
// preserving the stored record and every enemy's identity, health and inventory.
function clearPosition(pos,radius,verticalMargin=0){
 const [x,y,z]=pos,aboveGround=Math.max(0,y-height(x,z)),overlaps=obstacles.filter(o=>o.defense&&Math.abs(x-o.x)<o.w/2+radius&&Math.abs(z-o.z)<o.d/2+radius&&y<height(o.x,o.z)+o.h+verticalMargin+.1);
 if(!overlaps.length)return null;
 const candidates=[];
 for(const o of overlaps){const r=radius+.15;for(const [xx,zz] of [[o.x-o.w/2-r,z],[o.x+o.w/2+r,z],[x,o.z-o.d/2-r],[x,o.z+o.d/2+r]])if(!solid(xx,zz,radius))candidates.push([xx,height(xx,zz)+aboveGround,zz]);}
 candidates.sort((a,b)=>Math.hypot(a[0]-x,a[2]-z)-Math.hypot(b[0]-x,b[2]-z));
 return candidates[0]??null;
}
export function migrateLegacySpawn(snapshot){
 if(snapshot.defenses!==undefined)return {snapshot,moved:0};
 let moved=0;
 const moveBody=(body,radius,verticalMargin=0)=>{const pos=clearPosition(body.pos,radius,verticalMargin);if(!pos)return body;moved++;return {...body,pos,vx:0,vz:0,speed:0};};
 const player=moveBody(snapshot.player,.45),bodies=snapshot.fleet.bodies.map(b=>moveBody(b,b.kind==='jet'?1.8:1.5,b.kind==='jet'?1:0));
 const positions=new Float32Array(snapshot.gpu.pos),states=new Float32Array(snapshot.gpu.state);let p,v;
 for(let i=0;i<snapshot.count;i++){const k=i*4;if(states[k]<=0)continue;const q=clearPosition([positions[k],positions[k+1],positions[k+2]],2.5);if(!q)continue;
  p??=positions.slice();v??=new Float32Array(snapshot.gpu.vel.slice(0));p.set(q,k);v[k]=v[k+1]=v[k+2]=0;moved++;
 }
 if(!moved)return {snapshot,moved};
 return {snapshot:{...snapshot,player,fleet:{...snapshot.fleet,bodies},gpu:{...snapshot.gpu,...(p?{pos:p.buffer,vel:v.buffer}:{})}},moved};
}
