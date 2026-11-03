import * as T from 'three/webgpu';
import {DENT_KEYS,panelWear} from './vehicle-impact.js';
import {deformVehiclePoint} from './vehicle-demolition.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const SPECS=[
 {name:'bonnet',pivot:[0,1.12,-.70],axis:[1,0,0],sign:1},
 {name:'engine cover',pivot:[0,1.10,1.08],axis:[1,0,0],sign:-1},
 {name:'left side plate',pivot:[-.88,1.11,.1],axis:[0,0,1],sign:-1},
 {name:'right side plate',pivot:[.88,1.11,.1],axis:[0,0,1],sign:1}
];
// One opaque batch for four animated surfaces. Only 144 vertices are posed;
// chassis, wheel, cabin and camera transforms remain fully authoritative.
export function installVehiclePanels(root,sources){
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),entries=[],positions=[],colors=[];
 for(let id=0;id<sources.length;id++){
  const source=sources[id],matrix=new T.Matrix4().multiplyMatrices(inverse,source.matrixWorld);
  const g=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone();g.applyMatrix4(matrix);
  const rest=new Float32Array(g.attributes.position.array),start=positions.length/3;
  positions.push(...rest);for(let i=0;i<rest.length/3;i++)colors.push(source.material.color.r,source.material.color.g,source.material.color.b);
  source.visible=false;source.userData.rigidSource=true;source.userData.cosmeticWreckSnapshot=true;
  // Each hidden breakup source owns the same vertex topology as its live panel.
  source.geometry.dispose();source.geometry=g.clone();source.position.set(0,0,0);source.quaternion.identity();source.scale.set(1,1,1);source.updateMatrix();
  entries.push({...SPECS[id],id,source,rest,start,count:rest.length/3,axisV:new T.Vector3(...SPECS[id].axis),angle:0,velocity:0});g.dispose();
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 const material=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.56,metalness:.30});
 const mesh=new T.Mesh(geometry,material);mesh.name='Articulated vehicle body panels';mesh.userData.rigidComposite=true;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
 const baseColor=new Float32Array(colors),state=new Float64Array(7),last=new Float64Array(7).fill(-1),q=new T.Quaternion(),point=new T.Vector3(),anchor=new T.Vector3(),worldAxis=new T.Vector3(),omega=new T.Vector3(),poseQ=new T.Quaternion(),rotX=new T.Quaternion(),up=new T.Vector3(0,1,0),xAxis=new T.Vector3(1,0,0);
 let initialized=false,seenMask=0,clock=0,updates=0,releases=0;
 function writePanel(entry,body){
  deformVehiclePoint(anchor,...entry.pivot,state);q.setFromAxisAngle(entry.axisV,entry.angle*entry.sign);
  const a=geometry.attributes.position,c=geometry.attributes.color;
  for(let i=0;i<entry.count;i++){
   const j=i*3,k=entry.start+i;deformVehiclePoint(point,entry.rest[j],entry.rest[j+1],entry.rest[j+2],state);
   point.sub(anchor).applyQuaternion(q).add(anchor);a.setXYZ(k,point.x,point.y,point.z);
   const stain=clamp(state[6]*(.4+.4*Math.sin(entry.rest[j]*13+entry.rest[j+2]*9)**2),0,.85),wear=panelWear(body,entry.id)*.12;
   c.setXYZ(k,baseColor[k*3]*(1-wear),baseColor[k*3+1]*(1-wear-stain*.88),baseColor[k*3+2]*(1-wear-stain*.84));
  }
 }
 function snapshot(entry){
  const g=new T.BufferGeometry();for(const name of ['position','normal','color'])g.setAttribute(name,new T.Float32BufferAttribute(geometry.attributes[name].array.slice(entry.start*3,(entry.start+entry.count)*3),3));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
 }
 const api={mesh,sources,excluded:[mesh,...sources],
  sync(body,dt=0,effects=null,impact=false){
   const mask=body.panelMask||0,step=Number.isFinite(dt)?clamp(dt,0,.1):0;
   const torn=initialized&&(step>0||impact)&&typeof effects?.shedPanel==='function'?(mask&~seenMask):0;
   for(let i=0;i<6;i++)state[i]=clamp(body[DENT_KEYS[i]]||0,0,1);state[6]=clamp(body.bloodCoat||0,0,1);
   const changed=!initialized||mask!==seenMask||state.some((v,i)=>Math.abs(v-last[i])>.004);
   clock+=step;let animated=false;
   for(const entry of entries){
    const wear=panelWear(body,entry.id),loose=clamp((wear-.23)/.55,0,1);
    if(!loose){entry.angle=entry.velocity=0;continue;}
    if(mask&(1<<entry.id)){if(!(torn&(1<<entry.id)))entry.angle=entry.velocity=0;continue;}
    if(step>0){
     // Fixed small substeps, bounded airflow and inertial excitation. This is
     // an isolated hinge, never a chassis force or an extra camera spring.
     const count=Math.max(1,Math.ceil(step*240)),h=step/count;
     for(let i=0;i<count;i++){
      const speed=clamp(Math.abs(body.speed||0),0,90),a=entry.id<2?clamp(body.longitudinalAcceleration||0,-30,30)*.0015:clamp(body.lateralAcceleration||0,-25,25)*.002*entry.sign;
      const chatter=(Math.sin((clock-step+i*h)*21+entry.id*2.4)+.4*Math.sin((clock-step+i*h)*37))*loose*clamp(speed/60,0,1)*.055;
      const target=loose*(.04+speed*.0021)+a*loose+chatter;
      entry.velocity+=((target-entry.angle)*85-entry.velocity*11)*h;
      entry.angle=clamp(entry.angle+entry.velocity*h,-.035,.48);entry.velocity=clamp(entry.velocity,-2.5,2.5);
     }
     animated=true;
    }
   }
   if(!changed&&!animated)return false;
   for(const entry of entries)writePanel(entry,body);
   geometry.computeVertexNormals();
   if(torn){
    root.updateWorldMatrix(true,false);
    poseQ.setFromAxisAngle(up,body.yaw||0);omega.set(0,body.yawRate||0,0);
    omega.add(worldAxis.copy(xAxis).applyQuaternion(poseQ).multiplyScalar(clamp(body.drivePitchV||0,-5,5)));
    rotX.setFromAxisAngle(xAxis,body.pitch||0);poseQ.multiply(rotX);
    omega.add(worldAxis.set(0,0,1).applyQuaternion(poseQ).multiplyScalar(clamp(body.driveRollV||0,-5,5)));
    for(const entry of entries)if(torn&(1<<entry.id)){
     const g=snapshot(entry);effects.shedPanel(g,material,root.matrixWorld,body,omega,entry.name);g.dispose();releases++;
    }
   }
   for(const entry of entries){
    entry.source.userData.panelDetached=!!(mask&(1<<entry.id));
    if(entry.source.userData.panelDetached)for(let i=0;i<entry.count;i++)geometry.attributes.position.setXYZ(entry.start+i,0,0,0);
   }
   geometry.attributes.position.needsUpdate=geometry.attributes.normal.needsUpdate=geometry.attributes.color.needsUpdate=true;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();last.set(state);seenMask=mask;initialized=true;updates++;return true;
  },
  prepareWreck(){for(const e of entries)if(!e.source.userData.panelDetached){const g=e.source.geometry;for(const key of ['position','normal']){g.attributes[key].array.set(geometry.attributes[key].array.subarray(e.start*3,(e.start+e.count)*3));g.attributes[key].needsUpdate=true;}g.computeBoundingBox();g.computeBoundingSphere();}},
  report(){return {mask:seenMask,releases,updates,vertices:geometry.attributes.position.count,draws:1,angles:entries.map(e=>e.angle),scope:'Bounded cosmetic hinges and physical detached debris; no chassis-force or handling changes'};}
 };
 root.userData.vehiclePanels=api;return api;
}
