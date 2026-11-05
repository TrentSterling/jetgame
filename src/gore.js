import {QUALITY} from './quality.js';
import {terrainWGSL} from './terrain.js';
import * as T from 'three/webgpu';
import {Fn,If,atomicStore,atomicAdd,atomicMin,instancedArray,storage,uint,instanceIndex,wgslFn,positionGeometry,cameraWorldMatrix,texture,uv,step,clamp,attribute} from 'three/tsl';

export const GORE_LIMITS=Object.freeze({emitters:1024,droplets:16,fragments:8,lifetime:1.65});
const terrainHeight=wgslFn(terrainWGSL);
const sprayPosition=wgslFn(`fn bloodSpray(q:vec3f,p:vec4f,v:vec4f,t:f32,right:vec3f,up:vec3f)->vec4f{
 let age=t-p.w;let seed=fract(sin(fract(v.w)*791.3+q.z*51.7)*43758.5453);
 let angle=seed*6.283185;let speed=2.0+fract(seed*19.3)*7.0;
 let impact=clamp(length(v.xyz)/8.0,0.0,1.0);
 let spread=vec3f(cos(angle)*speed,1.5+fract(seed*47.0)*6.0,sin(angle)*speed)+v.xyz*(1.1+impact*.65);
 // +4 marks a lethal hit; the fractional speed seed and heavy size survive.
 let scale=1.0+(floor(v.w)%4.0)*.45+step(4.0,v.w)*.30;
 let center=p.xyz+spread*age*scale-vec3f(0,9.0*age*age,0);
 let ground=terrainHeight(center.xz);
 if(center.y<ground+.04){return vec4f(center.x,-10000.0,center.z,0);}
 let motion=spread*scale-vec3f(0,18.0*age,0);
 let axis=normalize(vec2f(dot(motion,right),dot(motion,up))+vec2f(.001));
 let screen=axis*q.y*(1.7+age)+vec2f(-axis.y,axis.x)*q.x;
 let size=(.13+seed*.22)*scale;
 return vec4f(center+(right*screen.x+up*screen.y)*size,clamp((1.65-age)*4.0,0.0,1.0));
}`,[terrainHeight]);
const fragmentPosition=wgslFn(`fn woundFragment(q:vec3f,part:f32,p:vec4f,v:vec4f,t:f32)->vec3f{
 let age=t-p.w;
 if(v.w<4.0||age<0.0||age>1.6){return vec3f(0.0,-10000.0,0.0);}
 let seed=fract(sin(fract(v.w)*791.3+part*51.7)*43758.5453);
 let angle=seed*6.283185;
 let spread=v.xyz*(1.5+seed)+vec3f(cos(angle)*(2.0+seed*4.0),2.5+seed*5.0,sin(angle)*(2.0+seed*4.0));
 var center=p.xyz+spread*age-vec3f(0.0,9.0*age*age,0.0);
 center.y=max(center.y,terrainHeight(center.xz)+.06);
 let size=(.09+seed*.16)*(1.0+(floor(v.w)%4.0)*.35)*clamp((1.6-age)*6.0,0.0,1.0);
 let spin=age*(8.0+seed*13.0);let c=cos(spin);let s=sin(spin);
 var a=vec3f(q.x*c-q.y*s,q.x*s+q.y*c,q.z);
 a=vec3f(a.x,a.y*c-a.z*s,a.y*s+a.z*c);
 return center+a*size;
}`,[terrainHeight]);
const stainPosition=wgslFn(`fn bloodStain(q:vec3f,p:vec4f,s:vec4f,v:vec4f,t:f32)->vec3f{
 if(p.w<0.0){return vec3f(0,-10000,0);}
 let size=(1.3+s.y*1.2)*(1.0+step(1.5,s.w)*.8)*clamp((t-p.w)*3.0,.15,1.0);
 let travel=normalize(v.xz+vec2f(.001,0.0));let stretch=1.0+clamp(length(v.xz)*.08,0.0,.85);
 let across=vec2f(-travel.y,travel.x);let offset=(across*q.x+travel*q.y*stretch)*size*1.15;
 let x=p.x+offset.x;let z=p.z+offset.y;
 let gy=terrainHeight(vec2f(x,z));
 return vec3f(x,gy+.045+s.y*.012,z);
}`,[terrainHeight]);

// Evaluate the irregular mask once, rather than for every blood pixel.
function splatMask(){const n=128,data=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const px=(x+.5)/n*2-1,py=(y+.5)/n*2-1,a=Math.atan2(py,px),edge=.72+.11*Math.sin(a*5+4.1)+.09*Math.sin(a*9-7.3);
 const coverage=Math.max(Math.min(1,Math.max(0,(edge-Math.hypot(px,py))/.06)),Math.min(1,Math.max(0,(.14-Math.hypot(px-.74,py+.57))/.05)));
 const k=(y*n+x)*4;data[k]=data[k+1]=data[k+2]=255;data[k+3]=Math.round(coverage*255);
 }const t=new T.DataTexture(data,n,n,T.RGBAFormat);t.magFilter=T.LinearFilter;t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;}

