import {height} from './terrain.js';
import {perimeterWalls,turretSites} from './spawn-layout.js';
import {rampBlocks} from './track-layout.js';
import {obstacleList,obstacleRevision,queryObstacles} from './spatial.js';
export const SIZE=384, HALF=SIZE/2, GRID=128, CELL=SIZE/GRID;
export const obstacles=obstacleList([
  {x:-38,z:-22,w:25,d:48,h:11},{x:42,z:-54,w:28,d:42,h:13},
  {x:-65,z:55,w:18,d:17,h:6},{x:64,z:35,w:19,d:22,h:8},
  {x:-76,z:-95,w:15,d:32,h:7},{x:78,z:-115,w:26,d:22,h:9},
  {x:-20,z:99,w:10,d:8,h:5},...perimeterWalls,
  ...turretSites.map(o=>({...o,w:2.5,d:2.5,h:2.4,defense:true,turret:true})),
]);
export {height} from './terrain.js';
// Weapon occlusion samples the height function instead of the dense terrain mesh.
export function terrainRayDistance(origin,dir,range){
 const gap=t=>origin.y+dir.y*t-height(origin.x+dir.x*t,origin.z+dir.z*t);
 if(gap(0)<=0)return 0;
 for(let t=2;t<=range+2;t+=2){const end=Math.min(t,range);if(gap(end)<=0){let lo=Math.max(0,end-2),hi=end;for(let k=0;k<9;k++){const mid=(lo+hi)/2;if(gap(mid)>0)lo=mid;else hi=mid;}return hi;}if(end===range)break;}
 return range;
}
export const navigationObstacles=obstacleList([...obstacles,...rampBlocks]);
export function solid(x,z,r=.5,includeDefenses=true){return queryObstacles(navigationObstacles,x-r,z-r,x+r,z+r).some(o=>(includeDefenses||!o.defense)&&Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);}
export function resolveMove(pos,dx,dz,r=.6){if(!solid(pos.x+dx,pos.z,r))pos.x+=dx;if(!solid(pos.x,pos.z+dz,r))pos.z+=dz;}
export class Field{
 constructor(){this.data=new Float32Array(GRID*GRID*4);this.cost=new Float64Array(GRID*GRID);this.blocked=new Uint8Array(GRID*GRID);this.origin={x:0,z:0};this.stamp='';this.update(0,70);}
 rebuild(x,z){
  const ox=Math.round(x/96)*96,oz=Math.round(z/96)*96,stamp=`${ox},${oz},${obstacleRevision(navigationObstacles)}`;if(stamp===this.stamp)return;this.stamp=stamp;this.origin={x:ox,z:oz};this.blocked.fill(0);
  // Rasterize boxes once when the window moves. Flow uses XY + occupancy;
  // terrain heights are evaluated by the shared GPU collision function.
  for(const o of queryObstacles(navigationObstacles,ox-HALF-.8,oz-HALF-.8,ox+HALF+.8,oz+HALF+.8)){const x0=Math.max(0,Math.ceil((o.x-o.w/2-.8-ox+HALF)/CELL-.5)),x1=Math.min(GRID-1,Math.floor((o.x+o.w/2+.8-ox+HALF)/CELL-.5)),z0=Math.max(0,Math.ceil((o.z-o.d/2-.8-oz+HALF)/CELL-.5)),z1=Math.min(GRID-1,Math.floor((o.z+o.d/2+.8-oz+HALF)/CELL-.5));if(x1<x0||z1<z0)continue;for(let j=z0;j<=z1;j++)this.blocked.fill(1,j*GRID+x0,j*GRID+x1+1);}
  for(let k=0;k<GRID*GRID;k++){this.data[k*4+2]=0;this.data[k*4+3]=this.blocked[k];}
 }
 update(x,z){this.rebuild(x,z);x-=this.origin.x;z-=this.origin.z;const n=GRID,cost=this.cost;let sx=Math.max(1,Math.min(n-2,Math.floor((x+HALF)/CELL))),sz=Math.max(1,Math.min(n-2,Math.floor((z+HALF)/CELL)));let start=sz*n+sx;if(this.blocked[start]){for(let r=1;r<15;r++){let found=false;for(let dz=-r;dz<=r&&!found;dz++)for(let dx=-r;dx<=r;dx++){let xx=sx+dx,zz=sz+dz,k=zz*n+xx;if(xx>0&&xx<n-1&&zz>0&&zz<n-1&&!this.blocked[k]){start=k;found=true;break;}}if(found)break;}}
  // The full solution depends only on the rasterized window and resolved goal.
  // Keep the previous costs/vectors when both are unchanged, including blocked-goal fallback.
  if(this.flowStamp===this.stamp&&this.flowStart===start)return false;
  cost.fill(Infinity);
  let heapSize=0;let heapKeys=this.heapKeys??=new Uint32Array(GRID*GRID*2),heapDistances=this.heapDistances??=new Float64Array(GRID*GRID*2);
  const push=(k,d)=>{if(heapSize===heapKeys.length){const keys=new Uint32Array(heapKeys.length*2),distances=new Float64Array(heapDistances.length*2);keys.set(heapKeys);distances.set(heapDistances);heapKeys=this.heapKeys=keys;heapDistances=this.heapDistances=distances;}let i=heapSize++;while(i){const p=(i-1)>>1;if(heapDistances[p]<=d)break;heapKeys[i]=heapKeys[p];heapDistances[i]=heapDistances[p];i=p;}heapKeys[i]=k;heapDistances[i]=d;};
  let poppedKey=0,poppedDistance=0;
  const pop=()=>{poppedKey=heapKeys[0];poppedDistance=heapDistances[0];const last=--heapSize,lastKey=heapKeys[last],lastDistance=heapDistances[last];if(heapSize){let i=0;while(i*2+1<heapSize){let c=i*2+1;if(c+1<heapSize&&heapDistances[c+1]<heapDistances[c])c++;if(heapDistances[c]>=lastDistance)break;heapKeys[i]=heapKeys[c];heapDistances[i]=heapDistances[c];i=c;}heapKeys[i]=lastKey;heapDistances[i]=lastDistance;}};
  cost[start]=0;push(start,0);while(heapSize){pop();const k=poppedKey,d=poppedDistance;if(d!==cost[k])continue;const xx=k%n,zz=(k/n)|0;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;let nx=xx+dx,nz=zz+dz;if(nx<1||nz<1||nx>=n-1||nz>=n-1)continue;let q=nz*n+nx;if(this.blocked[q]||(dx&&dz&&(this.blocked[k+dx]||this.blocked[k+dz*n])))continue;const nd=d+(dx&&dz?Math.SQRT2:1);if(nd<cost[q]){cost[q]=nd;push(q,nd);}}}
  for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){const k=j*n+i;let bx=0,bz=0,best=cost[k];if(!this.blocked[k])for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const q=k+dz*n+dx;if(this.blocked[q]||(dx&&dz&&(this.blocked[k+dx]||this.blocked[k+dz*n])))continue;if(cost[q]<best){best=cost[q];bx=dx;bz=dz;}}const l=Math.hypot(bx,bz)||1;this.data[k*4]=bx/l;this.data[k*4+1]=bz/l;}
  this.flowStamp=this.stamp;this.flowStart=start;return true;
 }
}
