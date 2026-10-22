import {queryObstacles} from './spatial.js';

// Seven conservative envelopes around the approved aircraft, in model metres.
// Separate wings, pods and tail avoid turning the whole span into a solid cube.
// Geometry coverage is checked against every original rendered part in the suite.
export const aircraftHull=Object.freeze([
 [-.81,-.39,-5.09,.81,.60,3.71],[-.53,.38,-3.31,.53,1.07,-1.07],
 [-1.62,-.49,-2.82,-.38,.45,3.66],[.38,-.49,-2.82,1.62,.45,3.66],
 [-4.59,-.11,-.45,4.59,.21,2.04],[-2.23,.17,2.49,2.23,.37,4.01],
 [-.09,.29,1.86,.09,1.85,3.85],
].map(b=>Object.freeze(b)));
const axes=['x','y','z'],EPS=.0001;
export function rotatedBounds(bounds,yaw,pitch,roll){
 const a=Math.cos(pitch),b=Math.sin(pitch),c=Math.cos(yaw),d=Math.sin(yaw),e=Math.cos(roll),f=Math.sin(roll);
 // Same YXZ rotation order as the visible aircraft.
 const m=[c*e+d*b*f,-c*f+d*b*e,d*a,a*f,a*e,-b,-d*e+c*b*f,d*f+c*b*e,c*a];
 return bounds.map(q=>{const center=[(q[0]+q[3])/2,(q[1]+q[4])/2,(q[2]+q[5])/2],half=[(q[3]-q[0])/2,(q[4]-q[1])/2,(q[5]-q[2])/2],out=[];for(let i=0;i<3;i++){const k=i*3,p=m[k]*center[0]+m[k+1]*center[1]+m[k+2]*center[2],h=Math.abs(m[k])*half[0]+Math.abs(m[k+1])*half[1]+Math.abs(m[k+2])*half[2];out[i]=p-h;out[i+3]=p+h;}return out;});
}
export function aircraftSweepBounds(before,after){
 const delta=[after.yaw-before.yaw,after.pitch-before.pitch,after.roll-before.roll],steps=Math.max(1,Math.ceil(Math.max(...delta.map(Math.abs))/.025)),out=rotatedBounds(aircraftHull,before.yaw,before.pitch,before.roll);
 for(let j=1;j<=steps;j++){const t=j/steps,b=rotatedBounds(aircraftHull,before.yaw+delta[0]*t,before.pitch+delta[1]*t,before.roll+delta[2]*t);for(let n=0;n<out.length;n++)for(let i=0;i<3;i++){out[n][i]=Math.min(out[n][i],b[n][i]);out[n][i+3]=Math.max(out[n][i+3],b[n][i+3]);}}
 // Covers the sub-millimetre rotation arc between sampled poses.
 for(const b of out)for(let i=0;i<3;i++){b[i]-=.003;b[i+3]+=.003;}return out;
}
// Maximum of the game's piecewise-linear 2 m terrain over a rectangle. Include
// clipped cell edges and diagonals, not vertices outside the footprint: those
// would make the support floor jump as a wing crosses a lattice boundary.
function terrainMaximum(x0,z0,x1,z1,ground){
 const xs=[x0,x1],zs=[z0,z1];
 for(let x=Math.ceil(x0/2)*2;x<x1;x+=2)xs.push(x);
 for(let z=Math.ceil(z0/2)*2;z<z1;z+=2)zs.push(z);
 let top=-Infinity;
 for(const x of xs)for(const z of zs)top=Math.max(top,ground(x,z));
 for(const x of [x0,x1])for(let z=Math.floor(z0/2)*2;z<=z1;z+=2){const q=z+2-(x-Math.floor(x/2)*2);if(q>=z0&&q<=z1)top=Math.max(top,ground(x,q));}
 for(const z of [z0,z1])for(let x=Math.floor(x0/2)*2;x<=x1;x+=2){const q=x+2-(z-Math.floor(z/2)*2);if(q>=x0&&q<=x1)top=Math.max(top,ground(q,z));}
 return top;
}
// The same conservative seven airframe envelopes used for buildings protect
// wing/nose/tail clearance over terrain. The 1.05 m level skid remains intact.
// Callers cache terrain samples for the duration of one aircraft frame.
export function aircraftTerrainFloor(pos,shapes,ground,clearance=1.05){
 let floor=ground(pos.x,pos.z)+clearance;
 // Airborne broadphase: enclosing lattice nodes give a conservative upper
 // bound. Well above that bound every control/clearance decision is unchanged,
 // so avoid evaluating clipped hull edges until the aircraft is near terrain.
 if(Number.isFinite(pos.y)){
  const x0=pos.x+Math.min(...shapes.map(b=>b[0])),x1=pos.x+Math.max(...shapes.map(b=>b[3]));
  const z0=pos.z+Math.min(...shapes.map(b=>b[2])),z1=pos.z+Math.max(...shapes.map(b=>b[5]));
  let top=-Infinity;
  for(let x=Math.floor(x0/2)*2;x<=Math.ceil(x1/2)*2;x+=2)for(let z=Math.floor(z0/2)*2;z<=Math.ceil(z1/2)*2;z+=2)top=Math.max(top,ground(x,z));
  const upper=Math.max(floor,top-Math.min(...shapes.map(b=>b[1]))+.01);
  if(pos.y>upper+6)return upper;
 }
 for(const b of shapes){
  const top=terrainMaximum(pos.x+b[0],pos.z+b[2],pos.x+b[3],pos.z+b[5],ground);
  floor=Math.max(floor,top-b[1]+.01);
 }
 return floor;
}
const inside=(p,b)=>axes.every((a,i)=>p[a]>b[i]+1e-9&&p[a]<b[i+3]-1e-9);
// Airfield hangars have a 30 cm roof overhang and projecting front trim.
// Keep these in the aircraft/debris path without changing car or crowd bounds.
export function aircraftObstacleBounds(o,floor){
 const x0=o.x-o.w/2,x1=o.x+o.w/2,z0=o.z-o.d/2,z1=o.z+o.d/2,boxes=[[x0,floor,z0,x1,floor+o.h,z1]];
 if(!o.defense&&!o.turret){
  boxes.push([x0-.3,floor+o.h,z0-.3,x1+.3,floor+o.h+.3,z1+.3]);
  boxes.push([x0,floor,z1,x1,floor+o.h,z1+.24]);
 }return boxes;
}

