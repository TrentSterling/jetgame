import * as T from 'three/webgpu';
// Arcade motion remains authoritative. Damage lives in bounded, optional scalar
// body fields so the existing checkpoint/Fleet copy paths preserve each car.
import {DENT_KEYS} from './vehicle-impact.js';
export {carImpactDamage,dentVehicle,resetVehicleDamage,repairVehicleDamage} from './vehicle-impact.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
// Small, smooth, non-authoritative deformation field. The protected cockpit,
// wheels, crew and suspension anchors never move. No center-of-mass feedback.
function deform(out,x,y,z,state){
 const lateral=clamp((x+1.25)/2.5),front=state[0]*(1-lateral)+state[1]*lateral,rear=state[2]*(1-lateral)+state[3]*lateral;
 const f=smooth(.65,2.7,-z),r=smooth(.78,2.25,z),side=smooth(.65,1.15,Math.abs(x))*(1-smooth(1.3,1.9,Math.abs(z)));
 const protect=1-smooth(1.6,2.2,y),dside=x<0?state[4]:state[5];
 out.set(x-Math.sign(x)*side*dside*.16*protect,
  y+protect*(f*front*(.09+.085*Math.sin(z*8+x*3))+r*rear*.09+side*dside*.045*Math.sin(z*7)),
  z+protect*(f*front*.48-r*rear*.32));return out;
}
// Cache root-local rest positions once. Edits touch buffers only when the
// damage state changes, rather than streaming every chassis vertex each frame.
export function attachVehicleDamage(root){
 if(root.userData.vehicleDamage)return root.userData.vehicleDamage;
 root.updateWorldMatrix(true,true);
 const excluded=new Set([root.userData.driver,root.userData.playerDriver,root.userData.steering,...(root.userData.wheelPivots||[]),...(root.userData.boost||[])]);
 for(const leg of root.userData.suspension||[])for(const key of ['arm','shock','spring'])excluded.add(leg[key]);
 const inverse=root.matrixWorld.clone().invert(),visible=[],originals=[],materials=new Map(),p=new T.Vector3(),nx=new T.Vector3(),ny=new T.Vector3(),nz=new T.Vector3(),normal=new T.Vector3(),result=new T.Vector3(),cofactor=new T.Vector3(),originalNormal=new T.Vector3();
 const visit=o=>{if(excluded.has(o))return;if(o.isMesh&&!o.isSkinnedMesh&&o.geometry?.attributes.position&&(o.visible||o.userData.rigidSource)){
  // Capture the independent breakup originals as well as their visible batch.
  const matrix=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld),inv=matrix.clone().invert(),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),normalBack=new T.Matrix3().getNormalMatrix(inv);
  const g=o.geometry,pos=g.attributes.position,norm=g.attributes.normal;if(norm){
   const rest=new Float32Array(pos.count*3),restN=new Float32Array(rest.length),base=pos.array.slice(),baseN=norm.array.slice();
   for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(matrix).toArray(rest,i*3);normal.fromBufferAttribute(norm,i).applyMatrix3(normalMatrix).normalize().toArray(restN,i*3);}
   const entry={mesh:o,rest,restN,base,baseN,inv,normalBack};
   if(o.visible){
    // Per-vehicle materials avoid staining every car through a shared palette.
    const old=o.material;if(!materials.has(old)){const m=old.clone();m.vertexColors=true;materials.set(old,m);}o.material=materials.get(old);
    entry.baseColor=g.attributes.color?.array.slice()||new Float32Array(rest.length).fill(1);g.setAttribute('color',new T.BufferAttribute(entry.baseColor.slice(),3));visible.push(entry);
   }else{originals.push(entry);o.userData.cosmeticWreckSnapshot=true;}
  }
 }for(const child of o.children)visit(child);};for(const child of root.children)visit(child);
 const state=new Float64Array(7),last=new Float64Array(7).fill(-1);let updates=0,maxUpdateMs=0,vertices=0;
 function apply(entry,reset=false){
  const g=entry.mesh.geometry,a=g.attributes.position,n=g.attributes.normal,color=g.attributes.color,e=.002,damage=Math.max(...state.subarray(0,6));
  if(reset){a.array.set(entry.base);n.array.set(entry.baseN);if(entry.baseColor)color.array.set(entry.baseColor);}
  else for(let i=0;i<a.count;i++){
   const j=i*3,x=entry.rest[j],y=entry.rest[j+1],z=entry.rest[j+2];
   deform(p,x,y,z,state);deform(nx,x+e,y,z,state).sub(p).multiplyScalar(1/e);deform(ny,x,y+e,z,state).sub(p).multiplyScalar(1/e);deform(nz,x,y,z+e,state).sub(p).multiplyScalar(1/e);
   originalNormal.fromArray(entry.restN,j);normal.copy(cofactor.crossVectors(ny,nz)).multiplyScalar(originalNormal.x).addScaledVector(cofactor.crossVectors(nz,nx),originalNormal.y).addScaledVector(cofactor.crossVectors(nx,ny),originalNormal.z).applyMatrix3(entry.normalBack).normalize();
   result.copy(p).applyMatrix4(entry.inv);a.setXYZ(i,result.x,result.y,result.z);n.setXYZ(i,normal.x,normal.y,normal.z);
   if(entry.baseColor){
    const exposed=(1-smooth(1.5,2.15,y))*Math.max(smooth(.65,2,-z),smooth(.75,1.05,Math.abs(x))*.75);
    const mottling=.35+.65*smooth(-.6,.6,Math.sin(x*17+z*12)*Math.sin(y*19-z*6));
    const blood=clamp(state[6]*exposed*mottling*.9),wear=damage*exposed*.12;
    color.setXYZ(i,entry.baseColor[j]*(1-wear-blood*.1),entry.baseColor[j+1]*(1-wear-blood*.88),entry.baseColor[j+2]*(1-wear-blood*.84));
   }
  }
  a.needsUpdate=n.needsUpdate=true;if(entry.baseColor)color.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
 }
 const api={
  sync(body){for(let i=0;i<6;i++)state[i]=clamp(body[DENT_KEYS[i]]||0);state[6]=clamp(body.bloodCoat||0);
   if(state.every((v,i)=>Math.abs(v-last[i])<.005))return false;
   const t=performance.now(),reset=state.every(v=>v===0);for(const entry of visible)apply(entry,reset);last.set(state);updates++;maxUpdateMs=Math.max(maxUpdateMs,performance.now()-t);return true;
  },
  prepareWreck(body){api.sync(body);for(const entry of originals)apply(entry,state.every(v=>v===0));},
  report(){return {zones:Array.from(state.subarray(0,6)),blood:state[6],updates,vertices,maxUpdateMs,scope:'Bounded cosmetic deformation; arcade body/collision and cockpit anchors unchanged'};}
 };
 vertices=visible.reduce((n,e)=>n+e.mesh.geometry.attributes.position.count,0);root.userData.vehicleDamage=api;return api;
}
