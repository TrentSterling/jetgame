import * as T from 'three/webgpu';
import {buggy} from './art.js';

// A deliberately small rig: five opaque draws per ally and one short-lived
// muzzle flash. Flat, painted geometry keeps these living people distinct from
// the ragged green crowd without textures, skeletons, or animation allocations.
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
function group(parent,name,x=0,y=0,z=0){const g=new T.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;}

function humanFace(part,{skin,shade,hair},y=0,helmet=false){
 // Warm cheeks, intact jaw, ears, nose, closed mouth and small bright eyes.
 part.ball([.145,.19,.13],[0,y+.065,.005],skin);
 part.box([.20,.11,.11],[0,y-.035,-.065],skin);
 part.box([.052,.065,.055],[0,y+.045,-.135],skin);
 for(const s of [-1,1]){
  part.box([.031,.068,.042],[s*.147,y+.046,0],shade);
  part.box([.057,.024,.014],[s*.058,y+.097,-.117],'#e6ddc9');
  part.box([.020,.023,.017],[s*.052,y+.097,-.125],'#292925');
  part.box([.065,.018,.017],[s*.058,y+.122,-.115],hair,[0,0,s*.04]);
 }
 part.box([.077,.013,.012],[0,y-.003,-.126],shade);
 if(!helmet){
  part.ball([.151,.09,.136],[0,y+.19,.018],hair);
  part.box([.028,.09,.075],[-.136,y+.113,.016],hair);
  part.box([.028,.07,.075],[.136,y+.123,.016],hair);
 }
}

