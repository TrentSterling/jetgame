import {regionsNear,encounterRadius} from './regions.js';
import * as T from 'three/webgpu';
import {Fn,instancedArray,uniform,uniformArray,wgslFn,instanceIndex,positionGeometry,normalLocal,attribute,vertexColor,transformNormalToView,mix,vec3,step,sin} from 'three/tsl';
import {createKernels} from './kernels.js';
import {addGore} from './gore.js';
import {humanoid} from './art.js';
import {GRID,HALF,CELL,solid,height} from './nav.js';

const bodyFn=wgslFn(`fn bodyVertex(q:vec3f,part:f32,p:vec4f,s:vec4f,v:vec4f,time:f32)->vec3f{
 var a=q;let alive=step(.01,s.x);let heavy=step(1.5,s.w);let runner=step(.5,s.w)-heavy;let gait=sin(time*(6.0+s.y*2.0+runner*4.0)+s.y*80.0)*(.48+runner*.18)*alive;
 if(part>.5){var pivot=vec3f(0,1.43,0);var angle=gait;if(part>2.5){pivot.y=.82;angle=-gait;}if(part==2.0||part==4.0){angle=-angle;}a-=pivot;let yy=a.y*cos(angle)-a.z*sin(angle);a.z=a.y*sin(angle)+a.z*cos(angle);a.y=yy;a+=pivot;}
 let scale=(.87+s.y*.28)*(1.0+heavy*.6);a*=scale;a.x*=1.0+heavy*.2-runner*.14;a.z-=runner*max(0.0,a.y-.8)*.15;let fall=(1.0-alive)*min(1.0,v.w*3.0)*1.48;let yy=a.y*cos(fall)-a.z*sin(fall);a.z=a.y*sin(fall)+a.z*cos(fall);a.y=yy+(1.0-alive)*.17;
 let c=cos(p.w);let sn=sin(p.w);return vec3f(a.x*c+a.z*sn,a.y,-a.x*sn+a.z*c)+p.xyz;
}`);
const normalFn=wgslFn(`fn bodyNormal(n:vec3f,p:vec4f,s:vec4f,v:vec4f)->vec3f {let fall=(1.0-step(.01,s.x))*min(1.0,v.w*3.0)*1.48;let a=vec3f(n.x,n.y*cos(fall)-n.z*sin(fall),n.y*sin(fall)+n.z*cos(fall));let c=cos(p.w);let sn=sin(p.w);return vec3f(a.x*c+a.z*sn,a.y,-a.x*sn+a.z*c);}`);

