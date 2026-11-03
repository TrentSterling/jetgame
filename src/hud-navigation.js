// Frame-current objective projection and a ground-plane turn bearing. This
// consumes camera matrices only; it never reads a GPU buffer or draws UI.
const finite=Number.isFinite,TAU=Math.PI*2;
const wrap=r=>((r+Math.PI)%TAU+TAU)%TAU-Math.PI;

export class HudNavigation{
 constructor(){this.heading=0;this.hasHeading=false;this.rearSide=1;this.point={x:0,y:0,label:'OBJECTIVE',distance:0,behind:false,inView:false,bearing:0,direction:'ahead',turnDegrees:0};}
 update(camera,target,observer,fallbackYaw=0){
  if(!target||![target.x,target.y,target.z,observer?.x,observer?.y,observer?.z].every(finite))return null;
  camera.updateMatrixWorld?.();
  const view=camera.matrixWorldInverse?.elements,world=camera.matrixWorld?.elements,projection=camera.projectionMatrix?.elements;
  if(!view||!world||!projection)return null;
  const x=target.x,y=target.y,z=target.z;
  const vx=view[0]*x+view[4]*y+view[8]*z+view[12],vy=view[1]*x+view[5]*y+view[9]*z+view[13],vz=view[2]*x+view[6]*y+view[10]*z+view[14];
  const w=projection[3]*vx+projection[7]*vy+projection[11]*vz+projection[15];
  const px=projection[0]*vx+projection[4]*vy+projection[8]*vz+projection[12],py=projection[1]*vx+projection[5]*vy+projection[9]*vz+projection[13];
  const ndcX=Math.abs(w)>1e-7?px/w:0,ndcY=Math.abs(w)>1e-7?py/w:0,depth=-vz;
  if(![ndcX,ndcY,depth].every(finite))return null;
  // Looking straight up/down makes horizontal camera direction undefined.
  // Preserve its last stable heading instead of flipping the compass by 180°.
  const fx=-world[8],fz=-world[10];
  if(Math.hypot(fx,fz)>.035){this.heading=Math.atan2(fx,-fz);this.hasHeading=true;}
  else if(!this.hasHeading)this.heading=finite(fallbackYaw)?-fallbackYaw:0;
  const dx=x-observer.x,dy=y-observer.y,dz=z-observer.z,horizontal=Math.hypot(dx,dz);
  let bearing=horizontal>.05?wrap(Math.atan2(dx,-dz)-this.heading):0;
  // Retain which way to turn through the tiny rear singularity. A target
  // directly behind stays TURN AROUND instead of oscillating left/right.
  if(Math.abs(bearing)<Math.PI-.10&&Math.abs(bearing)>.02)this.rearSide=Math.sign(bearing);
  if(Math.abs(bearing)>Math.PI-.035)bearing=this.rearSide*Math.abs(bearing);
  // Distant objectives still need a marker even beyond the world's far clip.
  const inView=depth>Math.max(.001,camera.near||.05)&&Math.abs(ndcX)<=1&&Math.abs(ndcY)<=1;
  let direction='ahead';
  if(Math.abs(bearing)>Math.PI*5/6)direction='behind';
  else if(Math.abs(bearing)>Math.PI/12)direction=bearing<0?'left':'right';
  else if(!inView){
   if(vy>.01&&Math.abs(ndcY)>1)direction='above';
   else if(vy<-.01&&Math.abs(ndcY)>1)direction='below';
   else if(depth<=0)direction='behind';
  }
  return Object.assign(this.point,{x:ndcX,y:ndcY,label:target.label||'OBJECTIVE',distance:Math.hypot(dx,dy,dz),behind:depth<-.0001,inView,bearing,direction,turnDegrees:Math.round(Math.abs(bearing)*180/Math.PI)});
 }
}