export function createFootBot(index=0){
 const variant=Math.abs(Math.trunc(safe(index)))%2,root=new T.Group(),material=paintedMaterial();
 root.name=variant?'Ally · bluecoat rifleman':'Ally · field-jacket riflewoman';
 const palette=variant?{jacket:'#536a70',shade:'#3a484e',trousers:'#5c5145',skin:'#a66e4c',skinShade:'#734b37',hair:'#292c29',band:'#d6b067'}:{jacket:'#787b59',shade:'#4d5847',trousers:'#3c4948',skin:'#c49a76',skinShade:'#8d6551',hair:'#4a372b',band:'#c97944'};
 const upper=group(root,'Breathing torso',0,1.29,0),head=group(upper,'Living human face',0,.34,-.008),arms=group(upper,'Aimed rifle and hands',0,.055,-.035),legs=[];
 const torso=new PaintedPart();
 torso.box([.36,.20,.26],[0,-.40,.025],palette.trousers);
 torso.box([.39,.38,.28],[0,-.14,.025],palette.jacket);
 torso.box([.51,.17,.29],[0,.095,.025],palette.jacket);
 torso.box([.34,.045,.29],[0,-.30,.015],'#353c34');
 torso.box([.065,.048,.018],[0,-.30,-.14],'#b0a78b');
 torso.box([.035,.39,.017],[0,-.09,-.123],palette.shade);
 for(const s of [-1,1]){
  torso.box([.11,.12,.03],[s*.13,.015,-.135],palette.shade);
  torso.box([.12,.027,.04],[s*.13,.069,-.151],palette.jacket);
  torso.box([.062,.16,.045],[s*.153,-.25,-.15],'#625b43');
 }
 torso.box([.21,.085,.23],[0,.20,-.004],palette.band,[.08,0,0]);
 torso.box([.08,.19,.04],[-.084,.09,-.163],palette.band,[0,0,-.12]);
 // Patch repairs, shoulder strap and a compact worn pack remain real geometry.
 torso.box([.047,.42,.025],[.145,-.055,-.145],'#aa9c75',[0,0,.14]);
 torso.box([.24,.29,.13],[0,-.055,.207],palette.shade);
 torso.box([.07,.07,.013],[-.123,-.21,-.13],'#9d9472',[0,0,.08]);
 torso.mesh(upper,material,'Patched field clothing');
 const face=new PaintedPart();humanFace(face,{skin:palette.skin,shade:palette.skinShade,hair:palette.hair});
 face.rod([0,-.16,.02],[0,-.075,.005],.071,palette.skin);
 if(!variant){ // Narrow tied-back hair, leaving the entire face exposed.
  face.ball([.07,.10,.07],[0,.15,.145],palette.hair);
  face.box([.09,.025,.04],[0,.15,.18],palette.band);
 }else{
  face.box([.26,.055,.24],[0,.204,.005],palette.shade);
  face.box([.28,.022,.13],[0,.179,-.12],palette.shade);
 }
 face.mesh(head,material,'Warm face, eyes and hair');
 const held=new PaintedPart();
 for(const s of [-1,1]){
  const elbow=[s*.32,-.18,-.12],hand=s<0?[.055,-.10,-.61]:[.10,-.12,-.29];
  held.rod([s*.245,.005,.035],elbow,.09,palette.jacket,.104);
  held.rod(elbow,hand,.062,palette.jacket,.075);
  held.ball([.052,.055,.07],hand,palette.skin);
  held.rod([s*.245,-.015,.03],[s*.28,-.085,-.025],.107,palette.band,.106);
 }
 const steel='#47534e',dark='#252c2b',edge='#93917c',wood=variant?'#655744':'#8a6444';
 held.box([.12,.13,.33],[.10,-.015,-.40],steel);
 held.box([.10,.11,.23],[.10,-.01,-.10],wood);
 held.box([.12,.15,.035],[.10,-.03,.025],dark);
 held.box([.115,.075,.27],[.10,-.015,-.65],wood);
 held.rod([.10,.005,-.70],[.10,.005,-1.0],.022,steel);
 held.rod([.10,.005,-.96],[.10,.005,-1.035],.031,dark);
 held.box([.057,.15,.10],[.10,-.15,-.40],dark,[-.20,0,0]);
 held.box([.055,.11,.07],[.10,-.115,-.26],wood,[.18,0,0]);
 held.box([.045,.025,.40],[.10,.061,-.45],dark);
 held.box([.020,.055,.025],[.10,.055,-.88],edge);
 held.box([.023,.035,.042],[.10,.09,-.30],edge);
 held.box([.007,.035,.055],[.163,.005,-.41],edge);
 held.mesh(arms,material,'Sleeves, gripping hands and carbine');
 for(const s of [-1,1]){
  const leg=group(root,s<0?'Left stride':'Right stride',s*.12,.83,.02),shape=new PaintedPart();legs.push(leg);
  shape.rod([0,.02,0],[s*.015,-.37,-.025],.095,palette.trousers,.112);
  shape.rod([s*.015,-.37,-.025],[s*.018,-.68,.005],.066,palette.trousers,.080);
  shape.box([.15,.12,.055],[s*.015,-.39,-.078],palette.shade);
  shape.box([.17,.14,.29],[s*.018,-.76,-.058],'#2b3230');
  shape.box([.18,.032,.30],[s*.018,-.814,-.061],'#202725');
  shape.mesh(leg,material,'Trousers, knee patch and boot');
 }
 const muzzle=group(arms,'Carbine muzzle',.10,.005,-1.04);
 const flash=new T.Mesh(new T.IcosahedronGeometry(.10,0),new T.MeshBasicMaterial({color:'#ffdfa0',toneMapped:false}));
 flash.name='Brief carbine muzzle flash';flash.position.z=-.10;flash.scale.set(.65,.65,2.1);flash.visible=false;muzzle.add(flash);
 Object.assign(root.userData,{muzzle,flash,upper,head,arms,legs,variant,botMotion:{phase:0,recoil:0},artContract:'Root -Z forward; positive aimPitch points muzzle up; muzzle local -Z is shot direction.'});
 poseFootBot(root,IDLE_POSE);return root;
}

export function poseFootBot(root,{walking=false,dt=0,aimPitch=0,firing=false}=IDLE_POSE){
 const u=root.userData,m=u.botMotion,step=clamp(safe(dt),0,.1),walk=typeof walking==='boolean'?(walking?1:0):clamp(safe(walking),0,1);
 m.phase=(m.phase+step*(7+walk*3)*walk)%TAU;
 m.recoil=firing?.045:m.recoil*Math.exp(-step*24);
 const stride=Math.sin(m.phase)*.42*walk,bob=Math.abs(Math.sin(m.phase))*.022*walk,pitch=clamp(safe(aimPitch),-.80,.90);
 u.legs[0].rotation.x=stride;u.legs[1].rotation.x=-stride;
 u.upper.position.y=1.29+bob;u.upper.rotation.z=Math.sin(m.phase)*.025*walk;
 u.head.rotation.x=pitch*.38;u.arms.rotation.x=pitch;
 u.arms.position.z=-.035+m.recoil;u.flash.visible=!!firing;
 return root;
}

