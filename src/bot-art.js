import * as T from 'three/webgpu';
import {buggy,poseVehicleOccupant} from './art.js';
import {createSurvivorRig,poseSurvivorRig} from './survivor-rig.js';
import {buildRammerCoachwork} from './rammer-art.js';
import {attachRammerDamage} from './rammer-damage.js';
import {drivingSteeringAngle} from './driving.js';

// The allied infantry share the one-skin survivor rig; rigid vehicle details
// continue to batch independently and never capture deforming crew geometry.
const IDLE_POSE=Object.freeze({walking:false,dt:0,aimPitch:0,firing:false});
const clamp=T.MathUtils.clamp,TAU=Math.PI*2;
const safe=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const up=new T.Vector3(0,1,0),hub=new T.Vector3(),foot=new T.Vector3(),direction=new T.Vector3();
const flatGround=()=>0;

class PaintedPart{
 constructor(){this.positions=[];this.normals=[];this.colors=[];this.matrix=new T.Matrix4();this.normalMatrix=new T.Matrix3();this.point=new T.Vector3();this.normal=new T.Vector3();this.color=new T.Color();}
 geometry(geometry,matrix,color='#ffffff'){
  const p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color,index=geometry.index;
  this.color.set(color);this.normalMatrix.getNormalMatrix(matrix);
  for(let i=0,count=index?index.count:p.count;i<count;i++){
   const j=index?index.getX(i):i;
   this.point.fromBufferAttribute(p,j).applyMatrix4(matrix);this.normal.fromBufferAttribute(n,j).applyMatrix3(this.normalMatrix).normalize();
   this.positions.push(this.point.x,this.point.y,this.point.z);this.normals.push(this.normal.x,this.normal.y,this.normal.z);
   this.colors.push(this.color.r*(c?c.getX(j):1),this.color.g*(c?c.getY(j):1),this.color.b*(c?c.getZ(j):1));
  }
  return this;
 }
 add(geometry,position,color,rotation=[0,0,0],scale=[1,1,1]){
  this.matrix.compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));
  this.geometry(geometry,this.matrix,color);geometry.dispose();return this;
 }
 box(size,position,color,rotation){return this.add(new T.BoxGeometry(...size),position,color,rotation);}
 ball(size,position,color){return this.add(new T.SphereGeometry(1,8,6),position,color,undefined,size);}
 rod(a,b,r,color,r2=r){
  const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from),geometry=new T.CylinderGeometry(r2,r,delta.length(),6);
  this.matrix.compose(from.add(to).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(up,delta.normalize()),new T.Vector3(1,1,1));
  this.geometry(geometry,this.matrix,color);geometry.dispose();return this;
 }
 mesh(parent,material,name){
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(this.positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(this.normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(this.colors,3));
  geometry.computeBoundingSphere();geometry.computeBoundingBox();
  const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
}
const paintedMaterial=()=>new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.87,metalness:.12});

// Mission people, allied riflemen and vehicle occupants now share the same
// connected skin and joint hierarchy. Weapons retain the established anchors.
export function createFootBot(index=0){return createSurvivorRig({variant:index,role:'rifle'});}
export function poseFootBot(root,options=IDLE_POSE){
 return poseSurvivorRig(root,options);
}

// Repaint and merge a rigid assembly, retaining original hidden pieces for the
// existing vehicle disposal/breakup conventions. The original shared palette is
// never mutated or disposed. Every new material is owned by this model alone.
function batchPainted(root,material,exclude=new Set(),spans=null){
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),matrix=new T.Matrix4(),part=new PaintedPart(),sources=[];
 const visit=o=>{
  if(exclude.has(o)||!o.visible)return;
  if(o!==root&&o.isMesh&&!Array.isArray(o.material)&&o.material.isMeshStandardMaterial){
   const start=part.positions.length/3;
   matrix.multiplyMatrices(inverse,o.matrixWorld);part.geometry(o.geometry,matrix,o.material.color);sources.push(o);
   if(spans)spans.push({source:o,start,count:part.positions.length/3-start});
  }
  for(const child of o.children)visit(child);
 };visit(root);
 if(!sources.length)return;
 const merged=part.mesh(root,material,'Batched painted wreck-road detail');merged.userData.rigidComposite=true;
 for(const source of sources){source.visible=false;source.userData.rigidSource=true;source.updateMatrix();source.matrixAutoUpdate=false;}
 return merged;
}