// Continuous translation of a compound envelope through solid building volumes.
// Roof/ceiling entry is swept in Y as well as X/Z. Existing overlaps are resolved
// to the nearest available surface before a sweep; they are never silently skipped.
export function sweepSolidBody(pos,delta,shapes,obstacles,ground,minY=-Infinity){
 const start={x:pos.x,y:pos.y,z:pos.z},range=shapes.reduce((b,q)=>[Math.min(b[0],q[0]),Math.min(b[1],q[2]),Math.max(b[2],q[3]),Math.max(b[3],q[5])],[Infinity,Infinity,-Infinity,-Infinity]);
 const nearby=queryObstacles(obstacles,Math.min(pos.x,pos.x+delta.x)+range[0]-.301,Math.min(pos.z,pos.z+delta.z)+range[1]-.301,Math.max(pos.x,pos.x+delta.x)+range[2]+.301,Math.max(pos.z,pos.z+delta.z)+range[3]+.301),rects=[];
 for(const o of nearby)for(const box of aircraftObstacleBounds(o,ground(o.x,o.z)))for(const s of shapes)rects.push([box[0]-s[3],box[1]-s[4],box[2]-s[5],box[3]-s[0],box[4]-s[1],box[5]-s[2]]);
 const initialOverlap=rects.some(b=>inside(pos,b));let correction={x:0,y:0,z:0};
 if(initialOverlap){let best=null;for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const a=axes[axis],p={...start};for(let n=0;n<=rects.length;n++){const overlap=rects.filter(b=>inside(p,b));if(!overlap.length)break;p[a]=sign<0?Math.min(...overlap.map(b=>b[axis]))-EPS:Math.max(...overlap.map(b=>b[axis+3]))+EPS;}const distance=Math.abs(p[a]-start[a]);if(p.y<minY-1e-8||rects.some(b=>inside(p,b)))continue;if(!best||distance<best.distance)best={p,distance};}if(best){for(const a of axes){correction[a]=best.p[a]-pos[a];pos[a]=best.p[a];}}else return {dx:0,dy:0,dz:0,hit:false,normalDistance:0,normal:{x:0,y:0,z:0},blockedX:false,blockedY:false,blockedZ:false,initialOverlap:true,unresolved:true,correction};}
 let remaining={...delta},blocked=[false,false,false],normal={x:0,y:0,z:0},strongest=0,contacts=0;
 for(let iteration=0;iteration<4&&Math.hypot(remaining.x,remaining.y,remaining.z)>1e-9;iteration++){
  let earliest=1,n=[0,0,0],hit=false;
  for(const b of rects){let enter=-Infinity,leave=Infinity,bn=[0,0,0],miss=false;for(let i=0;i<3;i++){const a=axes[i],p=pos[a],d=remaining[a],lo=b[i],hi=b[i+3];if(Math.abs(d)<1e-12){if(p<=lo||p>=hi){miss=true;break;}continue;}let t0=(lo-p)/d,t1=(hi-p)/d;const s=d>0?-1:1;if(t0>t1)[t0,t1]=[t1,t0];if(t0>enter+1e-9){enter=t0;bn=[0,0,0];bn[i]=s;}else if(Math.abs(t0-enter)<1e-9)bn[i]=s;leave=Math.min(leave,t1);}if(miss||enter>leave||leave<0||enter<-1e-8||enter>earliest+1e-9)continue;if(Math.abs(enter-earliest)<1e-9){for(let i=0;i<3;i++)n[i]=n[i]||bn[i];}else n=bn;earliest=Math.max(0,enter);hit=true;}
  for(const a of axes)pos[a]+=remaining[a]*earliest;if(!hit)break;contacts++;const strength=Math.hypot(...n.map((v,i)=>v?delta[axes[i]]:0));if(strength>strongest){strongest=strength;const length=Math.hypot(...n);normal={x:n[0]/length,y:n[1]/length,z:n[2]/length};}
  for(let i=0;i<3;i++){const a=axes[i];pos[a]+=n[i]*EPS;remaining[a]*=1-earliest;if(n[i]){remaining[a]=0;blocked[i]=true;}}
 }
 return {dx:pos.x-start.x,dy:pos.y-start.y,dz:pos.z-start.z,hit:blocked.some(Boolean),normalDistance:Math.hypot(...blocked.map((v,i)=>v?delta[axes[i]]:0)),normal,blockedX:blocked[0],blockedY:blocked[1],blockedZ:blocked[2],initialOverlap,unresolved:false,correction,contacts};
}
