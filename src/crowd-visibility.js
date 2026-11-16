// Experimental, opt-in render list only. Never changes simulation IDs or save data.
import * as T from 'three/webgpu';
import {Fn,If,instanceIndex,instancedArray,storage,uint,atomicStore,atomicAdd,uniformArray,dot,vec3} from 'three/tsl';
export const CROWD_RENDER_RADIUS=5;
export function wantsCrowdVisibility(quality,search=''){
 return quality.liteCrowd&&new URLSearchParams(search).get('crowd-cull')==='1';
}
export class CrowdVisibility{
 constructor(renderer,horde,geometry){
  if(!renderer.backend.isWebGPUBackend||!geometry.index)throw Error('Crowd visibility needs indexed WebGPU geometry');
  this.renderer=renderer;this.count=horde.count;
  this.ids=instancedArray(this.count,'uint');
  this.argsAttribute=new T.IndirectStorageBufferAttribute(new Uint32Array([geometry.index.count,0,0,0,0]),1);
  const args=storage(this.argsAttribute,'uint',5).toAtomic();
  // Alias nodes, not toReadOnly() mutations on the simulation's writable nodes.
  const positions=storage(horde.pos.value,'vec4',this.count).toReadOnly();
  this.planes=uniformArray(Array.from({length:6},()=>new T.Vector4()));
  this.frustum=new T.Frustum();this.matrix=new T.Matrix4();
  this.resetPass=Fn(()=>{
   atomicStore(args.element(0),uint(geometry.index.count));
   atomicStore(args.element(1),uint(0));
   atomicStore(args.element(2),uint(0));atomicStore(args.element(3),uint(0));atomicStore(args.element(4),uint(0));
  })().compute(1);
  this.cullPass=Fn(()=>{
   const id=instanceIndex;
   If(id.lessThan(uint(this.count)),()=>{
    const center=positions.element(id).xyz.add(vec3(0,1,0));
    let visible=dot(this.planes.element(0).xyz,center).add(this.planes.element(0).w).greaterThanEqual(-CROWD_RENDER_RADIUS);
    for(let i=1;i<6;i++)visible=visible.and(dot(this.planes.element(i).xyz,center).add(this.planes.element(i).w).greaterThanEqual(-CROWD_RENDER_RADIUS));
    If(visible,()=>{
     const slot=atomicAdd(args.element(1),uint(1)).toVar();
     this.ids.element(slot).assign(id);
    });
   });
  })().compute(this.count);
  this.resetPass.name='CrowdVisibleReset';this.cullPass.name='CrowdVisibleCompact';
  geometry.setIndirect(this.argsAttribute,0);
  // Keep instanceCount nonzero; only GPU args control whether zero gets drawn.
 }
 beforeRender(camera){
  // First use compiles these small passes synchronously in the existing boot
  // warm render. The bundled async helper is reserved for HordeSim only.
  camera.updateMatrixWorld();
  this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  this.frustum.setFromProjectionMatrix(this.matrix,camera.coordinateSystem,camera.reversedDepth);
  for(let i=0;i<6;i++){const p=this.frustum.planes[i];this.planes.array[i].set(p.normal.x,p.normal.y,p.normal.z,p.constant);}
  // Separate dispatches provide reset -> cull ordering across all workgroups.
  this.renderer.compute(this.resetPass);
  this.renderer.compute(this.cullPass);
 }
 renderNodes(horde){
  const originalID=storage(this.ids.value,'uint',this.count).toReadOnly().element(instanceIndex);
  return {
   p:storage(horde.pos.value,'vec4',this.count).toReadOnly().element(originalID),
   s:storage(horde.state.value,'vec4',this.count).toReadOnly().element(originalID),
   v:storage(horde.vel.value,'vec4',this.count).toReadOnly().element(originalID)
  };
 }
}
