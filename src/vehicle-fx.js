import * as T from 'three/webgpu';
import {attribute} from 'three/tsl';
import {height} from './nav.js';

export class VehicleEffects{
 constructor(scene){
  this.scene=scene;this.parts=[];this.clock=0;this.cursor=0;this.emitAt={car:0,jet:0};this.smokeCount=96;
  const geo=new T.IcosahedronGeometry(1,1);this.alpha=new T.InstancedBufferAttribute(new Float32Array(this.smokeCount),1);geo.setAttribute('smokeAlpha',this.alpha);
  const mat=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false});mat.opacityNode=attribute('smokeAlpha','float');
  this.smoke=new T.InstancedMesh(geo,mat,this.smokeCount);this.smoke.frustumCulled=false;this.smoke.renderOrder=3;this.smoke.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(this.smoke);
  this.puffs=Array.from({length:this.smokeCount},()=>({life:0,pos:new T.Vector3(),vel:new T.Vector3(),size:1}));this.dummy=new T.Object3D();
  this.charred=new T.MeshStandardMaterial({color:'#292928',roughness:.95});
  this.primer=new T.Mesh(new T.BoxGeometry(.1,.1,.1),this.charred);this.primer.position.y=-1000;this.primer.frustumCulled=false;scene.add(this.primer);
  this.clear();
 }
 clear(){for(const p of this.parts)this.scene.remove(p.mesh);this.parts.length=0;this.clock=0;this.emitAt={car:0,jet:0};for(let i=0;i<this.smokeCount;i++){this.puffs[i].life=0;this.dummy.scale.setScalar(0);this.dummy.updateMatrix();this.smoke.setMatrixAt(i,this.dummy.matrix);this.smoke.setColorAt(i,new T.Color('#444541'));this.alpha.array[i]=0;}this.smoke.instanceMatrix.needsUpdate=true;this.alpha.needsUpdate=true;}
 puff(pos,intensity=1){const p=this.puffs[this.cursor++%this.smokeCount];p.life=p.max=1.5+Math.random();p.pos.copy(pos).add(new T.Vector3((Math.random()-.5)*.4,.6,(Math.random()-.5)*.4));p.vel.set((Math.random()-.5)*1.1,1.4+intensity, (Math.random()-.5)*1.1);p.size=.35+Math.random()*.4;this.smoke.setColorAt((this.cursor-1)%this.smokeCount,new T.Color(intensity>.6?'#292c2b':'#6a6d68'));this.smoke.instanceColor.needsUpdate=true;}
 breakup(source,velocity){source.updateWorldMatrix(true,true);source.traverseVisible(o=>{if(!o.isMesh||o.material.isMeshBasicMaterial)return;const mesh=new T.Mesh(o.geometry,this.charred);o.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.castShadow=true;this.scene.add(mesh);const away=mesh.position.clone().sub(source.position).normalize();const vel=velocity.clone().multiplyScalar(.45).addScaledVector(away,5+Math.random()*6);vel.y+=5+Math.random()*7;this.parts.push({mesh,vel,spin:new T.Vector3(Math.random()*5,Math.random()*5,Math.random()*5),life:10});});while(this.parts.length>120){this.scene.remove(this.parts.shift().mesh);}}
 update(dt,vehicles){this.clock+=dt;
  for(const [kind,v] of Object.entries(vehicles)){if(v.health>0&&v.health<60&&this.clock>this.emitAt[kind]){this.emitAt[kind]=this.clock+(v.health<25?.065:.14);this.puff(v.pos,1-v.health/100);}}
  for(let i=this.parts.length-1;i>=0;i--){const p=this.parts[i];p.life-=dt;if(p.life<=0){this.scene.remove(p.mesh);this.parts.splice(i,1);continue;}const floor=height(p.mesh.position.x,p.mesh.position.z)+.18;
   if(p.life>6||p.mesh.position.y>floor+.05){p.vel.y-=dt*17;p.mesh.position.addScaledVector(p.vel,dt);p.mesh.rotation.x+=p.spin.x*dt;p.mesh.rotation.y+=p.spin.y*dt;p.mesh.rotation.z+=p.spin.z*dt;if(p.mesh.position.y<floor){p.mesh.position.y=floor;p.vel.y=Math.abs(p.vel.y)*.25;p.vel.x*=.6;p.vel.z*=.6;p.spin.multiplyScalar(.65);}}
   if(p.life>8&&Math.random()<dt*6)this.puff(p.mesh.position,1);
  }
  for(let i=0;i<this.smokeCount;i++){const p=this.puffs[i];p.life=Math.max(0,p.life-dt);if(p.life){p.pos.addScaledVector(p.vel,dt);this.dummy.position.copy(p.pos);this.dummy.scale.setScalar(p.size*(1+(p.max-p.life)*1.4));this.alpha.array[i]=Math.min(.45,p.life*.4);}else{this.dummy.scale.setScalar(0);this.alpha.array[i]=0;}this.dummy.updateMatrix();this.smoke.setMatrixAt(i,this.dummy.matrix);}
  this.alpha.needsUpdate=true;this.smoke.instanceMatrix.needsUpdate=true;
 }
 get activePuffs(){return this.puffs.filter(p=>p.life>0).length;}
}
