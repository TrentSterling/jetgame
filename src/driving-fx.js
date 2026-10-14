import * as T from 'three/webgpu';
import {attribute} from 'three/tsl';

export class DrivingEffects{
 constructor(scene,ground){
  this.ground=ground;this.dummy=new T.Object3D();this.clock=0;this.emitAt=0;this.cursor=0;this.markCount=0;this.dustCursor=0;
  this.marks=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#302d29',transparent:true,opacity:.48,depthWrite:false}),768);
  this.marks.frustumCulled=false;this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(this.marks);
  const geo=new T.IcosahedronGeometry(1,1);this.alpha=new T.InstancedBufferAttribute(new Float32Array(96),1);geo.setAttribute('dustAlpha',this.alpha);
  const mat=new T.MeshBasicNodeMaterial({color:'#a48e69',transparent:true,depthWrite:false});mat.opacityNode=attribute('dustAlpha','float');
  this.dust=new T.InstancedMesh(geo,mat,96);this.dust.frustumCulled=false;this.dust.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(this.dust);
  this.puffs=Array.from({length:96},()=>({life:0,pos:new T.Vector3(),vx:0,vz:0,size:0}));this.previous=[null,null];this.clear();
 }
 clear(){this.cursor=this.markCount=this.dustCursor=this.clock=this.emitAt=0;this.previous=[null,null];this.dummy.scale.setScalar(0);this.dummy.updateMatrix();
  for(let i=0;i<768;i++)this.marks.setMatrixAt(i,this.dummy.matrix);
  for(let i=0;i<96;i++){this.dust.setMatrixAt(i,this.dummy.matrix);this.puffs[i].life=0;this.alpha.array[i]=0;}
  this.marks.instanceMatrix.needsUpdate=this.dust.instanceMatrix.needsUpdate=this.alpha.needsUpdate=true;
 }
 emit(car,dt,handbrake){
  const speed=Math.abs(car.speed),sliding=Math.abs(car.slip)>.13||handbrake;
  if(!car.grounded||speed<7){this.previous=[null,null];return;}
  if(this.clock<this.emitAt)return;this.emitAt=this.clock+.035;
  const c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  for(let i=0;i<2;i++){
   const side=i?1:-1,x=car.pos.x+c*side*1.15+s*1.35,z=car.pos.z-s*side*1.15+c*1.35,prev=this.previous[i];
   if(sliding&&prev){const dx=x-prev.x,dz=z-prev.z,length=Math.hypot(dx,dz);if(length>.05&&length<5){
    this.dummy.position.set((x+prev.x)/2,this.ground((x+prev.x)/2,(z+prev.z)/2)+.06,(z+prev.z)/2);
    const cx=(x+prev.x)/2,cz=(z+prev.z)/2,n=new T.Vector3(this.ground(cx-.5,cz)-this.ground(cx+.5,cz),1,this.ground(cx,cz-.5)-this.ground(cx,cz+.5)).normalize(),along=new T.Vector3(dx,0,dz).normalize();along.addScaledVector(n,-along.dot(n)).normalize();const across=new T.Vector3().crossVectors(along,n);this.dummy.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(across,along,n));this.dummy.scale.set(.38,length+.05,1);this.dummy.updateMatrix();this.marks.setMatrixAt(this.cursor++%768,this.dummy.matrix);this.markCount=Math.min(768,this.markCount+1);this.marks.instanceMatrix.needsUpdate=true;
   }}
   this.previous[i]=sliding?{x,z}:null;
   if(sliding||Math.abs(x)>12){const p=this.puffs[this.dustCursor++%96];p.life=p.max= .6+Math.random()*.35;p.pos.set(x,this.ground(x,z)+.25,z);p.vx=-car.vx*.035+side*c*.8;p.vz=-car.vz*.035-side*s*.8;p.size=.16+speed*.003;}
  }
 }
 update(dt){this.clock+=dt;this.dummy.rotation.set(0,0,0);
  for(let i=0;i<96;i++){const p=this.puffs[i];p.life=Math.max(0,p.life-dt);if(p.life){p.pos.x+=p.vx*dt;p.pos.z+=p.vz*dt;p.pos.y+=dt*.6;this.dummy.position.copy(p.pos);this.dummy.scale.setScalar(p.size+(p.max-p.life)*.75);this.alpha.array[i]=Math.min(.09,p.life*.13);}else{this.dummy.scale.setScalar(0);this.alpha.array[i]=0;}this.dummy.updateMatrix();this.dust.setMatrixAt(i,this.dummy.matrix);}
  this.alpha.needsUpdate=this.dust.instanceMatrix.needsUpdate=true;
 }
}
