import * as T from 'three/webgpu';
import {wgslFn,positionWorld,normalLocal,transformNormalToView,attribute,uniform,mix,vec3,cameraPosition,fog,color,smoothstep,max,dFdx,dFdy} from 'three/tsl';
import {height} from './terrain.js';

const surfaceNoise=wgslFn(`fn surfaceNoise(p:vec2f)->f32{
 let i=floor(p);let f=fract(p);let t=f*f*(3.0-2.0*f);
 let q=vec4f(dot(i,vec2f(127.1,311.7)),dot(i+vec2f(1,0),vec2f(127.1,311.7)),dot(i+vec2f(0,1),vec2f(127.1,311.7)),dot(i+vec2f(1,1),vec2f(127.1,311.7)));
 let h=fract(sin(q)*43758.5453);return mix(mix(h.x,h.y,t.x),mix(h.z,h.w,t.x),t.y);
}`);
export const wetness=wgslFn(`fn wetness(p:vec3f)->f32{
 let bank=exp(-pow((p.x+230.0)/80.0,2.0)-pow((p.z-50.0)/105.0,2.0))*(1.0-smoothstep(-7.0,1.0,p.y));
 let puddle=exp(-pow((p.x-16.0)/8.0,2.0)-pow((p.z+35.0)/23.0,2.0));
 let variation=.82+.32*surfaceNoise(p.xz*.38)+.12*surfaceNoise(p.xz*1.7);
 return clamp(max(bank,puddle)*1.6*variation,0.0,1.0);
}`,[surfaceNoise]);
const sandNormal=wgslFn(`fn sandNormal(p:vec3f,n:vec3f,wet:f32)->vec3f{
 let footprint=max(length(dpdx(p)),length(dpdy(p)));
 let wind=p.x*9.0+p.z*2.1+surfaceNoise(p.xz*.32)*3.0;
 let ripple=cos(wind)*.075*(1.0-wet)*smoothstep(.65,.97,n.y)*(1.0-smoothstep(.08,.5,footprint));
 let grain=(surfaceNoise(p.xz*39.0)-.5)*.045*(1.0-wet)*(1.0-smoothstep(.006,.04,footprint));
 let mud=(surfaceNoise(p.xz*2.8)-.5)*.05*wet;
 return normalize(n+vec3f(ripple+grain+mud,0.0,ripple*.24-grain+mud*.7));
}`,[surfaceNoise]);
export function terrainFinish(material){
 const wet=wetness(positionWorld),asphalt=wgslFn(`fn asphalt(p:vec3f)->f32{return select(1.0,0.0,(abs(p.x)<8.0&&abs(p.z)<160.0)||(abs(p.x-26.0)<18.5&&abs(p.z-63.0)<47.5));}`)(positionWorld),base=material.colorNode;material.colorNode=mix(base,vec3(.055,.031,.014),wet.mul(.83));material.roughnessNode=mix(.92,.29,wet);material.metalness=0;material.normalNode=transformNormalToView(sandNormal({p:positionWorld,n:normalLocal,wet:wet.max(asphalt.oneMinus())}));
}
export function addSurfaces(scene){
 const clock=uniform(0),waters=[];
 // Directional normal waves only: no displacement, reflection pass or simulation.
 // TSL keeps this small material graph shared by WebGPU and isolated WebGL QA.
 const waterFinish=(m,puddle)=>{
  const depth=attribute('waterDepth','float').max(0),p=positionWorld;
  const swell=p.x.mul(.46).add(p.z.mul(.17)).sub(clock.mul(.52));
  const crossing=p.x.mul(.29).sub(p.z.mul(.41)).sub(clock.mul(.38)).add(1.7);
  const ripple=p.x.mul(1.7).add(p.z.mul(.58)).sub(clock.mul(1.1)).add(swell.sin().mul(.4));
  const footprint=max(dFdx(p).length(),dFdy(p).length());
  const fineFade=smoothstep(.3,1.8,footprint).oneMinus();
  const shelter=smoothstep(.015,puddle ? .09 : .4,depth).mul(puddle ? .35 : 1);
  const a=swell.cos().mul(.034),b=crossing.cos().mul(.018),c=ripple.cos().mul(.011).mul(fineFade);
  const nx=a.mul(.94).add(b.mul(.58)).add(c.mul(.95)).mul(shelter);
  const nz=a.mul(.34).sub(b.mul(.82)).add(c.mul(.32)).mul(shelter);
  m.normalNode=transformNormalToView(vec3(nx,1,nz).normalize());
  const deep=smoothstep(puddle ? .012 : .05,puddle ? .12 : 1.65,depth);
  const shallowColor=color(puddle ? '#766747' : '#69765e'),deepColor=color(puddle ? '#3e493b' : '#244549');
  // A very low, broken mineral/foam line only on the larger basin's wet edge.
  // No foam on the still puddle, and no bright crests across the open water.
  const edge=smoothstep(.025,.075,depth).mul(smoothstep(.11,.26,depth).oneMinus());
  const breakup=p.x.mul(.37).add(p.z.mul(.23)).add(swell.sin().mul(.6)).sin();
  const foam=puddle ? 0 : edge.mul(smoothstep(.3,.85,breakup)).mul(.14);
  m.colorNode=mix(mix(shallowColor,deepColor,deep),color('#a8b09a'),foam);
  m.roughnessNode=mix(puddle ? .23 : .31,puddle ? .17 : .18,deep);
  // Beer-Lambert-style absorption lets the existing bank/bed show through.
  m.opacityNode=depth.mul(puddle ? -11 : -2.6).exp().oneMinus().mul(puddle ? .82 : .92)
   .mul(smoothstep(0,.025,depth)).clamp(0,.92);
 };
 const build=(cx,cz,rx,rz,level,puddle=false)=>{
  // A subdivided grid gives shoreline depth per vertex and stable silhouettes.
  const grid=new T.PlaneGeometry(rx*2,rz*2,128,128);grid.rotateX(-Math.PI/2);grid.translate(cx,level,cz);const p=grid.attributes.position,depth=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),oval=1-((x-cx)/rx)**2-((z-cz)/rz)**2;depth[i]=Math.max(0,Math.min(level-height(x,z),oval*2));}
  grid.setAttribute('waterDepth',new T.BufferAttribute(depth,1));
  const m=new T.MeshPhysicalNodeMaterial({roughness:.19,metalness:0,ior:1.333,transparent:true,depthWrite:false,side:T.DoubleSide});
  waterFinish(m,puddle);m.alphaTest=.025;
  const water=new T.Mesh(grid,m);water.name='Water';water.renderOrder=3;water.receiveShadow=true;scene.add(water);waters.push(water);
 };
 build(-230,48,74,100,-7.4);build(16,-35,4.5,14,.065,true);
 // Analytical height haze, separate from the surface froxel light lists.
 const haze=wgslFn(`fn heightHaze(p:vec3f,c:vec3f)->vec4f{
 let d=length(p-c);let h=max(-15.0,(p.y+c.y)*.5);let density=.0008+.0018*exp(-max(0.0,h+4.0)*.032);
 let sun=pow(max(0.0,dot(normalize(p-c),normalize(vec3f(-120,75,-200)))),12.0);
 return vec4f(mix(vec3f(.26,.31,.35),vec3f(.64,.40,.18),sun),clamp(1.0-exp(-d*density),0.0,.93));
}`);
 const mist=haze({p:positionWorld,c:cameraPosition});scene.fog=null;scene.fogNode=fog(mist.xyz,mist.w);
 return {clock,waters,update:t=>clock.value=t};
}