// Repaint and merge a rigid assembly, retaining original hidden pieces for the
// existing vehicle disposal/breakup conventions. The original shared palette is
// never mutated or disposed. Every new material is owned by this model alone.
function batchPainted(root,material,exclude=new Set()){
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),matrix=new T.Matrix4(),part=new PaintedPart(),sources=[];
 const visit=o=>{
  if(exclude.has(o)||!o.visible)return;
  if(o!==root&&o.isMesh&&!Array.isArray(o.material)&&o.material.isMeshStandardMaterial){
   matrix.multiplyMatrices(inverse,o.matrixWorld);part.geometry(o.geometry,matrix,o.material.color);sources.push(o);
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
 const mesh=buggy({batch:false}),u=mesh.userData,material=paintedMaterial(),extra=new PaintedPart();
 mesh.name=`Wasteland ${kind}`;
 const steel='#515d55',dark='#303a36',rust='#945f3d',bone='#baae86',paint=kind==='rammer'?'#9a6648':kind==='circler'?'#53817c':'#7f8764';
 // Repaint only instance-owned geometry by baking its colors below. Avoid
 // changing art.js's shared material objects used by the player's vehicles.
 if(kind==='rammer'){
  extra.box([3.18,1.14,.18],[0,.83,-2.58],steel,[.54,0,0]);
  extra.box([3.26,.16,.23],[0,.34,-2.91],rust,[.54,0,0]);
  for(const x of [-1.35,-.68,0,.68,1.35])extra.box([.09,1.0,.20],[x,.82,-2.60],bone,[.54,0,0]);
  extra.box([1.79,.11,1.40],[0,1.29,-1.19],paint,[.12,0,0]);
  extra.box([1.88,.15,1.45],[0,2.36,.24],steel);
  for(const s of [-1,1]){
   extra.box([.16,.55,1.48],[s*.94,1.26,.27],paint,[0,0,s*.08]);
   extra.rod([s*.90,.80,-1.20],[s*1.25,.64,-2.54],.105,dark);
   extra.box([.035,.08,1.10],[s*1.03,1.32,.18],bone);
  }
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
 for(const s of [-1,1])for(let i=0;i<3;i++)extra.box([.06,.022,.16],[s*(.44+i*.10),1.354-i*.018,-1.46+i*.12],bone,[.12,s*.20,0]);
 extra.mesh(mesh,material,'Role-specific armor and salvage');
 u.driver.visible=true;
 const face=new PaintedPart();humanFace(face,{skin:kind==='escort'?'#a56f51':'#bf9470',shade:'#805a43',hair:'#3c332b'},0,true);
 // The old helmet remains the helmet, but the opaque visor is hidden. This
 // forward face insert gives every moving vehicle a plainly living driver.
 for(const child of u.head.children)if(child.geometry?.type==='BoxGeometry')child.visible=false;
 const faceGroup=group(u.head,'Exposed driver face',0,-.065,-.134);face.mesh(faceGroup,material,'Driver cheeks, nose and eyes');
 u.steering=mesh.children.find(o=>o.geometry?.type==='TorusGeometry');
 for(const flame of u.boost)flame.visible=false;
 batchPainted(u.head,material);batchPainted(u.driver,material,new Set([u.head]));
 for(const wheel of u.wheels)batchPainted(wheel,material);
 const exclude=new Set([u.driver,u.steering,...u.wheelPivots,...u.boost]);
 for(const leg of u.suspension)for(const key of ['arm','shock','spring'])exclude.add(leg[key]);
 batchPainted(mesh,material,exclude);
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
 u.driver.visible=true;u.driver.rotation.z=-safe(body.roll)*.6;u.head.rotation.y=steer*.23;
 if(u.steering)u.steering.rotation.z=-steer*.65;
 u.botMotion.wheelSpin=(u.botMotion.wheelSpin-safe(body.speed)*step/.66)%TAU;
 for(const wheel of u.wheels)wheel.rotation.y=u.botMotion.wheelSpin;
 for(const pivot of u.wheelPivots)pivot.rotation.y=pivot.position.z<0?-steer*.42:0;
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
