import {BattlefieldAudio} from './audio.js';
import * as T from 'three/webgpu';
import {height} from './nav.js';
import {attribute} from 'three/tsl';

// Repeated rocket volleys share five draws. No effect allocates geometry,
// materials or scene objects after construction; saturated pools replace old FX.
export const EFFECT_LIMITS=Object.freeze({tracers:256,fragments:256,clouds:112,rings:24,stains:40});
const UP=new T.Vector3(0,1,0),TAU=Math.PI*2;
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);

class EffectPool{
 constructor(scene,geometry,capacity,{alpha=false,name='Effect',lit=false}={}){
  this.capacity=capacity;this.cursor=0;this.dummy=new T.Object3D();
  const material=lit?new T.MeshStandardMaterial({roughness:.92}):alpha?new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false}):new T.MeshBasicMaterial();
  if(alpha){this.alpha=new T.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('effectAlpha',this.alpha);material.opacityNode=attribute('effectAlpha','float');}
  this.mesh=new T.InstancedMesh(geometry,material,capacity);this.mesh.name=name;this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(this.mesh);
  this.slots=Array.from({length:capacity},(_,index)=>({index,life:0,max:1,pos:new T.Vector3(),vel:new T.Vector3(),size:1,growth:0,opacity:1,spin:0,angle:0,kind:'',color:new T.Color()}));
  for(let i=0;i<capacity;i++)this.mesh.setColorAt(i,new T.Color());
  this.clear();
 }
 spawn(p,life,color){
  const slot=this.slots[this.cursor++%this.capacity];slot.pos.copy(p);slot.vel.set(0,0,0);slot.life=slot.max=life;slot.size=1;slot.growth=slot.spin=slot.angle=0;slot.opacity=1;slot.kind='';slot.color.set(color);
  this.mesh.setColorAt(slot.index,slot.color);this.mesh.instanceColor.needsUpdate=true;this.mesh.visible=true;return slot;
 }
 write(slot,size,alpha=1){
  this.dummy.position.copy(slot.pos);this.dummy.rotation.set(slot.angle,slot.angle*.71,slot.angle*.37);this.dummy.scale.setScalar(size);this.dummy.updateMatrix();this.mesh.setMatrixAt(slot.index,this.dummy.matrix);
  if(this.alpha)this.alpha.array[slot.index]=alpha;
 }
 flush(active){this.mesh.visible=active>0;this.mesh.instanceMatrix.needsUpdate=true;if(this.alpha)this.alpha.needsUpdate=true;}
 clear(){this.cursor=0;for(const slot of this.slots){slot.life=0;this.write(slot,0,0);}this.flush(0);}
 get active(){let count=0;for(const slot of this.slots)if(slot.life>0)count++;return count;}
 dispose(scene){scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh.material.dispose();}
}

