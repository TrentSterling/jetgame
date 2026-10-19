import {freeSpot,slideMove} from './collision.js';
import {queryObstacles} from './spatial.js';

// Local, radius-aware navigation. Cars deliberately do not use the much
// narrower survivor visibility graph. Planning work never grows with a trip.
export const BOT_CAR_RADIUS=2.35;
export const BOT_FOOT_RADIUS=.48;
const MAX_LEG=88,MAX_CORNERS=64;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function botSegmentClear(a,b,boxes,radius=BOT_CAR_RADIUS){
 for(const box of boxes){
  const minX=box.x-box.w/2-radius,maxX=box.x+box.w/2+radius,minZ=box.z-box.d/2-radius,maxZ=box.z+box.d/2+radius;
  // A tire can slide closer to a wall than the planning clearance. Permit
  // leaving that clearance margin, but never route deeper through the wall.
  if(a.x>minX&&a.x<maxX&&a.z>minZ&&a.z<maxZ){
   const sides=[{d:a.x-minX,axis:'x',sign:-1},{d:maxX-a.x,axis:'x',sign:1},{d:a.z-minZ,axis:'z',sign:-1},{d:maxZ-a.z,axis:'z',sign:1}].sort((p,q)=>p.d-q.d);
   if((b[sides[0].axis]-a[sides[0].axis])*sides[0].sign>0)continue;
   return false;
  }
  let low=0,high=1;
  for(const axis of ['x','z']){
   const min=axis==='x'?minX:minZ,max=axis==='x'?maxX:maxZ,delta=b[axis]-a[axis];
   if(Math.abs(delta)<1e-9){if(a[axis]<=min||a[axis]>=max){low=2;break;}}
   else{let enter=(min-a[axis])/delta,leave=(max-a[axis])/delta;if(enter>leave)[enter,leave]=[leave,enter];low=Math.max(low,enter);high=Math.min(high,leave);}
  }
  if(low<=high&&high>1e-7&&low<1-1e-7)return false;
 }
 return true;
}

export function findBotSpot(point,radius,obstacles,limit=18){
 const boxes=queryObstacles(obstacles,point.x-limit-radius,point.z-limit-radius,point.x+limit+radius,point.z+limit+radius);
 if(freeSpot(point.x,point.z,radius,boxes))return {x:point.x,z:point.z};
 for(let r=2;r<=limit;r+=2)for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,p={x:point.x+Math.sin(angle)*r,z:point.z+Math.cos(angle)*r};
  if(freeSpot(p.x,p.z,radius,boxes))return p;
 }
 return null;
}

export function botPath(start,desired,obstacles,radius=BOT_CAR_RADIUS){
 const length=distance(start,desired),scale=Math.min(1,MAX_LEG/Math.max(length,.001));
 const end={x:start.x+(desired.x-start.x)*scale,z:start.z+(desired.z-start.z)*scale};
 const boxes=queryObstacles(obstacles,Math.min(start.x,end.x)-24,Math.min(start.z,end.z)-24,Math.max(start.x,end.x)+24,Math.max(start.z,end.z)+24);
 const goal=findBotSpot(end,radius,boxes,12);if(!goal)return [];
 if(botSegmentClear(start,goal,boxes,radius))return [goal];
 const nodes=[{x:start.x,z:start.z},goal];
 // Keep all boxes as blockers, while bounding the number of candidate corners.
 // A crowded/closed neighborhood fails safely instead of dropping collisions.
 const candidates=[...boxes].sort((a,b)=>distance(start,a)+distance(goal,a)-distance(start,b)-distance(goal,b)).slice(0,MAX_CORNERS/4);
 for(const box of candidates)for(const sx of [-1,1])for(const sz of [-1,1]){
  const point={x:box.x+sx*(box.w/2+radius+.18),z:box.z+sz*(box.d/2+radius+.18)};
  if(freeSpot(point.x,point.z,radius,boxes))nodes.push(point);
 }
 const costs=new Float64Array(nodes.length).fill(Infinity),previous=new Int16Array(nodes.length).fill(-1),seen=new Uint8Array(nodes.length);costs[0]=0;
 for(let n=0;n<nodes.length;n++){
  let current=-1,best=Infinity;
  for(let i=0;i<nodes.length;i++)if(!seen[i]){const score=costs[i]+distance(nodes[i],goal);if(score<best){best=score;current=i;}}
  if(current<0)return [];
  if(current===1){const path=[];for(let i=1;i!==0;i=previous[i])path.unshift(nodes[i]);return path;}
  seen[current]=1;
  for(let i=1;i<nodes.length;i++)if(!seen[i]&&botSegmentClear(nodes[current],nodes[i],boxes,radius)){
   const cost=costs[current]+distance(nodes[current],nodes[i]);if(cost<costs[i]){costs[i]=cost;previous[i]=current;}
  }
 }
 return [];
}

export function friendlyBoxes(friendlies,padding=0){
 return friendlies.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.r)).map(p=>({x:p.x,z:p.z,w:(Math.max(0,p.r)+padding)*2,d:(Math.max(0,p.r)+padding)*2,h:10000,friendly:true}));
}

export function resetBotNavigation(cache={}){Object.assign(cache,{path:[],target:null,nextPlan:0,plans:0});return cache;}
export function moveBotFoot(position,target,dt,time,speed,obstacles,friendlies,cache){
 dt=Math.min(.05,Math.max(0,dt));if(!target||!dt)return 0;
 const targetDistance=distance(position,target);if(targetDistance>MAX_LEG)target={x:position.x+(target.x-position.x)/targetDistance*MAX_LEG,z:position.z+(target.z-position.z)/targetDistance*MAX_LEG};
 friendlies=friendlies.filter(p=>distance(position,p)<110);
 if(time>=cache.nextPlan||!cache.target||distance(target,cache.target)>5){
  const nearby=queryObstacles(obstacles,Math.min(position.x,target.x)-24,Math.min(position.z,target.z)-24,Math.max(position.x,target.x)+24,Math.max(position.z,target.z)+24);
  cache.path=botPath(position,target,[...nearby,...friendlyBoxes(friendlies,.15)],BOT_FOOT_RADIUS);
  cache.target={x:target.x,z:target.z};cache.nextPlan=time+.75;cache.plans++;
 }
 const point=cache.path[0];if(!point)return 0;
 const dx=point.x-position.x,dz=point.z-position.z,length=Math.hypot(dx,dz);
 if(length<.18){cache.path.shift();return 0;}
 const step=Math.min(speed*dt,length),local=queryObstacles(obstacles,position.x-step-1,position.z-step-1,position.x+step+1,position.z+step+1);
 const result=slideMove(position,dx/length*step,dz/length*step,BOT_FOOT_RADIUS,[...local,...friendlyBoxes(friendlies,.08)]);
 const moved=Math.hypot(result.dx,result.dz);if(moved<step*.4)cache.nextPlan=Math.min(cache.nextPlan,time+.12);
 return moved;
}

// Target objects in the shared snapshot are pooled. Validate generation and
// time before reading them, and copy only a selected target into bot state.
export function freshBotSnapshot(snapshot,generation,time){return !!snapshot&&snapshot.generation===generation&&Number.isFinite(snapshot.time)&&time>=snapshot.time-.01&&time-snapshot.time<=.7&&Array.isArray(snapshot.targets);}
