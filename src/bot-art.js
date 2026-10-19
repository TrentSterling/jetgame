import * as T from 'three/webgpu';
import {buggy} from './art.js';
import {characterFace,characterLoft,faceFront} from './character-shapes.js';

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
 // Connected cheek, nose, mouth and jaw surface adapted from the user's miner.
 part.add(characterFace(),[0,y+.055,0],skin,undefined,[.92,1.18,.95]);
 for(const side of [-1,1]){
  const x=side*.060,eyeZ=faceFront(x/.92,.035)*.95;
  part.ball([.020,.045,.028],[side*.155,y+.063,.003],skin);
  part.ball([.010,.027,.018],[side*.166,y+.063,-.010],shade);
  part.ball([.027,.010,.007],[x,y+.096,eyeZ-.003],'#c9bda4');
  part.ball([.007,.008,.007],[x,y+.096,eyeZ-.009],'#302e26');
  part.rod([x-.026,y+.106,eyeZ-.003],[x+.026,y+.107,eyeZ-.003],.004,shade);
  part.rod([x-side*.030,y+.120,eyeZ-.002],[x+side*.028,y+.117,eyeZ-.001],.005,hair);
 }
 if(!helmet){
  part.add(new T.SphereGeometry(1,16,6,0,TAU,0,Math.PI*.49),[0,y+.12,.012],hair,undefined,[.153,.145,.136]);
  for(const side of [-1,1])part.box([.024,.08,.075],[side*.141,y+.121,.018],hair);
 }
}

