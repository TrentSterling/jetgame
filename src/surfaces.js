import * as T from 'three/webgpu';
import {wgslFn,positionWorld,normalLocal,transformNormalToView,attribute,uniform,mix,vec3,cameraPosition,fog} from 'three/tsl';
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
 const wave=wgslFn(`fn waterNormal(p:vec3f,t:f32)->vec3f{
 let drift=surfaceNoise(p.xz*.22+vec2f(t*.018,-t*.01))*2.5;
 return normalize(vec3f(.048*cos(p.x*.94+p.z*.37+t*1.1+drift)+.021*cos(p.x*2.1+p.z*.49-t*1.7),1.0,.033*cos(p.z*1.21-p.x*.31+t*.8+drift)+.016*sin(p.z*2.3+p.x*.8+t*1.8)));
}`,[surfaceNoise]);
 const build=(cx,cz,rx,rz,level,color)=>{
  // A subdivided grid gives shoreline depth per vertex and stable silhouettes.
  const grid=new T.PlaneGeometry(rx*2,rz*2,128,128);grid.rotateX(-Math.PI/2);grid.translate(cx,level,cz);const p=grid.attributes.position,depth=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),oval=1-((x-cx)/rx)**2-((z-cz)/rz)**2;depth[i]=Math.max(0,Math.min(level-height(x,z),oval*2));}
  grid.setAttribute('waterDepth',new T.BufferAttribute(depth,1));
  const m=new T.MeshPhysicalNodeMaterial({color,roughness:.19,metalness:0,ior:1.333,transparent:true,depthWrite:false,side:T.DoubleSide});
  m.opacityNode=attribute('waterDepth','float').mul(7).clamp(0,.92);m.alphaTest=.025;m.normalNode=transformNormalToView(wave({p:positionWorld,t:clock}));
  const water=new T.Mesh(grid,m);water.name='Water';water.renderOrder=3;water.receiveShadow=true;scene.add(water);waters.push(water);
 };
 build(-230,48,74,100,-7.4,'#24413e');build(16,-35,4.5,14,.065,'#51452e');
 // Analytical height haze, separate from the surface froxel light lists.
 const haze=wgslFn(`fn heightHaze(p:vec3f,c:vec3f)->vec4f{
 let d=length(p-c);let h=max(-15.0,(p.y+c.y)*.5);let density=.0008+.0018*exp(-max(0.0,h+4.0)*.032);
 let sun=pow(max(0.0,dot(normalize(p-c),normalize(vec3f(-120,75,-200)))),12.0);
 return vec4f(mix(vec3f(.26,.31,.35),vec3f(.64,.40,.18),sun),clamp(1.0-exp(-d*density),0.0,.93));
}`);
 const mist=haze({p:positionWorld,c:cameraPosition});scene.fog=null;scene.fogNode=fog(mist.xyz,mist.w);
 return {clock,waters,update:t=>clock.value=t};
}
