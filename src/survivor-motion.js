import {slideMove,freeSpot} from './collision.js';
import {queryObstacles} from './spatial.js';

// A small visibility graph only for nearby shelter buildings. No crowd readback,
// per-frame navigation field or growing world-wide path cache is needed here.
const RADIUS=.45;
function clear(a,b,boxes){
 for(const o of boxes){
  let low=0,high=1;
  for(const axis of ['x','z']){
   const half=(axis==='x'?o.w:o.d)/2+RADIUS,delta=b[axis]-a[axis];
   const min=o[axis]-half,max=o[axis]+half;
   if(Math.abs(delta)<1e-9){if(a[axis]<=min||a[axis]>=max){low=2;break;}}
   else{let enter=(min-a[axis])/delta,leave=(max-a[axis])/delta;if(enter>leave)[enter,leave]=[leave,enter];low=Math.max(low,enter);high=Math.min(high,leave);}
  }
  if(low<=high&&high>0&&low<1)return false;
 }
 return true;
}
export function survivorPath(start,end,obstacles){
 const boxes=queryObstacles(obstacles,Math.min(start.x,end.x)-24,Math.min(start.z,end.z)-24,Math.max(start.x,end.x)+24,Math.max(start.z,end.z)+24);
 if(!freeSpot(end.x,end.z,RADIUS,boxes))return [];
 if(clear(start,end,boxes))return [{x:end.x,z:end.z}];
 const nodes=[{x:start.x,z:start.z},{x:end.x,z:end.z}];
 for(const o of boxes)for(const sx of [-1,1])for(const sz of [-1,1]){
  const p={x:o.x+sx*(o.w/2+RADIUS+.08),z:o.z+sz*(o.d/2+RADIUS+.08)};
  if(freeSpot(p.x,p.z,RADIUS,boxes))nodes.push(p);
 }
 const distances=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1),seen=new Uint8Array(nodes.length);distances[0]=0;
 for(let n=0;n<nodes.length;n++){
  let index=-1;for(let i=0;i<nodes.length;i++)if(!seen[i]&&(index<0||distances[i]<distances[index]))index=i;
  if(index<0||!Number.isFinite(distances[index]))return [];
  if(index===1){const path=[];for(let i=1;i!==0;i=previous[i])path.unshift(nodes[i]);return path;}
  seen[index]=1;
  for(let i=0;i<nodes.length;i++)if(!seen[i]&&clear(nodes[index],nodes[i],boxes)){
   const candidate=distances[index]+Math.hypot(nodes[i].x-nodes[index].x,nodes[i].z-nodes[index].z);
   if(candidate<distances[i]){distances[i]=candidate;previous[i]=index;}
  }
 }
 return [];
}
export function moveSurvivor(person,target,dt,speed,obstacles,cache){
 dt=Math.max(0,Math.min(dt,.1));
 cache.cooldown=(cache.cooldown||0)-dt;
 if(!target){cache.path=[];return 0;}
 if(!cache.target||Math.hypot(target.x-cache.target.x,target.z-cache.target.z)>1.5||cache.cooldown<=0){
  cache.path=survivorPath(person,target,obstacles);cache.target={...target};cache.cooldown=.5;
 }
 let budget=speed*dt,moved=0;
 while(budget>1e-6&&cache.path.length){
  const point=cache.path[0],dx=point.x-person.x,dz=point.z-person.z,distance=Math.hypot(dx,dz);
  if(distance<.08){cache.path.shift();continue;}
  const step=Math.min(distance,budget),result=slideMove(person,dx/distance*step,dz/distance*step,RADIUS,obstacles),travel=Math.hypot(result.dx,result.dz);
  moved+=travel;budget-=step;if(travel<step*.5)break;
 }
 return moved;
}
