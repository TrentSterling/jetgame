import * as T from 'three/webgpu';
import {attribute} from 'three/tsl';

export class DrivingEffects{
 constructor(scene,ground){
  this.ground=ground;this.dummy=new T.Object3D();this.clock=0;this.emitAt=0;this.cursor=0;this.markCount=0;this.dustCursor=0;this.bloodUntil=0;this.bloodBody=null;this.lastVehicle=null;this.fx=null;
  this.marks=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.58,depthWrite:false}),1536);
  this.marks.frustumCulled=false;this.bloodColor=new T.Color('#67151c');this.dirtColor=new T.Color('#302d29');
  this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(this.marks);
  const geo=new T.IcosahedronGeometry(1,1);this.alpha=new T.InstancedBufferAttribute(new Float32Array(160),1);geo.setAttribute('dustAlpha',this.alpha);
  const mat=new T.MeshBasicNodeMaterial({color:'#a48e69',transparent:true,depthWrite:false});mat.opacityNode=attribute('dustAlpha','float');
  this.dust=new T.InstancedMesh(geo,mat,160);this.dust.frustumCulled=false;this.dust.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(this.dust);
  this.puffs=Array.from({length:160},()=>({life:0,pos:new T.Vector3(),vx:0,vz:0,size:0}));this.previous=[null,null];this.clear();
 }
 clear(){this.cursor=this.markCount=this.dustCursor=this.clock=this.emitAt=0;this.previous=[null,null];this.bloodUntil=0;this.bloodBody=null;this.dummy.scale.setScalar(0);this.dummy.updateMatrix();
  for(let i=0;i<1536;i++){this.marks.setMatrixAt(i,this.dummy.matrix);this.marks.setColorAt(i,this.dirtColor);}
  for(let i=0;i<160;i++){this.dust.setMatrixAt(i,this.dummy.matrix);this.puffs[i].life=0;this.alpha.array[i]=0;}
  this.marks.instanceMatrix.needsUpdate=this.dust.instanceMatrix.needsUpdate=this.alpha.needsUpdate=true;
 }
 blood(car,count){if(count>0&&car.health>0){this.bloodBody=car.fleetId||car;this.bloodUntil=this.clock+Math.min(5,1.2+count*.12);}}
 landing(car,speed){
  if(!this.fx||speed<5)return;const c=Math.cos(car.yaw),s=Math.sin(car.yaw),strength=Math.min(1,speed/22),p=new T.Vector3(),v=new T.Vector3();
  for(const side of [-1,1])for(const axle of [-1,1]){
   p.set(car.pos.x+c*side*1.15+s*axle*1.3,0,car.pos.z-s*side*1.15+c*axle*1.3);p.y=this.ground(p.x,p.z)+.12;
   v.set(c*side*(2+strength*3)+(car.vx||0)*.07,1+strength*1.6,-s*side*(2+strength*3)+(car.vz||0)*.07);
   this.fx.cloud(p,.23,.8+strength, .65+strength*.25,'#af9873',.22,v);
   for(let j=0;j<3;j++){v.set(c*side*(2+j)+(car.vx||0)*.12,1+j*.7,-s*side*(2+j)+(car.vz||0)*.12);this.fx.fragment(p,v,.045+j*.018,.6+j*.12,'#998261');}
  }
 }
 collision(car,speed,vx,vz){
  if(!this.fx)return;const n=Math.hypot(vx,vz)||1,p=new T.Vector3(car.pos.x+vx/n*1.65,car.pos.y+1.05,car.pos.z+vz/n*1.65),v=new T.Vector3();
  const count=Math.min(18,Math.ceil(speed*.4));
  for(let j=0;j<count;j++){const a=this.fx.random()*Math.PI*2;v.set(-vx/n*(2+j*.18)+Math.cos(a)*3,1+this.fx.random()*5,-vz/n*(2+j*.18)+Math.sin(a)*3);this.fx.fragment(p,v,.035+this.fx.random()*.085,.7+this.fx.random(),j%3?'#a78a5a':'#e6bc6a');}
  v.set(-vx/n,1,-vz/n);this.fx.cloud(p,.3,1,.65,'#ab9470',.24,v);
 }
 emit(car,dt,handbrake){
  const vehicle=car.fleetId||car;if(this.lastVehicle!==vehicle){this.previous=[null,null];this.lastVehicle=vehicle;}
  const speed=Math.abs(car.speed),sliding=Math.abs(car.slip)>.13||handbrake,bloody=(car.fleetId||car)===this.bloodBody&&this.clock<this.bloodUntil,marking=sliding||bloody;
  if(!car.grounded||speed<7){this.previous=[null,null];return;}
  if(this.clock<this.emitAt)return;this.emitAt=this.clock+.035;
  const c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  for(let i=0;i<2;i++){
   const side=i?1:-1,x=car.pos.x+c*side*1.15+s*1.35,z=car.pos.z-s*side*1.15+c*1.35,prev=this.previous[i];
   if(marking&&prev){const dx=x-prev.x,dz=z-prev.z,length=Math.hypot(dx,dz);if(length>.05&&length<5){
    this.dummy.position.set((x+prev.x)/2,this.ground((x+prev.x)/2,(z+prev.z)/2)+.06,(z+prev.z)/2);
    const cx=(x+prev.x)/2,cz=(z+prev.z)/2,n=new T.Vector3(this.ground(cx-.5,cz)-this.ground(cx+.5,cz),1,this.ground(cx,cz-.5)-this.ground(cx,cz+.5)).normalize(),along=new T.Vector3(dx,0,dz).normalize();along.addScaledVector(n,-along.dot(n)).normalize();const across=new T.Vector3().crossVectors(along,n);this.dummy.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(across,along,n));this.dummy.scale.set(.38,length+.05,1);this.dummy.updateMatrix();const slot=this.cursor++%1536;this.marks.setMatrixAt(slot,this.dummy.matrix);this.marks.setColorAt(slot,bloody?this.bloodColor:this.dirtColor);this.marks.instanceColor.needsUpdate=true;this.markCount=Math.min(1536,this.markCount+1);this.marks.instanceMatrix.needsUpdate=true;
   }}
   this.previous[i]=marking?{x,z}:null;
   if(sliding||Math.abs(x)>12){const p=this.puffs[this.dustCursor++%160];p.life=p.max= .6+Math.random()*.35;p.pos.set(x,this.ground(x,z)+.25,z);const spray=sliding?1.6+Math.abs(car.slip)*3:.6;p.vx=-car.vx*.055+side*c*spray;p.vz=-car.vz*.055-side*s*spray;p.size=.18+speed*.004;}
  }
 }
 update(dt){this.clock+=dt;this.dummy.rotation.set(0,0,0);
  for(let i=0;i<160;i++){const p=this.puffs[i];p.life=Math.max(0,p.life-dt);if(p.life){p.pos.x+=p.vx*dt;p.pos.z+=p.vz*dt;p.pos.y+=dt*.6;this.dummy.position.copy(p.pos);this.dummy.scale.setScalar(p.size+(p.max-p.life)*.75);this.alpha.array[i]=Math.min(.13,p.life*.2);}else{this.dummy.scale.setScalar(0);this.alpha.array[i]=0;}this.dummy.updateMatrix();this.dust.setMatrixAt(i,this.dummy.matrix);}
  this.alpha.needsUpdate=this.dust.instanceMatrix.needsUpdate=true;
 }
}