export function createBotVehicle(kind='rammer'){
 if(!['rammer','circler','escort'].includes(kind))throw new RangeError(`Unknown bot vehicle kind: ${kind}`);
 const mesh=buggy({batch:false,occupantVariant:kind==='rammer'?0:kind==='circler'?1:2,crew:true,articulatedPanels:false}),u=mesh.userData,material=paintedMaterial(),extra=new PaintedPart();
 mesh.name=`Wasteland ${kind}`;
 const steel='#515d55',dark='#303a36',rust='#945f3d',bone='#baae86',paint=kind==='rammer'?'#9a6648':kind==='circler'?'#53817c':'#7f8764';
 // Repaint only instance-owned geometry by baking its colors below. Avoid
 // changing art.js's shared material objects used by the player's vehicles.
 if(kind==='rammer'){
  buildRammerCoachwork(mesh,material,PaintedPart);
 }else if(kind==='circler'){
  // Remove the thin stock roof to make the scout unmistakably open-topped.
  for(const child of mesh.children)if(child.isMesh&&Math.abs(child.position.y-2.26)<.001)child.visible=false;
  extra.box([1.63,.10,.91],[0,1.27,-1.34],paint,[.12,0,0]);
  for(const s of [-1,1]){
   extra.rod([s*.84,1.10,.92],[s*.91,2.47,.83],.065,paint);
   extra.rod([s*.91,2.47,.83],[0,2.60,.83],.065,steel);
   extra.rod([s*.90,1.03,1.45],[s*.93,1.63,1.42],.16,rust);
   extra.box([.16,.07,1.46],[s*.88,1.40,.12],paint);
  }
  for(const x of [-.80,-.40,0,.40,.80])extra.rod([x,2.48,.83],[x,2.90-Math.abs(x)*.19,.83],.07,bone,0);
  extra.rod([.78,1.28,1.45],[.80,3.06,1.42],.014,dark);
  extra.box([.20,.12,.018],[.70,2.91,1.42],paint,[0,0,-.10]);
  extra.add(new T.TorusGeometry(.40,.13,6,12),[0,1.49,1.88],dark,[.10,0,0]);
  extra.rod([-.43,1.52,1.94],[.43,1.52,1.94],.035,bone);
 }else{
  extra.box([1.80,1.02,1.58],[0,1.66,1.55],paint);
  extra.box([1.88,.12,1.70],[0,2.23,1.55],bone);
  for(const s of [-1,1]){
   extra.box([.42,.63,1.82],[s*1.02,1.19,1.13],steel);
   extra.box([.45,.09,1.88],[s*1.02,1.55,1.13],bone);
   extra.rod([s*.90,1.13,2.36],[s*.90,2.40,2.36],.067,dark);
   extra.box([.07,1.07,1.64],[s*.54,1.69,1.55],dark);
   extra.rod([s*1.23,.80,-1.87],[s*1.23,1.40,-1.87],.07,steel);
  }
  extra.rod([-1.23,1.40,-1.87],[1.23,1.40,-1.87],.07,steel);
  extra.rod([-.90,2.40,2.36],[.90,2.40,2.36],.067,dark);
  extra.rod([-.70,2.45,1.52],[.70,2.45,1.52],.22,bone);
  extra.box([.085,.43,.45],[-.41,2.44,1.52],dark);
  extra.box([.085,.43,.45],[.41,2.44,1.52],dark);
  extra.box([1.96,.18,.25],[0,.79,2.49],steel);
 }
 // Uneven exposed-metal chips are solid geometry, all in the chassis batch.
 if(kind!=='rammer'){
  for(const s of [-1,1])for(let i=0;i<3;i++)extra.box([.06,.022,.16],[s*(.44+i*.10),1.354-i*.018,-1.46+i*.12],bone,[.12,s*.20,0]);
  extra.mesh(mesh,material,'Role-specific armor and salvage');
 }
 u.driver.visible=true;
 for(const flame of u.boost)flame.visible=false;
 for(const wheel of u.wheels)batchPainted(wheel,material);
 const exclude=new Set([u.driver,u.playerDriver,u.steering,...u.wheelPivots,...u.boost]);
 for(const leg of u.suspension)for(const key of ['arm','shock','spring'])exclude.add(leg[key]);
 const damageSpans=kind==='rammer'?[]:null,render=batchPainted(mesh,material,exclude,damageSpans);
 if(damageSpans)attachRammerDamage(mesh,render,damageSpans);
 Object.assign(u,{botKind:kind,botMotion:{wheelSpin:0},artContract:'Local -Z forward. poseBotVehicle owns body transform, driver, steering and wheel suspension.'});
 poseBotVehicle(mesh,{pos:new T.Vector3(),yaw:0,pitch:0,roll:0,speed:0,steer:0,suspension:0,grounded:true},0,flatGround);
 return mesh;
}

function poseLink(mesh,a,b){
 direction.copy(b).sub(a);const length=direction.length();
 mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,direction.multiplyScalar(length>0?1/length:0));mesh.scale.y=length;
}

export function poseBotVehicle(mesh,body,dt=0,ground=flatGround){
 const u=mesh.userData,step=clamp(safe(dt),0,.1),steer=clamp(safe(body.steer),-1,1);
 mesh.position.copy(body.pos);mesh.position.y+=safe(body.suspension);mesh.rotation.order='YXZ';mesh.rotation.set(safe(body.pitch),safe(body.yaw),safe(body.roll));
 poseVehicleOccupant(mesh,body,{dt:step});
 if(u.steering)u.steering.rotation.z=-steer*.65;
 u.botMotion.wheelSpin=(u.botMotion.wheelSpin-safe(body.speed)*step/.66)%TAU;
 for(const wheel of u.wheels)wheel.rotation.y=u.botMotion.wheelSpin;
 const wheelAngle=-drivingSteeringAngle(body);
 for(const pivot of u.wheelPivots)pivot.rotation.y=pivot.position.z<0?wheelAngle:0;
 mesh.updateMatrixWorld(true);
 for(const leg of u.suspension){
  const pivot=leg.pivot;hub.set(pivot.position.x,.66,pivot.position.z).applyMatrix4(mesh.matrixWorld);
  foot.set(hub.x,safe(ground(hub.x,hub.z))+.66,hub.z);mesh.worldToLocal(foot);
  const wheelY=body.grounded===false?.25:clamp(foot.y,.28,1.08);pivot.position.y=wheelY;
  foot.set(pivot.position.x,wheelY,pivot.position.z);poseLink(leg.arm,leg.armRoot,foot);poseLink(leg.shock,leg.shockRoot,foot);
  leg.spring.position.copy(leg.shock.position);leg.spring.quaternion.copy(leg.shock.quaternion);leg.spring.scale.y=leg.shock.scale.y;
  leg.compression=clamp(1-(wheelY-.28)/.8,0,1);
 }
 return mesh;
}