export class Horde{
 constructor(renderer,scene,field,count=12000){this.renderer=renderer;this.count=count;this.field=field;this.stats={kills:0,hits:0,carKills:0,bombKills:0,carContacts:0,contactMs:0,scrap:0,skidKills:0,jetContacts:0,footContactMs:0,cabContactMs:0,meleeHits:0,missileKills:0};
  this.pos=instancedArray(count,'vec4');this.old=instancedArray(count,'vec4');this.vel=instancedArray(count,'vec4');this.state=instancedArray(count,'vec4');this.density=instancedArray(GRID*GRID+2,'uint').toAtomic();this.flow=instancedArray(field.data.slice(),'vec4');this.counters=instancedArray(13,'uint').toAtomic();
  this.fieldOrigin=uniform(new T.Vector2(field.origin.x,field.origin.z));this.streaming=uniform(1);this.dt=uniform(0);this.time=uniform(0);this.goal=uniform(new T.Vector4(0,1,70,0));this.shot=uniform(new T.Vector4());this.aim=uniform(new T.Vector4(0,0,-1,100));this.blast=uniform(new T.Vector4());this.car=uniform(new T.Vector4());this.carOld=uniform(new T.Vector4());this.tool=uniform(0);this.jet=uniform(new T.Vector4());this.jetOld=uniform(new T.Vector4());
  this.rays=uniformArray(Array.from({length:6},()=>new T.Vector4()));this.melee=uniform(new T.Vector4());this.meleeAim=uniform(new T.Vector4());this.blastType=uniform(3);
  this.blood=instancedArray(count*3,'vec4');
  Object.assign(this, createKernels(this));
  const geo=humanoid();geo.instanceCount=count;this.trianglesPerEnemy=geo.getAttribute('position').count/3;
  const p=this.pos.toAttribute(),s=this.state.toAttribute(),v=this.vel.toAttribute();const m=new T.MeshStandardNodeMaterial({roughness:.96});m.positionNode=bodyFn({q:positionGeometry,part:attribute('part','float'),p,s,v,time:this.time});m.normalNode=transformNormalToView(normalFn({n:normalLocal,p,s,v}));m.colorNode=mix(attribute('color','vec3').mul(mix(vec3(.57,.65,.53),vec3(1.1,.84,.53),s.y)).mul(mix(vec3(1),mix(vec3(1.55,.46,.22),vec3(.47,.66,.85),step(1.5,s.w)),step(.5,s.w))),vec3(1.7,1.6,1.3),step(this.time,s.z)).mul(mix(.32,1,step(.01,s.x)));
  this.mesh=new T.Mesh(geo,m);this.mesh.frustumCulled=false;this.mesh.castShadow=true;this.mesh.receiveShadow=true;scene.add(this.mesh);
  this.reset();
  this.gore=addGore(this,scene);
 }
 reset(list){this.streaming.value=list?0:1;this.generation=(this.generation||0)+1;const p=this.pos.value.array,s=this.state.value.array,v=this.vel.value.array;p.fill(0);s.fill(0);v.fill(0);const sites=regionsNear(0,0);let seed=74129;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<this.count;i++){let x,z,hp=90;if(list){const a=list[i];x=a?.x??180;z=a?.z??180;hp=a?(a.hp??90):0;}else{const site=sites[i%sites.length];let tries=0;do{const a=rand()*Math.PI*2,r=encounterRadius(i,rand());x=site.x+Math.cos(a)*r;z=site.z+Math.sin(a)*r;}while(++tries<30&&(solid(x,z,2)||Math.hypot(x,z-70)<28));}
    const y=height(x,z),r=rand(),type=list?(list[i]?.type??0):(r>.93?2:r>.73?1:0);if(hp>0)hp=list?(list[i]?.hp??(type===2?340:type===1?60:90)):(type===2?340:type===1?60:90);p.set([x,y,z,0],i*4);s.set([hp,r,-10,list&&!list[i]?-1:type],i*4);v.set([0,0,0,hp?0:10],i*4);
  }for(const b of [this.blood]){b.value.array.fill(0);for(let i=0;i<this.count*3;i++)b.value.array[i*4+3]=-10;b.value.needsUpdate=true;}
  for(const b of [this.pos,this.state,this.vel])b.value.needsUpdate=true;this.counters.value.array.fill(0);this.counters.value.needsUpdate=true;this.stats={kills:0,hits:0,carKills:0,bombKills:0,carContacts:0,contactMs:0,scrap:0,skidKills:0,jetContacts:0,footContactMs:0,cabContactMs:0,meleeHits:0,missileKills:0};}
 updateFlow(){this.fieldOrigin.value.set(this.field.origin.x,this.field.origin.z);this.flow.value.array.set(this.field.data);this.flow.value.needsUpdate=true;}
 step(dt,time,goal,shot,blast,car,carOld,tool,jet,jetOld,melee,meleeAim,blastType=3){this.melee.value.copy(melee);this.meleeAim.value.copy(meleeAim);this.blastType.value=blastType;for(let i=0;i<6;i++)this.rays.array[i].copy(shot.rays[i]);this.dt.value=dt;this.time.value=time;this.goal.value.copy(goal);this.shot.value.copy(shot.origin);this.aim.value.copy(shot.aim);this.blast.value.copy(blast);this.car.value.copy(car);this.carOld.value.copy(carOld);this.tool.value=tool;this.jet.value.copy(jet);this.jetOld.value.copy(jetOld);this.renderer.compute([this.clear,this.snapshot,this.sim,this.gore.clear,this.gore.compact]);}
 async readStats(){if(this.pending)return this.pending;const generation=this.generation;this.pending=(async()=>{try{const b=await this.renderer.getArrayBufferAsync(this.counters.value);if(generation!==this.generation)return this.stats;const c=new Uint32Array(b);this.stats={kills:c[0],hits:c[1],carKills:c[2],bombKills:c[3],carContacts:c[4],contactMs:c[5],scrap:c[6],skidKills:c[7],jetContacts:c[8],footContactMs:c[9],cabContactMs:c[10],meleeHits:c[11],missileKills:c[12]};return this.stats;}finally{this.pending=null;}})();return this.pending;}
 async sample(n=8){const p=new Float32Array(await this.renderer.getArrayBufferAsync(this.pos.value)),s=new Float32Array(await this.renderer.getArrayBufferAsync(this.state.value));return Array.from({length:n},(_,i)=>({x:p[i*4],y:p[i*4+1],z:p[i*4+2],hp:s[i*4]}));}
}