export class Effects{
 constructor(scene,{ground=height}={}){
  this.scene=scene;this.ground=ground;this.audio=null;this.mixer=new BattlefieldAudio();this.rng=7;this.skidAt=-1;this.explosions=0;this.surfaceHits=0;this.weaponEvents=0;
  this.dummy=new T.Object3D();this.direction=new T.Vector3();this.endpoint=new T.Vector3();this.color=new T.Color();this.normal=new T.Vector3();
  this.tracerCursor=0;this.traces=Array.from({length:EFFECT_LIMITS.tracers},()=>({life:0,max:1}));
  const geometry=new T.CylinderGeometry(1,1,1,4);this.tracerAlpha=new T.InstancedBufferAttribute(new Float32Array(EFFECT_LIMITS.tracers),1);geometry.setAttribute('traceAlpha',this.tracerAlpha);
  const material=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false});material.opacityNode=attribute('traceAlpha','float');this.tracers=new T.InstancedMesh(geometry,material,EFFECT_LIMITS.tracers);this.tracers.name='Combat tracers';this.tracers.frustumCulled=false;scene.add(this.tracers);
  for(let i=0;i<EFFECT_LIMITS.tracers;i++)this.tracers.setColorAt(i,new T.Color('#ffd087'));
  this.fragments=new EffectPool(scene,new T.IcosahedronGeometry(1,0),EFFECT_LIMITS.fragments,{name:'Impact fragments',lit:true});
  this.clouds=new EffectPool(scene,new T.IcosahedronGeometry(1,1),EFFECT_LIMITS.clouds,{name:'Blast and motor clouds',alpha:true});
  const ringGeometry=new T.RingGeometry(.83,1,40);ringGeometry.rotateX(-Math.PI/2);
  this.rings=new EffectPool(scene,ringGeometry,EFFECT_LIMITS.rings,{name:'Blast pressure fronts',alpha:true});
  // Terrain-conforming scorch discs share one dynamic geometry and one draw.
  this.stainSegments=24;this.stainCursor=0;this.stainCount=0;
  const vertices=(this.stainSegments+1)*EFFECT_LIMITS.stains;
  const positions=new Float32Array(vertices*3),indices=[];
  for(let k=0;k<EFFECT_LIMITS.stains;k++){const base=k*(this.stainSegments+1);for(let i=0;i<this.stainSegments;i++)indices.push(base,base+1+(i+1)%this.stainSegments,base+i+1);}
  const stainGeometry=new T.BufferGeometry();stainGeometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));stainGeometry.setIndex(indices);
  this.scorches=new T.Mesh(stainGeometry,new T.MeshBasicMaterial({color:'#302b23',transparent:true,opacity:.43,depthWrite:false}));this.scorches.name='Pooled blast scorches';this.scorches.frustumCulled=false;scene.add(this.scorches);
  this.clear();
 }
 random(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 audioStart(){this.mixer.start();this.mixer.setPaused(false);this.audio=this.mixer.ctx;}
 sound(kind,p){this.mixer.sound(kind,p);}
 clear(){
  this.skidAt=-1;this.tracerCursor=this.stainCursor=this.stainCount=this.explosions=this.surfaceHits=this.weaponEvents=0;
  this.dummy.scale.setScalar(0);this.dummy.updateMatrix();
  for(let i=0;i<EFFECT_LIMITS.tracers;i++){this.traces[i].life=0;this.tracerAlpha.array[i]=0;this.tracers.setMatrixAt(i,this.dummy.matrix);}
  this.tracers.visible=false;this.tracerAlpha.needsUpdate=this.tracers.instanceMatrix.needsUpdate=true;
  for(const pool of [this.fragments,this.clouds,this.rings])pool.clear();
  const positions=this.scorches.geometry.attributes.position;positions.array.fill(0);for(let i=0;i<positions.count;i++)positions.array[i*3+1]=-10000;positions.needsUpdate=true;this.scorches.visible=false;
 }
 tracer(a,b,color='#ffd087',life=.055,width=.018){
  if(!finitePoint(a)||!finitePoint(b)||!Number.isFinite(life)||life<=0)return;
  this.direction.subVectors(b,a);const length=this.direction.length();if(length<.001)return;
  const i=this.tracerCursor++%EFFECT_LIMITS.tracers,t=this.traces[i];t.life=t.max=Math.min(1,life);
  this.dummy.position.copy(a).add(b).multiplyScalar(.5);this.dummy.quaternion.setFromUnitVectors(UP,this.direction.divideScalar(length));this.dummy.scale.set(Math.max(.002,width),length,Math.max(.002,width));this.dummy.updateMatrix();
  this.tracers.setMatrixAt(i,this.dummy.matrix);this.tracers.setColorAt(i,this.color.set(color));this.tracerAlpha.array[i]=.92;this.tracers.visible=true;
  this.tracerAlpha.needsUpdate=this.tracers.instanceMatrix.needsUpdate=this.tracers.instanceColor.needsUpdate=true;
 }
 fragment(p,velocity,size,life,color='#665744'){
  const f=this.fragments.spawn(p,life,color);f.vel.copy(velocity);f.size=size;f.spin=(this.random()-.5)*16;f.angle=this.random()*TAU;
  this.fragments.write(f,size);this.fragments.flush(1);return f;
 }
 cloud(p,size,growth,life,color,opacity,velocity){
  const f=this.clouds.spawn(p,life,color);f.size=size;f.growth=growth;f.opacity=opacity;if(velocity)f.vel.copy(velocity);
  this.clouds.write(f,size,opacity);this.clouds.flush(1);return f;
 }
 weaponFire(muzzle,direction,mode='foot'){
  if(!finitePoint(muzzle)||!finitePoint(direction))return;this.weaponEvents++;
  // The authored muzzle flash supplies the hot core. Short smoke and ejected
  // brass show the action without obscuring the reticle or shaking the camera.
  this.direction.copy(direction).multiplyScalar(1.8);this.direction.y+=.75;
  this.cloud(muzzle,mode==='foot'?.045:.08,.24,.22,'#b6aaa0',.13,this.direction);
  if(mode==='foot'){
   this.endpoint.copy(muzzle).addScaledVector(direction,-.45);this.direction.set(-direction.z*2.8,1.8,direction.x*2.8);
   this.fragment(this.endpoint,this.direction,.045,.7,'#bd914c');
  }
 }
 surfaceImpact(point,worldNormal,mode='foot'){
  if(!finitePoint(point))return;this.surfaceHits++;
  this.normal.copy(finitePoint(worldNormal)?worldNormal:UP).normalize();if(this.normal.lengthSq()<.5)this.normal.copy(UP);
  this.endpoint.copy(point).addScaledVector(this.normal,.035);
  this.direction.copy(this.normal).multiplyScalar(1.4).addScaledVector(UP,.5);
  this.cloud(this.endpoint,.08,.45,.35,'#b7a58a',.28,this.direction);
  const count=mode==='jet'?4:3;
  for(let i=0;i<count;i++){
   this.direction.copy(this.normal).multiplyScalar(2.5+this.random()*3);this.direction.x+=(this.random()-.5)*3;this.direction.y+=this.random()*2;this.direction.z+=(this.random()-.5)*3;
   this.fragment(this.endpoint,this.direction,.035+this.random()*.045,.35+this.random()*.3,'#d2b183');
  }
 }
 missileTrail(point,direction,ignition=false){
  if(!finitePoint(point)||!finitePoint(direction))return;
  this.direction.copy(direction).multiplyScalar(-1.6);this.direction.y+=.35;
  this.cloud(point,ignition?.11:.085,ignition?.65:.48,ignition?.42:.6,ignition?'#ffe5ac':'#a89e8b',ignition?.65:.22,this.direction);
 }
 skid(p,yaw,time){
  if(time<this.skidAt)return;this.skidAt=time+.045;
  for(const side of [-1,1]){
   this.endpoint.set(p.x+Math.cos(yaw)*side*.7,this.ground(p.x,p.z)+.12,p.z-Math.sin(yaw)*side*.7);
   this.direction.set(Math.sin(yaw)*9+side,1+this.random()*2,Math.cos(yaw)*9);
   this.fragment(this.endpoint,this.direction,.06,.35,'#ffc67a');
  }
 }
 explosion(p,radius=10){
  if(!finitePoint(p)||!Number.isFinite(radius)||radius<=0)return;
  radius=Math.min(40,radius);this.explosions++;this.onExplosion?.(p,radius);this.sound('bomb',p);
  const floor=this.ground(p.x,p.z),nearGround=p.y-floor<radius*.75;
  this.cloud(p,.3,radius*.32,.13,'#fff4d0',.95);
  this.cloud(p,.5,radius*.38,.31,'#f08c32',.72);
  for(let i=0;i<5;i++){
   const a=i*TAU/5+this.random()*.4;this.endpoint.copy(p);this.endpoint.y=Math.max(p.y,floor+.35);
   this.direction.set(Math.cos(a)*radius*.32,1.5+this.random()*2,Math.sin(a)*radius*.32);
   this.cloud(this.endpoint,.32,radius*.19,.8+this.random()*.35,i%2?'#85735a':'#4c4b43',.34,this.direction);
  }
  const r=this.rings.spawn(p,.4,'#c3ab84');r.pos.y=nearGround?floor+.085:p.y;r.size=.45;r.growth=radius*1.25;r.opacity=.28;
  this.rings.write(r,r.size,r.opacity);this.rings.flush(1);
  for(let i=0;i<20;i++){
   const a=this.random()*TAU,speed=6+this.random()*Math.min(24,radius*1.8);
   this.direction.set(Math.cos(a)*speed,4+this.random()*14,Math.sin(a)*speed);
   this.fragment(p,this.direction,.07+this.random()*.23,1.4+this.random()*1.1,i%4===0?'#aa7850':'#5f5948');
   if(i<8){this.endpoint.copy(p).addScaledVector(this.direction,.075);this.tracer(p,this.endpoint,'#ffce75',.13,.025);}
  }
  if(nearGround)this.scorch(p,radius*.52);
 }
 scorch(p,radius){
  const slot=this.stainCursor++%EFFECT_LIMITS.stains,positions=this.scorches.geometry.attributes.position,base=slot*(this.stainSegments+1);
  positions.setXYZ(base,p.x,this.ground(p.x,p.z)+.045,p.z);
  for(let i=0;i<this.stainSegments;i++){
   const angle=i*TAU/this.stainSegments,r=radius*(.88+this.random()*.16),x=p.x+Math.cos(angle)*r,z=p.z+Math.sin(angle)*r;
   positions.setXYZ(base+i+1,x,this.ground(x,z)+.045,z);
  }
  this.stainCount=Math.min(EFFECT_LIMITS.stains,this.stainCount+1);positions.needsUpdate=true;this.scorches.visible=true;
 }
 update(dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  let active=0;
  for(let i=0;i<EFFECT_LIMITS.tracers;i++){const t=this.traces[i];t.life=Math.max(0,t.life-dt);this.tracerAlpha.array[i]=t.life/t.max*.92;if(t.life)active++;}
  this.tracers.visible=active>0;this.tracerAlpha.needsUpdate=true;
  active=0;
  for(const f of this.fragments.slots){
   if(f.life<=0)continue;f.life=Math.max(0,f.life-dt);if(!f.life){this.fragments.write(f,0);continue;}
   const step=Math.min(dt,.05);f.vel.y-=step*19;f.pos.addScaledVector(f.vel,step);f.angle+=step*f.spin;
   const floor=this.ground(f.pos.x,f.pos.z)+f.size*.5;
   if(f.pos.y<floor){f.pos.y=floor;f.vel.x*=.68;f.vel.z*=.68;f.vel.y=Math.abs(f.vel.y)*.24;f.spin*=.6;}
   this.fragments.write(f,f.size*Math.min(1,f.life/.18));active++;
  }
  this.fragments.flush(active);active=0;
  for(const f of this.clouds.slots){
   if(f.life<=0)continue;f.life=Math.max(0,f.life-dt);if(!f.life){this.clouds.write(f,0,0);continue;}
   f.pos.addScaledVector(f.vel,dt);const age=1-f.life/f.max;
   this.clouds.write(f,f.size+f.growth*Math.sqrt(age),f.opacity*Math.pow(1-age,1.5));active++;
  }
  this.clouds.flush(active);active=0;
  for(const f of this.rings.slots){
   if(f.life<=0)continue;f.life=Math.max(0,f.life-dt);if(!f.life){this.rings.write(f,0,0);continue;}
   const age=1-f.life/f.max;this.rings.write(f,f.size+f.growth*Math.sqrt(age),f.opacity*(1-age)*(1-age));active++;
  }
  this.rings.flush(active);
 }
 report(){return {explosions:this.explosions,surfaceHits:this.surfaceHits,weaponEvents:this.weaponEvents,tracers:this.traces.filter(t=>t.life>0).length,fragments:this.fragments.active,clouds:this.clouds.active,rings:this.rings.active,stains:this.stainCount,limits:EFFECT_LIMITS,draws:5};}
 dispose(){this.clear();for(const pool of [this.fragments,this.clouds,this.rings])pool.dispose(this.scene);for(const mesh of [this.tracers,this.scorches]){this.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}}
}
