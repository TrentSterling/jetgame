import * as T from 'three/webgpu';

// Cosmetic front-end prototype. Two lateral lanes share four longitudinal cage
// stations; the rear station pins the hood before the protected cabin. A hit
// edits existing position/normal buffers once, never the driving body or hull.
const stations=[[-3.15,.24,0],[-2.35,.14,.085],[-1.60,0,0],[-.56,0,0]];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const selected=new Set(['RAM-02','RAM-07']);
function profile(z){
 if(z<=stations[0][0])return [stations[0][1],stations[0][2],0,0];
 if(z>=stations.at(-1)[0])return [0,0,0,0];
 for(let i=1;i<stations.length;i++)if(z<stations[i][0]){
  const a=stations[i-1],b=stations[i],span=b[0]-a[0],t=(z-a[0])/span;
  return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,(b[1]-a[1])/span,(b[2]-a[2])/span];
 }
}

export function attachRammerDamage(root,render,spans){
 const position=render.geometry.attributes.position,normal=render.geometry.attributes.normal;
 const point=new T.Vector3(),vector=new T.Vector3();
 const regions=spans.filter(s=>selected.has(s.source.userData.rammerPart)).map(s=>{
  const start=s.start*3,end=(s.start+s.count)*3,source=s.source,g=source.geometry;
  const basePosition=position.array.slice(start,end),baseNormal=normal.array.slice(start,end),weights=new Float32Array(s.count*6);
  for(let i=0;i<s.count;i++){
   const x=basePosition[i*3],z=basePosition[i*3+2],[dz,dy,dzZ,dyZ]=profile(z),k=i*6;
   weights.set([clamp((x+1.75)/3.5),Math.abs(x)<1.75?1/3.5:0,dz,dy,dzZ,dyZ],k);
  }
  const inverse=source.matrix.clone().invert(),normalToLocal=new T.Matrix3().getNormalMatrix(inverse);
  g.attributes.position.setUsage(T.DynamicDrawUsage);g.attributes.normal.setUsage(T.DynamicDrawUsage);
  return {...s,basePosition,baseNormal,weights,inverse,normalToLocal,originalPosition:g.attributes.position.array.slice(),originalNormal:g.attributes.normal.array.slice()};
 });
 position.setUsage(T.DynamicDrawUsage);normal.setUsage(T.DynamicDrawUsage);
 let left=0,right=0,hits=0,updates=0,lastUpdateMs=0,maxUpdateMs=0;
 const vertices=regions.reduce((n,r)=>n+r.count,0),cpuBytes=regions.reduce((n,r)=>n+r.basePosition.byteLength+r.baseNormal.byteLength+r.originalPosition.byteLength+r.originalNormal.byteLength+r.weights.byteLength,0);
 function update(reset=false){
  const started=performance.now();position.clearUpdateRanges();normal.clearUpdateRanges();
  for(const r of regions){
   const sourcePosition=r.source.geometry.attributes.position,sourceNormal=r.source.geometry.attributes.normal;
   if(reset){
    position.array.set(r.basePosition,r.start*3);normal.array.set(r.baseNormal,r.start*3);
    sourcePosition.array.set(r.originalPosition);sourceNormal.array.set(r.originalNormal);
   }
   else
   for(let i=0;i<r.count;i++){
    const k=i*3,j=(r.start+i)*3,w=i*6,u=r.weights[w],du=r.weights[w+1],amount=left*(1-u)+right*u;
    const dz=r.weights[w+2],dy=r.weights[w+3],dzZ=r.weights[w+4],dyZ=r.weights[w+5],amountX=(right-left)*du;
    const x=r.basePosition[k],y=r.basePosition[k+1]+dy*amount,z=r.basePosition[k+2]+dz*amount;
    position.array[j]=x;position.array[j+1]=y;position.array[j+2]=z;
    // Inverse transpose of F(x,y,z)=(x,y+dy*s,z+dz*s). The cage's
    // longitudinal derivative stays above .81, so its mapping cannot fold.
    const ny=r.baseNormal[k+1],nz=(r.baseNormal[k+2]-dyZ*amount*ny)/(1+dzZ*amount),nx=r.baseNormal[k]-dy*amountX*ny-dz*amountX*nz;
    const length=Math.hypot(nx,ny,nz)||1;
    normal.array[j]=nx/length;normal.array[j+1]=ny/length;normal.array[j+2]=nz/length;
     point.set(x,y,z).applyMatrix4(r.inverse);sourcePosition.array[k]=point.x;sourcePosition.array[k+1]=point.y;sourcePosition.array[k+2]=point.z;
     vector.set(normal.array[j],normal.array[j+1],normal.array[j+2]).applyMatrix3(r.normalToLocal).normalize();sourceNormal.array[k]=vector.x;sourceNormal.array[k+1]=vector.y;sourceNormal.array[k+2]=vector.z;
   }
   position.addUpdateRange(r.start*3,r.count*3);normal.addUpdateRange(r.start*3,r.count*3);
   sourcePosition.needsUpdate=sourceNormal.needsUpdate=true;r.source.geometry.computeBoundingBox();r.source.geometry.computeBoundingSphere();
  }
  position.needsUpdate=normal.needsUpdate=true;render.geometry.computeBoundingBox();render.geometry.computeBoundingSphere();
  updates++;lastUpdateMs=performance.now()-started;maxUpdateMs=Math.max(maxUpdateMs,lastUpdateMs);
 }
 const damage={
  impact(speed,x,z){
   if(![speed,x,z].every(Number.isFinite)||speed<5)return false;
   const length=Math.hypot(x,z);if(length<1e-6||-z/length<.25)return false;
   const amount=clamp((speed-5)/30,0,.65)*(-z/length),side=x/length;
   const nextLeft=clamp(left+amount*clamp(1-side)),nextRight=clamp(right+amount*clamp(1+side));
   if(nextLeft===left&&nextRight===right)return false;
   left=nextLeft;right=nextRight;hits++;update();return true;
  },
  reset(){if(left===0&&right===0)return false;left=right=hits=0;update(true);return true;},
  report(){return {scope:'Rammer nose and ram plate only',left,right,hits,updates,vertices,cpuBytes,visibleUploadBytes:vertices*24,lastUpdateMs,maxUpdateMs,maxDisplacement:.264,save:'Transient with NPC allies; cleared by existing restart/checkpoint-load reset.'};}
 };
 root.userData.rammerDamage=damage;return damage;
}
