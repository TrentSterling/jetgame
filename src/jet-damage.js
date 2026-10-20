// Cosmetic AF-01 radome study. The collision body and approved art factory are
// untouched. Only the forward shell moves; the aft shell, collar and panel
// attachments stay byte-identical. No CrumpleCar source or physics is used.
const ANCHOR_Z=-4.2, TIP_Z=-5.083, LENGTH=ANCHOR_Z-TIP_Z;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function radomeWeight(z){
 const u=clamp((ANCHOR_Z-z)/LENGTH,0,1);
 return [u*u*(3-2*u),u>0&&u<1?-6*u*(1-u)/LENGTH:0];
}
// Root-local map (y measured from the radome axis) and inverse-transpose normal.
// The triangular Jacobian
// has scale >= .9 and dz'/dz >= 1-.22*1.5/LENGTH > .626, even at saturation.
export function deformRadome(x,y,z,nx,ny,nz,level,bias,out=[]){
 const u=clamp((ANCHOR_Z-z)/LENGTH,0,1),w=u*u*(3-2*u),dw=u>0&&u<1?-6*u*(1-u)/LENGTH:0;
 if(!w){out[0]=x;out[1]=y;out[2]=z;out[3]=nx;out[4]=ny;out[5]=nz;return out;}
 const s=1-.1*level*w,ds=-.1*level*dw;
 const ax=ds*x+.07*bias*dw,ay=ds*y-.035*level*dw,az=1+.22*level*dw;
 const a=nx/s,b=ny/s,c=(nz-ax*a-ay*b)/az,length=Math.hypot(a,b,c);
 out[0]=x*s+.07*bias*w;out[1]=y*s-.035*level*w;out[2]=z+.22*level*w;out[3]=a/length;out[4]=b/length;out[5]=c/length;return out;
}
export function attachJetDamage(root){
 let mesh;root.traverse(o=>{if(o.isMesh&&o.userData.jetPart==='AF-01'){if(mesh)throw Error('Expected one AF-01 shell');mesh=o;}});
 if(!mesh||!mesh.visible||mesh.userData.rigidSource)throw Error('AF-01 must remain an independent visible shell');
 // Wrecks normally share fixed source buffers. This one mutable shell needs
 // its own wreck snapshot so a later aircraft reset cannot reshape debris.
 mesh.userData.cosmeticWreckSnapshot=true;
 const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
 const originalPosition=p.array.slice(),originalNormal=n.array.slice(),pivot=mesh.position.toArray();
 let level=0,bias=0,hits=0,updates=0,lastUpdateMs=0,maxUpdateMs=0,beforeX=0,beforeZ=0,beforeSpeed=0;
 function publish(){p.needsUpdate=n.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();updates++;}
 function impact(speed,localX,localZ){
  const length=Math.hypot(localX,localZ);
  if(![speed,localX,localZ].every(Number.isFinite)||speed<5||length<1e-8||-localZ/length<.65)return false;
  const gain=clamp((speed-5)/45,0,.8),next=Math.min(1,level+gain),nextBias=clamp(bias+gain*clamp(localX/Math.max(.001,-localZ),-1,1),-next,next);
  if(next===level&&nextBias===bias)return false;
  level=next;bias=nextBias;hits++;const start=performance.now(),work=[];
  for(let i=0;i<originalPosition.length;i+=3){
   const z=originalPosition[i+2]+pivot[2];
   if(z>=ANCHOR_Z)continue;
   const q=deformRadome(originalPosition[i]+pivot[0],originalPosition[i+1],z,originalNormal[i],originalNormal[i+1],originalNormal[i+2],level,bias,work);
   p.array[i]=q[0]-pivot[0];p.array[i+1]=q[1];p.array[i+2]=q[2]-pivot[2];
   n.array[i]=q[3];n.array[i+1]=q[4];n.array[i+2]=q[5];
  }
  publish();lastUpdateMs=performance.now()-start;maxUpdateMs=Math.max(maxUpdateMs,lastUpdateMs);return true;
 }
 root.userData.jetDamage={
  // Three cached scalars, no per-frame allocation or buffer upload.
  begin(body){beforeX=body.pos.x;beforeZ=body.pos.z;beforeSpeed=body.speed;},
  observe(body,flight,dt,time,shielded=false){
   if(!flight.impact||body.wallContact||body.health<=0||shielded||time<body.impactAt||flight.impactSpeed<5||!(dt>0))return false;
   // Read the planar travel lost by the existing step, solely to reject side
   // swipes and choose the cosmetic bend side. Never feed this back to physics.
   const s=Math.sin(body.yaw),c=Math.cos(body.yaw),travel=Math.max(beforeSpeed,body.speed)*dt*Math.cos(body.flightPitch??body.pitch);
   const x=-s*travel-(body.pos.x-beforeX),z=-c*travel-(body.pos.z-beforeZ);
   return impact(flight.impactSpeed,c*x-s*z,s*x+c*z);
  },
  impact,
  reset(){if(!level&&!bias)return false;p.array.set(originalPosition);n.array.set(originalNormal);level=bias=hits=0;publish();return true;},
  report(){return {zone:'AF-01 forward radome',level,bias,hits,updates,vertices:p.count,cpuBytes:originalPosition.byteLength+originalNormal.byteLength,uploadBytes:p.array.byteLength+n.array.byteLength,lastUpdateMs,maxUpdateMs,maxDisplacement:.27,anchorZ:ANCHOR_Z,save:'Cosmetic only; reset on restart, checkpoint load, aircraft respawn and stream reconstruction. Repair does not erase dents.'};}
 };
 return root;
}
