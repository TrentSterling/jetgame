import * as T from 'three/webgpu';
import {Fn,If,Loop,uint,float,vec3,vec4,uniform,uniformArray,instancedArray,instanceIndex,wgslFn,positionView,cameraViewMatrix,lights,max,pow,length,normalize} from 'three/tsl';

// Conservative froxel/sphere masks adapted from Trent's Froxel V5 (MIT).
// 16 x 9 x 20 cells, 32 lights, one lossless bitset per cell. Surface shading
// uses the material's GGX model, not a prelit volume approximation.
const sphereCell=wgslFn(`fn sphereCell(p:vec4f,id:u32,proj:vec2f)->bool{
 let q=vec3u(id%16u,(id/16u)%9u,id/144u);
 let a=(vec2f(q.xy)/vec2f(16,9)*2.0-1.0)*proj;
 let b=(vec2f(q.xy+vec2u(1))/vec2f(16,9)*2.0-1.0)*proj;
 let z0=.1*pow(6000.0,f32(q.z)/20.0);let z1=.1*pow(6000.0,f32(q.z+1u)/20.0);
 let r=p.w+.002;if(-p.z<z0-r||-p.z>z1+r){return false;}
 let slopes=vec4f(a.x,b.x,a.y,b.y);let lens=sqrt(vec4f(1)+slopes*slopes);
 let side=vec4f(p.x+a.x*p.z,-p.x-b.x*p.z,p.y+a.y*p.z,-p.y-b.y*p.z);
 if(any(side < -r*lens)){return false;}
 let lo=vec3f(min(a*z0,a*z1),z0);let hi=vec3f(max(b*z0,b*z1),z1);
 let v=vec3f(p.xy,-p.z);let delta=v-clamp(v,lo,hi);return dot(delta,delta)<=r*r;
}`);
const cellAt=wgslFn(`fn cellAt(p:vec3f,proj:vec2f)->u32{
 let xy=vec2u(clamp(floor((p.xy/max(.1,-p.z)/proj*.5+.5)*vec2f(16,9)),vec2f(0),vec2f(15,8)));
 let z=u32(clamp(floor(log(max(.1,-p.z)/.1)/log(6000.0)*20.0),0.0,19.0));return xy.x+xy.y*16u+z*144u;
}`);
class CombatLightNode extends T.LightingNode{
 static get type(){return 'CombatLightNode';}
 constructor(rig){super();this.rig=rig;}
 setup(builder){const r=this.rig;
   // Emit into LightsNode's active stack. Wrapping this in a detached Fn
   // builds the compute masks but silently omits their surface contribution.
   const mask=r.masks.element(cellAt({p:positionView,proj:r.proj})).toVar();
   Loop({start:0,end:32,type:'uint'},({i})=>{
    If(mask.bitAnd(uint(1).shiftLeft(i)).notEqual(0),()=>{
     const light=r.positions.element(i),lv=cameraViewMatrix.mul(vec4(light.xyz,1)).xyz.sub(positionView),d=length(lv);
     const fade=pow(max(0,float(1).sub(pow(d.div(max(light.w,.001)),4))),2).div(max(1,d.mul(d)));
     builder.context.lightingModel.direct({lightDirection:normalize(lv.add(vec3(.00001))),lightColor:r.colors.element(i).xyz.mul(fade),reflectedLight:builder.context.reflectedLight,lightNode:this},builder);
    });
   });
 }
}
export class CombatLighting{
 constructor(scene,renderer){
  this.scene=scene;this.renderer=renderer;this.clock=0;this.cursor=8;this.entries=Array.from({length:32},()=>({life:0,max:1,pos:new T.Vector3(),color:new T.Color(),power:0,range:0}));
  this.positions=uniformArray(Array.from({length:32},()=>new T.Vector4()));this.colors=uniformArray(Array.from({length:32},()=>new T.Vector4()));this.view=uniform(new T.Matrix4());this.proj=uniform(new T.Vector2(1,1));this.masks=instancedArray(16*9*20,'uint');
  this.compute=Fn(()=>{const bits=uint(0).toVar();Loop({start:0,end:32,type:'uint'},({i})=>{const p=this.positions.element(i),view=this.view.mul(vec4(p.xyz,1));If(p.w.greaterThan(0).and(sphereCell({p:vec4(view.xyz,p.w),id:instanceIndex,proj:this.proj})),()=>{bits.bitOrAssign(uint(1).shiftLeft(i));});});this.masks.element(instanceIndex).assign(bits);})().compute(16*9*20);this.compute.name='CombatFroxelMasks';
  this.node=new CombatLightNode(this);this.area=[];
 }
 async init(){
  const response=await fetch(new URL('../assets/ltc-arc.bin',import.meta.url));if(!response.ok)throw Error('ARC LTC tables missing');const values=new Float32Array(await response.arrayBuffer());if(values.length!==32768)throw Error('Invalid ARC LTC table');
  const table=data=>{const t=new T.DataTexture(data,64,64,T.RGBAFormat,T.FloatType);t.minFilter=t.magFilter=T.LinearFilter;t.needsUpdate=true;return t;};
  const a=table(values.slice(0,16384)),b=table(values.slice(16384));T.RectAreaLightNode.setLTC({LTC_FLOAT_1:a,LTC_FLOAT_2:b,LTC_HALF_1:a,LTC_HALF_2:b});
  for(const [x,y,z,width] of [[-38,7,3.1,16],[42,8,-31.8,18]]){const l=new T.RectAreaLight('#ffb35b',9,width,1.2);l.position.set(x,y,z);l.lookAt(x,0,z+12);this.scene.add(l);this.area.push(l);const mesh=new T.Mesh(new T.PlaneGeometry(width,1.2),new T.MeshBasicMaterial({color:'#ffc174'}));mesh.position.copy(l.position);mesh.quaternion.copy(l.quaternion);this.scene.add(mesh);}
  const all=[];this.scene.traverse(o=>{if(o.isLight)all.push(o)});this.lightsNode=lights([...all,this.node]);
  this.attach(this.scene);
 }
 attach(root){root.traverse(o=>{if(!o.isMesh)return;for(const mat of Array.isArray(o.material)?o.material:[o.material])if((mat?.isMeshStandardMaterial||mat?.isMeshPhysicalMaterial||mat?.isMeshStandardNodeMaterial||mat?.isMeshPhysicalNodeMaterial)&&mat.lightsNode!==this.lightsNode){mat.lightsNode=this.lightsNode;mat.needsUpdate=true;}});}
 flash(pos,color,power,range,life=.35,slot){const i=slot??(8+(this.cursor++-8)%24),e=this.entries[i];e.pos.copy(pos);e.color.set(color);e.power=power;e.range=range;e.life=e.max=life;}
 clear(){for(const e of this.entries)e.life=0;}
 update(camera,dt){
  this.clock+=dt;camera.updateMatrixWorld();this.view.value.copy(camera.matrixWorldInverse);const t=Math.tan(T.MathUtils.degToRad(camera.fov)*.5);this.proj.value.set(t*camera.aspect,t);
  for(let i=0;i<32;i++){const e=this.entries[i];e.life=Math.max(0,e.life-dt);const k=e.life/e.max;this.positions.array[i].set(e.pos.x,e.pos.y,e.pos.z,e.life>0?e.range:0);this.colors.array[i].set(e.color.r*e.power*k,e.color.g*e.power*k,e.color.b*e.power*k,0);}
  this.renderer.compute(this.compute);
 }
 get active(){return this.entries.filter(e=>e.life>0).length;}
}
