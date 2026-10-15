import {terrainWGSL} from './terrain.js';
import * as T from 'three/webgpu';
import {Fn,If,atomicStore,atomicAdd,instancedArray,storage,uint,instanceIndex,wgslFn,positionGeometry,cameraWorldMatrix,texture,uv,step,clamp} from 'three/tsl';

const terrainHeight=wgslFn(terrainWGSL);
const sprayPosition=wgslFn(`fn bloodSpray(q:vec3f,p:vec4f,v:vec4f,t:f32,right:vec3f,up:vec3f)->vec4f{
 let age=t-p.w;let seed=fract(sin(fract(v.w)*791.3+q.z*51.7)*43758.5453);
 let angle=seed*6.283185;let speed=2.0+fract(seed*19.3)*7.0;
 let spread=vec3f(cos(angle)*speed,1.0+fract(seed*47.0)*5.0,sin(angle)*speed)+v.xyz;
 let scale=1.0+floor(v.w)*.45;
 let center=p.xyz+spread*age*scale-vec3f(0,9.0*age*age,0);
 let ground=terrainHeight(center.xz);
 if(center.y<ground+.04){return vec4f(center.x,-10000.0,center.z,0);}
 let motion=spread*scale-vec3f(0,18.0*age,0);
 let axis=normalize(vec2f(dot(motion,right),dot(motion,up))+vec2f(.001));
 let screen=axis*q.y*(1.7+age)+vec2f(-axis.y,axis.x)*q.x;
 let size=(.10+seed*.19)*scale;
 return vec4f(center+(right*screen.x+up*screen.y)*size,clamp((1.4-age)*4.0,0.0,1.0));
}`,[terrainHeight]);
const stainPosition=wgslFn(`fn bloodStain(q:vec3f,p:vec4f,s:vec4f,t:f32)->vec3f{
 if(p.w<0.0){return vec3f(0,-10000,0);}
 let size=(1.3+s.y*1.2)*(1.0+step(1.5,s.w)*.8)*clamp((t-p.w)*3.0,.15,1.0);
 let x=p.x+q.x*size;let z=p.z+q.y*size;
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
 const origins=instancedArray(h.count,'vec4'),velocities=instancedArray(h.count,'vec4');
 const indirect=new T.IndirectStorageBufferAttribute(new Uint32Array([60,0,0,0]),1);
 const args=storage(indirect,'uint',4).toAtomic();
 const clear=Fn(()=>{atomicStore(args.element(1),uint(0));})().compute(1);
 const compact=Fn(()=>{
   const origin=h.blood.element(instanceIndex.mul(3).add(1));const age=h.time.sub(origin.w);
   If(origin.w.greaterThanEqual(0).and(age.lessThan(1.4)),()=>{
     const slot=atomicAdd(args.element(1),uint(1));
     origins.element(slot).assign(origin);velocities.element(slot).assign(h.blood.element(instanceIndex.mul(3).add(2)));
   });
 })().compute(h.count);
 const positions=[],texcoords=[];
 for(let i=0;i<10;i++)for(const [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,-.5],[.5,.5],[-.5,.5]]){positions.push(x,y,i);texcoords.push(x+.5,y+.5);}
 const g=new T.InstancedBufferGeometry();g.instanceCount=h.count;g.setIndirect(indirect);
 g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(texcoords,2));
 const mask=texture(splatMask(),uv()).a;
 const blood=bloodMaterial('#a90516');
 const spray=sprayPosition({q:positionGeometry,p:origins.toAttribute(),v:velocities.toAttribute(),t:h.time,right:cameraWorldMatrix.element(0).xyz,up:cameraWorldMatrix.element(1).xyz});
 blood.positionNode=spray.xyz;blood.opacityNode=spray.w.toVarying().mul(mask).mul(.95);
 const particles=new T.Mesh(g,blood);particles.frustumCulled=false;particles.renderOrder=2;scene.add(particles);
 const quad=new T.PlaneGeometry(1,1),stains=new T.InstancedBufferGeometry();stains.instanceCount=h.count;
 stains.setAttribute('position',quad.getAttribute('position'));stains.setAttribute('uv',quad.getAttribute('uv'));stains.setIndex(quad.getIndex());
 const p=h.blood.element(instanceIndex.mul(3)),s=h.state.toAttribute(),pool=bloodMaterial('#64030d');
 pool.positionNode=stainPosition({q:positionGeometry,p,s,t:h.time});pool.opacityNode=mask.mul(step(0,p.w)).mul(clamp(h.time.sub(p.w).mul(5),0,1)).mul(.88);
 const marks=new T.Mesh(stains,pool);marks.frustumCulled=false;marks.renderOrder=1;scene.add(marks);
 return {particles,marks,clear,compact,indirect};
}
function bloodMaterial(color){return new T.MeshBasicNodeMaterial({color,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,alphaTest:.015});}
