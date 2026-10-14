import * as T from 'three/webgpu';
import {box,cylinder,segment,material} from './art.js';
import {height} from './nav.js';
import {ramps,trackPoints} from './track-layout.js';

export class StuntCourse{
 constructor(scene,solids){
  this.scene=scene;this.solids=solids;this.props=[];this.parts=[];this.smashed=0;
  const wood=material('#96734c'),steel=material('#4c5856',.35,.75),stripe=material('#ddaa42'),red=material('#99452f'),rubber=material('#242b29');
  this.chunkGeo=new T.BoxGeometry(1,1,1);this.chunkMat=wood;
  for(const r of ramps){
   const g=new T.Group();g.position.set(r.x,height(r.x,r.z),r.z);g.rotation.y=r.yaw;scene.add(g);
   const w=r.w/2,l=r.length/2,h=r.h;
   const vertices=[-w,0,l,w,0,l,-w,h,-l,w,0,l,w,h,-l,-w,h,-l, -w,0,l,-w,h,-l,-w,0,-l, w,0,l,w,0,-l,w,h,-l, -w,0,-l,-w,h,-l,w,h,-l,-w,0,-l,w,h,-l,w,0,-l];
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
   const mesh=new T.Mesh(geo,steel);mesh.material.side=T.DoubleSide;mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);solids.push(mesh);
   for(const side of [-1,1]){segment(g,[side*w,.08,l],[side*w,h+.08,-l],.12,stripe);for(let z=-l+2;z<l;z+=3){const y=(.5-z/r.length)*h;box(g,[.7,.045,.8],[side*(w-.55),y+.035,z],stripe).rotation.x=Math.atan(h/r.length);}}
   for(let z=l+8;z<l+28;z+=7){for(const side of [-1,1]){const mark=box(g,[2,.035,.3],[side*.68,height(r.x+Math.sin(r.yaw)*z+Math.cos(r.yaw)*side*.68,r.z+Math.cos(r.yaw)*z-Math.sin(r.yaw)*side*.68)-g.position.y+.075,z],stripe);mark.rotation.y=side*.65;}}
  }
  // A fast gravel loop connects the runway jump to two outer return jumps.
  const path=new T.CatmullRomCurve3(trackPoints.map(([x,z])=>new T.Vector3(x,0,z)),true,'catmullrom',.35);
  for(let i=0;i<40;i++){const t=i/40,p=path.getPointAt(t),d=path.getTangentAt(t),n=new T.Vector3(d.z,0,-d.x).normalize();for(const side of [-1,1]){const x=p.x+n.x*side*11,z=p.z+n.z*side*11;const b=cylinder(scene,.24,.3,.95,[x,height(x,z)+.48,z],i%2?red:stripe,7);b.castShadow=false;}}
  const prop=(kind,x,z)=>{
   const g=new T.Group();g.position.set(x,height(x,z),z);scene.add(g);
   if(kind==='crate'){box(g,[1.25,1.35,1.25],[0,.68,0],wood);for(const s of [-1,1])box(g,[1.4,.14,1.4],[0,.68+s*.48,0],steel);}
   else if(kind==='tires'){for(let i=0;i<3;i++){const tire=new T.Mesh(new T.TorusGeometry(.52,.2,6,12),rubber);tire.rotation.x=Math.PI/2;tire.position.y=.2+i*.35;g.add(tire);}}
   else{cylinder(g,.47,.47,1.4,[0,.7,0],red,10);for(const y of [.18,1.2])cylinder(g,.49,.49,.08,[0,y,0],steel,10);}
   const p={mesh:g,x,z,broken:false,kind};g.traverse(o=>{if(o.isMesh){o.userData.breakable=p;solids.push(o);}});this.props.push(p);
  };
  for(let i=0;i<9;i++)prop(i%3===0?'tires':'crate',-12+i*1.25,-173);
  for(let i=0;i<10;i++)prop(i%2?'barrel':'crate',-136+i*2.2,7);
  for(let i=0;i<9;i++)prop(i%3===0?'barrel':'crate',-110+i*1.25,108);
  for(let i=0;i<8;i++)prop('tires',-100+(i%4)*1.6,-140-Math.floor(i/4)*1.3);
 }
 shatter(p,vx,vz,speed=10){
  if(p.broken)return false;p.broken=true;p.mesh.visible=false;this.smashed++;
  p.mesh.traverse(o=>{const i=this.solids.indexOf(o);if(i>=0)this.solids.splice(i,1);});
  for(let i=0;i<5;i++){const mesh=new T.Mesh(this.chunkGeo,this.chunkMat);mesh.scale.set(.25+Math.random()*.3,.14+Math.random()*.3,.3+Math.random()*.35);mesh.position.copy(p.mesh.position).add(new T.Vector3((Math.random()-.5),.5+Math.random(),(Math.random()-.5)));mesh.castShadow=true;this.scene.add(mesh);this.parts.push({mesh,vx:vx*.6+(Math.random()-.5)*6,vy:3+Math.random()*Math.min(9,speed*.3),vz:vz*.6+(Math.random()-.5)*6,life:7,spin:Math.random()*8});}
  while(this.parts.length>100)this.scene.remove(this.parts.shift().mesh);return true;
 }
 sweep(body,before){
  if(body.health<=0)return 0;const dx=body.pos.x-before.x,dz=body.pos.z-before.z,lengthSq=dx*dx+dz*dz;let hits=0;
  if(lengthSq<.0001||Math.abs(body.speed)<4)return 0;
  for(const p of this.props){if(p.broken)continue;const t=T.MathUtils.clamp(((p.x-before.x)*dx+(p.z-before.z)*dz)/lengthSq,0,1),x=before.x+t*dx,z=before.z+t*dz,y=before.y+t*(body.pos.y-before.y);
   if(Math.hypot(x-p.x,z-p.z)<2.1&&Math.abs(y-p.mesh.position.y)<2.2){if(this.shatter(p,body.vx??dx*60,body.vz??dz*60,Math.abs(body.speed)))hits++;}
  }return hits;
 }
 update(dt){for(let i=this.parts.length-1;i>=0;i--){const p=this.parts[i];p.life-=dt;if(p.life<=0){this.scene.remove(p.mesh);this.parts.splice(i,1);continue;}p.vy-=dt*20;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.mesh.rotation.x+=p.spin*dt;const floor=height(p.mesh.position.x,p.mesh.position.z)+.16;if(p.mesh.position.y<floor){p.mesh.position.y=floor;p.vy=Math.abs(p.vy)*.2;p.vx*=.88;p.vz*=.88;p.spin*=.9;}}}
 reset(){for(const p of this.parts)this.scene.remove(p.mesh);this.parts.length=0;this.smashed=0;for(const p of this.props){if(p.broken)p.mesh.traverse(o=>{if(o.isMesh)this.solids.push(o);});p.broken=false;p.mesh.visible=true;}}
}