export function createFootBot(index=0){
 const variant=Math.abs(Math.trunc(safe(index)))%2,root=new T.Group(),material=paintedMaterial();
 root.name=variant?'Ally · bluecoat rifleman':'Ally · field-jacket riflewoman';
 const palette=variant?{jacket:'#536a70',shade:'#3a484e',trousers:'#5c5145',skin:'#a66e4c',skinShade:'#734b37',hair:'#292c29',band:'#d6b067'}:{jacket:'#787b59',shade:'#4d5847',trousers:'#3c4948',skin:'#c49a76',skinShade:'#8d6551',hair:'#4a372b',band:'#c97944'};
 const upper=group(root,'Breathing torso',0,1.29,0),head=group(upper,'Living human face',0,.34,-.008),arms=group(upper,'Aimed rifle and hands',0,.055,-.035),legs=[];
 const torso=new PaintedPart();
 torso.add(characterLoft([[-.50,.16,.105,.025],[-.40,.19,.13,.025],[-.30,.18,.125,.025]],12),[0,0,0],palette.trousers);
 torso.add(characterLoft([[-.32,.196,.143,.025],[-.20,.182,.137,.025],[-.08,.20,.151,.025],[.07,.249,.152,.025],[.15,.225,.135,.025],[.20,.10,.095,.005]],12),[0,0,0],palette.jacket);
 torso.box([.34,.045,.29],[0,-.30,.015],'#353c34');
 torso.box([.065,.048,.018],[0,-.30,-.14],'#b0a78b');
 torso.box([.035,.39,.017],[0,-.09,-.123],palette.shade);
 for(const s of [-1,1]){
  torso.box([.11,.12,.03],[s*.13,.015,-.135],palette.shade);
  torso.box([.12,.027,.04],[s*.13,.069,-.151],palette.jacket);
  torso.box([.062,.16,.045],[s*.153,-.25,-.15],'#625b43');
 }
 torso.add(characterLoft([[.15,.105,.09],[.19,.098,.087],[.21,.083,.08]],12),[0,0,0],palette.band);
 for(const side of [-1,1]){
  torso.box([.09,.095,.015],[side*.072,.14,-.10],palette.jacket,[.18,0,side*.45]);
  torso.rod([side*.10,-.17,-.134],[side*.17,-.13,-.136],.006,palette.shade);
  torso.rod([side*.09,-.23,-.134],[side*.16,-.21,-.137],.004,palette.shade);
 }
 for(const y of [-.22,-.1,.02])torso.ball([.008,.009,.005],[0,y,-.143],'#b1ab91');
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
  face.add(new T.SphereGeometry(1,16,6,0,TAU,0,Math.PI*.50),[0,.17,.01],palette.shade,undefined,[.16,.10,.15]);
  face.ball([.16,.014,.085],[0,.175,-.13],palette.shade);
 }
 face.mesh(head,material,'Warm face, eyes and hair');
 const held=new PaintedPart();
 for(const s of [-1,1]){
  const elbow=[s*.32,-.18,-.12],hand=s<0?[.055,-.10,-.61]:[.10,-.12,-.29];
  held.rod([s*.245,.005,.035],elbow,.09,palette.jacket,.104);
  held.ball([.107,.10,.102],[s*.245,-.012,.025],palette.jacket);
  held.rod(elbow,hand,.062,palette.jacket,.075);
  held.ball([.045,.049,.06],hand,'#655a43');
  for(let finger=0;finger<3;finger++)held.rod([hand[0]-.032+finger*.025,hand[1]+.025,hand[2]-.044],[hand[0]-.035+finger*.025,hand[1]-.023,hand[2]-.050],.012,'#8b7c59');
  held.rod([hand[0]-.04,hand[1]+.025,hand[2]],[hand[0]-.05,hand[1],hand[2]-.04],.016,'#8b7c59');
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
  shape.add(characterLoft([[-.70,.062,.071,.005,s*.018],[-.54,.071,.076,.005,s*.018],[-.39,.083,.082,-.025,s*.015],[-.31,.09,.095,-.022,s*.014],[-.14,.105,.111,.003,s*.008],[.025,.113,.12,0]],10),[0,0,0],palette.trousers);
  for(const y of [-.34,-.43])shape.rod([-.064,y,-.08],[.052,y+.02,-.08],.004,palette.shade);
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

// A single opaque draw for evacuees. Limb tags retain the existing walking rig;
// detailed living faces never enter the 12,000-instance zombie geometry.
const survivorTemplates=[];
export function survivorGeometry(index=0){
 const variant=Math.abs(Math.trunc(safe(index)))%2;
 // Templates never leave this module. Every evacuee owns mutable pose buffers;
 // streaming reuses construction without sharing positions or disposal state.
 return (survivorTemplates[variant]??=buildSurvivorGeometry(variant)).clone();
}
function buildSurvivorGeometry(index=0){
 const jacket=index%2?'#748e87':'#b9904f',shade=index%2?'#4a6464':'#756b46',skin=index%2?'#ac7958':'#c6a17f',trousers='#3b5054';
 const pieces=[],body=new PaintedPart();
 body.add(characterLoft([[.79,.17,.12],[.91,.195,.135],[1.08,.18,.13],[1.29,.235,.15],[1.42,.24,.138],[1.49,.10,.08]],12),[0,0,0],jacket);
 body.rod([0,1.45,0],[0,1.57,-.015],.067,skin);
 humanFace(body,{skin,shade:'#815f48',hair:index%2?'#342f29':'#594432'},1.65);
 body.box([.32,.035,.28],[0,.88,.005],'#454c3c');body.box([.047,.042,.025],[0,.88,-.145],'#b4a782');
 body.box([.027,.44,.02],[0,1.19,-.145],shade);
 for(const side of [-1,1]){
  body.box([.115,.13,.024],[side*.125,1.27,-.139],shade);body.box([.12,.027,.033],[side*.125,1.33,-.156],jacket);
  body.rod([side*.17,1.42,-.09],[side*.13,.96,-.139],.014,'#a79a77');
  body.box([.075,.13,.06],[side*.17,.93,-.13],shade);
 }
 body.box([.25,.28,.12],[0,1.19,.18],shade);pieces.push([body,0]);
 for(const side of [-1,1]){
  const arm=new PaintedPart(),leg=new PaintedPart(),x=side*.29;
  arm.rod([x,1.39,.02],[side*.34,1.13,-.02],.078,jacket,.10);
  arm.ball([.10,.085,.10],[x,1.38,.02],jacket);
  arm.rod([side*.34,1.13,-.02],[side*.34,.93,-.08],.052,jacket,.071);
  arm.ball([.046,.071,.04],[side*.34,.89,-.09],skin);
  for(let i=0;i<3;i++)arm.rod([side*.34-.02+i*.018,.88,-.12],[side*.34-.02+i*.018,.84,-.12],.009,skin);
  leg.add(characterLoft([[.12,.063,.071,.018,side*.13],[.38,.077,.08,-.025,side*.14],[.55,.093,.10,-.02,side*.13],[.84,.11,.115,.015,side*.12]],10),[0,0,0],trousers);
  leg.box([.13,.13,.035],[side*.14,.45,-.10],shade);
  leg.box([.165,.13,.28],[side*.13,.09,-.045],'#29332e');leg.box([.173,.03,.286],[side*.13,.025,-.047],'#1f2824');
  pieces.push([arm,side<0?1:2],[leg,side<0?3:4]);
 }
 const data={position:[],normal:[],color:[],part:[]};
 for(const [p,tag] of pieces){data.position.push(...p.positions);data.normal.push(...p.normals);data.color.push(...p.colors);data.part.push(...Array(p.positions.length/3).fill(tag));}
 const geometry=new T.BufferGeometry();for(const [key,value] of Object.entries(data))geometry.setAttribute(key,new T.Float32BufferAttribute(value,key==='part'?1:3));geometry.computeBoundingSphere();return geometry;
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
 for(const child of u.driver.children)if(child!==u.head)child.visible=false;
 for(const child of u.head.children)child.visible=false;
 const suit=new PaintedPart(),coat=kind==='escort'?'#77715b':'#536970',cloth='#35484c',skin=kind==='escort'?'#a56f51':'#bf9470';
 suit.add(characterLoft([[.02,.17,.14,.025],[.13,.18,.14,.015],[.34,.20,.15,0],[.53,.248,.145,-.02],[.64,.09,.08,-.015]],12),[0,0,0],coat);
 suit.rod([0,.62,-.02],[0,.76,-.02],.07,skin);
 suit.box([.05,.46,.02],[0,.32,-.151],cloth);
 for(const side of [-1,1]){
  suit.rod([side*.14,.04,.015],[side*.16,-.07,-.38],.113,cloth,.13);
  suit.rod([side*.16,-.07,-.38],[side*.16,-.35,-.65],.075,cloth,.098);
  suit.ball([.105,.075,.115],[side*.16,-.065,-.40],coat);
  suit.box([.17,.14,.29],[side*.16,-.39,-.71],'#30352e');
  suit.box([.18,.035,.30],[side*.16,-.46,-.72],'#1f2725');
  suit.rod([side*.23,.53,-.015],[side*.29,.27,-.30],.08,coat,.10);
  suit.ball([.104,.096,.104],[side*.23,.52,-.015],coat);
  suit.rod([side*.29,.27,-.30],[side*.19,.44,-.58],.055,coat,.075);
  suit.ball([.055,.050,.052],[side*.19,.44,-.58],'#5a5543');
  for(let finger=0;finger<4;finger++)suit.rod([side*(.174+finger*.012),.476,-.595],[side*(.174+finger*.012),.425,-.605],.009,'#8b7e60');
  suit.rod([side*.15,.46,-.57],[side*.18,.43,-.55],.014,'#8b7e60');
  suit.box([.11,.12,.027],[side*.12,.43,-.15],cloth);suit.box([.12,.025,.03],[side*.12,.49,-.165],coat);
  suit.rod([side*.14,.61,-.105],[side*.10,.10,-.153],.022,'#b8a47a');
  suit.box([.052,.052,.028],[side*.11,.19,-.177],steel);
 }
 suit.mesh(u.driver,material,'Seated jacket, knees, harness and wheel grips');
 const face=new PaintedPart();humanFace(face,{skin,shade:'#805a43',hair:'#3c332b'},0,true);
 face.add(new T.SphereGeometry(1,16,8,0,TAU,0,Math.PI*.48),[0,.125,.012],kind==='escort'?'#9d9e84':'#c69c4c',undefined,[.183,.145,.164]);
 face.box([.35,.025,.23],[0,.13,-.055],bone);
 face.rod([-.155,.12,-.015],[-.127,-.065,-.09],.009,dark);face.rod([.155,.12,-.015],[.127,-.065,-.09],.009,dark);
 face.mesh(u.head,material,'Connected driver face, fitted helmet and chin straps');
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