export function addGore(h,scene){
 if(!QUALITY.gore)return {enabled:false,nodes:[]};
 const origins=instancedArray(GORE_LIMITS.emitters,'vec4'),velocities=instancedArray(GORE_LIMITS.emitters,'vec4');
 const indirect=new T.IndirectStorageBufferAttribute(new Uint32Array([96,0,0,0]),1);
 const args=storage(indirect,'uint',4).toAtomic();
 const clear=Fn(()=>{atomicStore(args.element(1),uint(0));})().compute(1);
 const compact=Fn(()=>{
   const origin=h.blood.element(instanceIndex.mul(3).add(1));const age=h.time.sub(origin.w);
   If(origin.w.greaterThanEqual(0).and(age.greaterThanEqual(0)).and(age.lessThan(GORE_LIMITS.lifetime)),()=>{
     const slot=atomicAdd(args.element(1),uint(1));
     If(slot.lessThan(uint(GORE_LIMITS.emitters)),()=>{origins.element(slot).assign(origin);velocities.element(slot).assign(h.blood.element(instanceIndex.mul(3).add(2)));}).Else(()=>{atomicMin(args.element(1),uint(GORE_LIMITS.emitters));});
   });
 })().compute(h.count);
 const positions=[],texcoords=[];
 for(let i=0;i<GORE_LIMITS.droplets;i++)for(const [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,-.5],[.5,.5],[-.5,.5]]){positions.push(x,y,i);texcoords.push(x+.5,y+.5);}
 const g=new T.InstancedBufferGeometry();g.instanceCount=GORE_LIMITS.emitters;g.setIndirect(indirect);
 g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(texcoords,2));
 const mask=texture(splatMask(),uv()).a;
 const blood=bloodMaterial('#a90516');
 const spray=sprayPosition({q:positionGeometry,p:origins.toAttribute(),v:velocities.toAttribute(),t:h.time,right:cameraWorldMatrix.element(0).xyz,up:cameraWorldMatrix.element(1).xyz});
 blood.positionNode=spray.xyz;blood.opacityNode=spray.w.toVarying().mul(mask).mul(.95);
 const particles=new T.Mesh(g,blood);particles.frustumCulled=false;particles.renderOrder=2;scene.add(particles);
 // Eight opaque fragments reuse the spray's compacted event list and
 // exact 96-vertex indirect draw. Living hit reactions generate no fragments.
 // This adds one draw, no compute pass, readback or extra storage binding.
 const shard=new T.TetrahedronGeometry(1,0),shardPosition=shard.attributes.position,fragmentVertices=[],fragmentParts=[],fragmentColors=[];
 const colors=['#6d1619','#824334','#5c3930','#765d42','#5a151b'].map(c=>new T.Color(c));
 for(let part=0;part<GORE_LIMITS.fragments;part++)for(let i=0;i<shardPosition.count;i++){
  fragmentVertices.push(shardPosition.getX(i),shardPosition.getY(i)*(.65+part*.1),shardPosition.getZ(i));fragmentParts.push(part);fragmentColors.push(colors[part%colors.length].r,colors[part%colors.length].g,colors[part%colors.length].b);
 }
 shard.dispose();
 const fragmentsGeometry=new T.InstancedBufferGeometry();fragmentsGeometry.instanceCount=GORE_LIMITS.emitters;fragmentsGeometry.setIndirect(indirect);
 fragmentsGeometry.setAttribute('position',new T.Float32BufferAttribute(fragmentVertices,3));fragmentsGeometry.setAttribute('fragment',new T.Float32BufferAttribute(fragmentParts,1));fragmentsGeometry.setAttribute('color',new T.Float32BufferAttribute(fragmentColors,3));
 const fragmentMaterial=new T.MeshBasicNodeMaterial({vertexColors:true});
 fragmentMaterial.positionNode=fragmentPosition({q:positionGeometry,part:attribute('fragment','float'),p:origins.toAttribute(),v:velocities.toAttribute(),t:h.time});
 const fragments=new T.Mesh(fragmentsGeometry,fragmentMaterial);fragments.name='Lethal wound fragments';fragments.frustumCulled=false;scene.add(fragments);
 const quad=new T.PlaneGeometry(1,1),stains=new T.InstancedBufferGeometry();stains.instanceCount=h.count;
 stains.setAttribute('position',quad.getAttribute('position'));stains.setAttribute('uv',quad.getAttribute('uv'));stains.setIndex(quad.getIndex());
 const p=h.blood.element(instanceIndex.mul(3)),s=h.state.toAttribute(),pool=bloodMaterial('#64030d');
 pool.positionNode=stainPosition({q:positionGeometry,p,s,v:h.blood.element(instanceIndex.mul(3).add(2)),t:h.time});pool.opacityNode=mask.mul(step(0,p.w)).mul(clamp(h.time.sub(p.w).mul(5),0,1)).mul(.88);
 const marks=new T.Mesh(stains,pool);marks.frustumCulled=false;marks.renderOrder=1;scene.add(marks);
 return {enabled:true,nodes:[clear,compact],particles,marks,fragments,clear,compact,indirect};
}
function bloodMaterial(color){return new T.MeshBasicNodeMaterial({color,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,alphaTest:.015});}

