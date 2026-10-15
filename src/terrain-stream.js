import {height} from './terrain.js';
import {regionAt} from './regions.js';
import * as T from 'three/webgpu';
import {TerrainDecoration} from './terrain-decoration.js';
export const TILE=256,RADIUS=4;
export function tilePlan(x,z){const cx=Math.floor(x/TILE),cz=Math.floor(z/TILE),out=[];for(let j=-RADIUS;j<=RADIUS;j++)for(let i=-RADIUS;i<=RADIUS;i++)out.push({key:`${cx+i},${cz+j}`,x0:(cx+i)*TILE,z0:(cz+j)*TILE,d:i*i+j*j});return out.sort((a,b)=>a.d-b.d);}
export class TerrainStream{
 constructor(group,material){
  this.group=group;this.material=material;this.rockGeo=new T.IcosahedronGeometry(1,1);this.bushGeo=new T.IcosahedronGeometry(1,0);this.rockMat=new T.MeshStandardMaterial({color:'#88664a',roughness:.95});this.bushMat=new T.MeshStandardMaterial({color:'#6e7350',roughness:1});this.dummy=new T.Object3D();this.tiles=new Map();this.pending=new Set();this.queue=[];this.wanted=new Set();this.generated=0;this.disposed=0;this.error=null;this.center='';
  this.pool=[];this.completed=[];this.allocated=0;this.reused=0;this.maxCommitMs=0;this.booting=true;this.scheduled=false;
  this.ready=new Promise((resolve,reject)=>{this.resolve=()=>{this.booting=false;resolve();};this.reject=reject;});
  this.workers=Array.from({length:4},()=>{const worker=new Worker(new URL('./terrain.worker.js',import.meta.url),{type:'module'}),slot={worker,busy:null};worker.onmessage=e=>this.receive(slot,e.data);worker.onerror=e=>{this.error=e.message;this.reject(new Error('Terrain worker: '+e.message));};return slot;});
  this.update(0,70);
 }
 update(x,z){
  const key=`${Math.floor(x/TILE)},${Math.floor(z/TILE)}`;if(key===this.center)return;this.center=key;
  const plan=tilePlan(x,z);this.wanted=new Set(plan.map(t=>t.key));
  for(const [id,mesh] of this.tiles)if(!this.wanted.has(id)){mesh.visible=false;this.pool.push(mesh);this.tiles.delete(id);this.disposed++;}
  this.completed=this.completed.filter(t=>this.wanted.has(t.job.key));
  const completed=new Set(this.completed.map(t=>t.job.key));
  this.queue=plan.filter(t=>!this.tiles.has(t.key)&&!this.pending.has(t.key)&&!completed.has(t.key));this.pump();
 }
 pump(){for(const slot of this.workers){if(slot.busy||!this.queue.length)continue;const job=this.queue.shift();slot.busy=job;this.pending.add(job.key);slot.worker.postMessage({...job,size:TILE,segments:128});}}
 receive(slot,data){
  const job=slot.busy;slot.busy=null;this.pending.delete(job.key);
  if(this.wanted.has(job.key))this.completed.push({job,data});
  this.pump();if(this.booting)this.flush();else this.schedule();
 }
 schedule(){if(this.scheduled||!this.completed.length)return;this.scheduled=true;requestAnimationFrame(()=>{this.scheduled=false;this.flush();this.schedule();});}
 flush(){
  // Upload one replacement per frame. Retain mesh, material and attribute
  // identities so streamed rows reuse their GPU buffers and render objects.
  const next=this.completed.shift();if(next&&this.wanted.has(next.job.key))this.commit(next.job,next.data);
  if(this.tiles.size===this.wanted.size&&!this.queue.length&&!this.pending.size&&!this.completed.length)this.resolve();
 }
 commit(job,data){
  const start=performance.now();let mesh=this.pool.pop();
  if(mesh){for(const [key,array] of [['position',data.positions],['normal',data.normals],['color',data.colors]]){const a=mesh.geometry.getAttribute(key);a.array.set(array);a.needsUpdate=true;}this.reused++;}
  else{
   const geometry=new T.BufferGeometry();for(const [key,array] of [['position',data.positions],['normal',data.normals],['color',data.colors]])geometry.setAttribute(key,new T.BufferAttribute(array,3));geometry.setIndex(new T.BufferAttribute(data.indices,1));mesh=new T.Mesh(geometry,this.material);mesh.receiveShadow=true;
   for(const [geometry,material,count,bush] of [[this.rockGeo,this.rockMat,18,false],[this.bushGeo,this.bushMat,32,true]]){const decoration=new TerrainDecoration(geometry,material,count);decoration.name=bush?'Terrain shrubs':'Terrain rocks';decoration.receiveShadow=true;decoration.castShadow=!bush;mesh.add(decoration);}
   this.onAdd?.(mesh);this.group.add(mesh);this.allocated++;
  }
  mesh.geometry.computeBoundingSphere();mesh.name='Terrain '+job.key;this.decorate(mesh,job);mesh.visible=true;this.tiles.set(job.key,mesh);this.generated++;this.maxCommitMs=Math.max(this.maxCommitMs,performance.now()-start);
 }
 decorate(tile,job){
  let seed=((job.x0*17)^(job.z0*83)^0x12345678)>>>0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const [index,count,bush] of [[0,18,false],[1,32,true]]){
   const mesh=tile.children[index];mesh.begin();let used=0;
   for(let i=0;i<count;i++){const x=job.x0+rand()*TILE,z=job.z0+rand()*TILE,site=regionAt(Math.round(x/900),Math.round(z/900));if(Math.hypot(x,z)<270||Math.hypot(x-site.x,z-site.z)<65)continue;const y=height(x,z),scale=bush?.35+rand()*.8:.5+rand()*2;this.dummy.position.set(x,y+scale*.25,z);this.dummy.rotation.set(rand()*.4,rand()*6.28,rand()*.3);this.dummy.scale.set(scale*(bush?1.7:1),scale*(bush?.5:.7),scale*(bush?1.7:1.2));this.dummy.updateMatrix();mesh.setMatrixAt(used++,this.dummy.matrix);}
   mesh.finish(used);
  }
 }
 async settled(){const until=performance.now()+30000;while(this.queue.length||this.pending.size||this.completed.length){if(this.error)throw Error(this.error);if(performance.now()>until)throw Error('Terrain streaming timed out');await new Promise(r=>setTimeout(r,20));}return this.report();}
 report(){return {center:this.center,resident:this.tiles.size,queued:this.queue.length,inFlight:this.pending.size,pendingUploads:this.completed.length,generated:this.generated,disposed:this.disposed,allocated:this.allocated,reused:this.reused,maxCommitMs:this.maxCommitMs,maxTiles:81,error:this.error};}
}
