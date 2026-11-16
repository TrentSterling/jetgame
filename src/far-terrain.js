import * as T from 'three/webgpu';
import {farTerrainPlan} from './far-terrain-data.js';
// One background job per tile crossing; no foliage, shadows, collision or actor changes.
export class FarTerrain{
 constructor(group,material,profile){
  this.profile=profile;this.group=group;this.material=material;this.mesh=null;this.busy=false;this.wanted=null;this.key='';
  this.worker=new Worker(new URL('./far-terrain.worker.js',import.meta.url),{type:'module'});
  this.worker.onmessage=({data})=>{this.busy=false;if(data.key===this.wanted?.key){
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(data.positions,3));g.setIndex(new T.BufferAttribute(data.indices,1));g.computeVertexNormals();g.computeBoundingSphere();
   if(this.mesh){const old=this.mesh.geometry;this.mesh.geometry=g;old.dispose();}else{this.mesh=new T.Mesh(g,this.material);this.mesh.name='Far terrain apron';this.group.add(this.mesh);}this.key=data.key;
  }this.pump();};
  this.worker.onerror=()=>{this.busy=false;this.failed=true;};
 }
 update(x,z){this.wanted=farTerrainPlan(x,z,{radius:this.profile.terrainRadius,far:this.profile.far});this.pump();}
 pump(){if(this.failed||this.busy||!this.wanted||this.key===this.wanted.key)return;this.busy=true;this.worker.postMessage(this.wanted);}
}
