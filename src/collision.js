import {queryObstacles,querySweep} from './spatial.js';

// Swept disc against expanded, axis-aligned hangars. Only the inward component
// is removed; the remaining displacement is spent along the contact surface.
export function slideMove(pos,dx,dz,r,boxes,bound=Infinity,accept=null){
 const startX=pos.x,startZ=pos.z;
 let rx=dx,rz=dz,blockedX=false,blockedZ=false;
 const rects=[];
 for(const o of querySweep(boxes,pos.x,pos.z,dx,dz,r)){
  if(accept&&!accept(o))continue;
  rects.push({minX:o.x-o.w/2-r,maxX:o.x+o.w/2+r,minZ:o.z-o.d/2-r,maxZ:o.z+o.d/2+r});
 }
 if(Number.isFinite(bound))rects.push(
  {minX:bound-r,maxX:Infinity,minZ:-Infinity,maxZ:Infinity},
  {minX:-Infinity,maxX:-bound+r,minZ:-Infinity,maxZ:Infinity},
  {minX:-Infinity,maxX:Infinity,minZ:bound-r,maxZ:Infinity},
  {minX:-Infinity,maxX:Infinity,minZ:-Infinity,maxZ:-bound+r});
 for(let iteration=0;iteration<4&&(Math.abs(rx)+Math.abs(rz))>1e-8;iteration++){
  let earliest=1,nx=0,nz=0,hit=false;
  for(const b of rects){
   let enter=-Infinity,leave=Infinity,bx=0,bz=0,miss=false;
   for(const axis of ['x','z']){
    const p=axis==='x'?pos.x:pos.z,d=axis==='x'?rx:rz,lo=axis==='x'?b.minX:b.minZ,hi=axis==='x'?b.maxX:b.maxZ;
    if(Math.abs(d)<1e-10){if(p<=lo||p>=hi){miss=true;break;}continue;}
    let t0=(lo-p)/d,t1=(hi-p)/d;const normal=d>0?-1:1;
    if(t0>t1)[t0,t1]=[t1,t0];
    if(t0>enter+1e-8){enter=t0;bx=axis==='x'?normal:0;bz=axis==='z'?normal:0;}
    else if(Math.abs(t0-enter)<1e-8){if(axis==='x')bx=normal;else bz=normal;}
    leave=Math.min(leave,t1);
   }
   if(miss||enter>leave||leave<0||enter<-.00001||enter>earliest)continue;
   if(Math.abs(enter-earliest)<1e-8){nx=nx||bx;nz=nz||bz;}else{nx=bx;nz=bz;}
   earliest=Math.max(0,enter);hit=true;
  }
  pos.x+=rx*earliest;pos.z+=rz*earliest;
  if(!hit)break;
  pos.x+=nx*.0001;pos.z+=nz*.0001;
  rx*=1-earliest;rz*=1-earliest;
  if(nx){rx=0;blockedX=true;}if(nz){rz=0;blockedZ=true;}
 }
 return {dx:pos.x-startX,dz:pos.z-startZ,blockedX,blockedZ,hit:blockedX||blockedZ,normalDistance:Math.hypot(blockedX?dx:0,blockedZ?dz:0)};
}

export function freeSpot(x,z,r,boxes,bound=Infinity){return Math.abs(x)<bound-r&&Math.abs(z)<bound-r&&!queryObstacles(boxes,x-r,z-r,x+r,z+r).some(o=>Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);}
