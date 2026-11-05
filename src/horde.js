import {zombieLiteGeometry} from './zombie-lite.js';
import {QUALITY} from './quality.js';
import {regionsNear,encounterOffset} from './regions.js';
import {spawnCrowdOffset} from './spawn-layout.js';
import {isRegionalGuard,localCrowdOffset,localCrowdClearance} from './local-crowd.js';
import {CrowdPressure,CROWD_COUNTER_COUNT,CROWD_COUNTERS,CROWD_PRESSURE} from './crowd-pressure.js';
import * as T from 'three/webgpu';
import {Fn,instancedArray,uniform,uniformArray,wgslFn,instanceIndex,positionGeometry,normalLocal,attribute,vertexColor,transformNormalToView,mix,vec3,step,sin,texture} from 'three/tsl';
import {createKernels} from './kernels.js';
import {addGore} from './gore.js';
import {zombieGeometry} from './zombie-art.js';
import {zombieTexture} from './zombie-texture.js';
import {GRID,HALF,CELL,solid,height} from './nav.js';

const bodyFn=wgslFn(`fn bodyVertex(q:vec3f,part:f32,p:vec4f,s:vec4f,v:vec4f,time:f32)->vec3f{
 var a=q;let alive=step(.01,s.x);let heavy=step(1.5,s.w);let runner=step(.5,s.w)-heavy;let gait=sin(time*(6.0+s.y*2.0+runner*4.0-heavy*2.0)+s.y*80.0)*(.48+runner*.18)*alive*(1.0-min(1.0,v.w*5.0));
 if(part>.5){var pivot=vec3f(0,1.43,0);var angle=gait;if(part>2.5){pivot.y=.82;angle=-gait;}if(part==2.0||part==4.0){angle=-angle;}angle+=(1.0-alive)*sin(s.y*47.0+part*2.3)*.4*min(1.0,v.w*4.0);a-=pivot;let yy=a.y*cos(angle)-a.z*sin(angle);a.z=a.y*sin(angle)+a.z*cos(angle);a.y=yy;a+=pivot;}
 let scale=(.87+s.y*.28)*(1.0+heavy*.6);a*=scale;a.x*=1.0+heavy*.35-runner*.22;a.y*=1.0+runner*.07;a.z-=runner*max(0.0,a.y-.8)*.15;let fall=(1.0-alive)*min(1.0,v.w*(2.6+s.y))*1.49;
 // Rotate toward the actual impact velocity; limb curl varies per body.
 var dx=v.x*cos(p.w)-v.z*sin(p.w);var dz=v.x*sin(p.w)+v.z*cos(p.w);
 if(abs(dx)+abs(dz)<.0000001){dx=sin(s.y*91.0);dz=cos(s.y*91.0);}
 let l=sqrt(dx*dx+dz*dz);let ax=dz/l;let az=-dx/l;
 let f=cos(fall);let sf=sin(fall);let d=ax*a.x+az*a.z;
 a=vec3f(a.x*f-az*a.y*sf+ax*d*(1.0-f),a.y*f+(az*a.x-ax*a.z)*sf,a.z*f+ax*a.y*sf+az*d*(1.0-f));a.y+=(1.0-alive)*.17;
 let c=cos(p.w);let sn=sin(p.w);return vec3f(a.x*c+a.z*sn,a.y,-a.x*sn+a.z*c)+p.xyz;
}`);
// Inverse-transpose of the same gait, type stretch/shear, fall and heading as bodyVertex.
const normalFn=wgslFn(`fn bodyNormal(n:vec3f,q:vec3f,part:f32,p:vec4f,s:vec4f,v:vec4f,time:f32)->vec3f {
 let alive=step(.01,s.x);let heavy=step(1.5,s.w);let runner=step(.5,s.w)-heavy;let gait=sin(time*(6.0+s.y*2.0+runner*4.0-heavy*2.0)+s.y*80.0)*(.48+runner*.18)*alive*(1.0-min(1.0,v.w*5.0));
 // Fragment interpolation can slightly perturb integer part tags; use stable bands.
 var a=n;var y=q.y;
 if(part>.5){var pivot=1.43;var angle=gait;if(part>2.5){pivot=.82;angle=-gait;}if((part>1.5&&part<2.5)||part>3.5){angle=-angle;}
  angle+=(1.0-alive)*sin(s.y*47.0+part*2.3)*.4*min(1.0,v.w*4.0);
  y=(q.y-pivot)*cos(angle)-q.z*sin(angle)+pivot;
  a=vec3f(a.x,a.y*cos(angle)-a.z*sin(angle),a.y*sin(angle)+a.z*cos(angle));
 }
 let scale=(.87+s.y*.28)*(1.0+heavy*.6);a.x/=1.0+heavy*.35-runner*.22;a.y/=1.0+runner*.07;
 if(y*scale*(1.0+runner*.07)>.8){a.y+=runner*.15*a.z;}
 let fall=(1.0-alive)*min(1.0,v.w*(2.6+s.y))*1.49;
 var dx=v.x*cos(p.w)-v.z*sin(p.w);var dz=v.x*sin(p.w)+v.z*cos(p.w);
 if(abs(dx)+abs(dz)<.0000001){dx=sin(s.y*91.0);dz=cos(s.y*91.0);}
 let l=sqrt(dx*dx+dz*dz);let ax=dz/l;let az=-dx/l;
 let f=cos(fall);let sf=sin(fall);let d=ax*a.x+az*a.z;
 a=vec3f(a.x*f-az*a.y*sf+ax*d*(1.0-f),a.y*f+(az*a.x-ax*a.z)*sf,a.z*f+ax*a.y*sf+az*d*(1.0-f));
 let c=cos(p.w);let sn=sin(p.w);return normalize(vec3f(a.x*c+a.z*sn,a.y,-a.x*sn+a.z*c));
}`);

export class Horde{
 constructor(renderer,scene,field,count=12000){this.renderer=renderer;this.count=count;this.field=field;this.stats={kills:0,hits:0,carKills:0,bombKills:0,carContacts:0,contactMs:0,scrap:0,skidKills:0,jetContacts:0,footContactMs:0,cabContactMs:0,meleeHits:0,missileKills:0,botGunKills:0,botRamKills:0,alive:count,nearby:0,recycled:0};
  this.pos=instancedArray(count,'vec4');this.old=instancedArray(count,'vec4');this.vel=instancedArray(count,'vec4');this.state=instancedArray(count,'vec4');this.density=instancedArray(GRID*GRID+4,'uint').toAtomic();this.flow=instancedArray(field.data.slice(),'vec4');this.counters=instancedArray(CROWD_COUNTER_COUNT,'uint').toAtomic();
  this.pressure=new CrowdPressure(count);this.pressureScan=uniform(new T.Vector4());this.pressureOrigin=uniform(new T.Vector2());this.pressureRecruit=uniform(0);
  this.fieldOrigin=uniform(new T.Vector2(field.origin.x,field.origin.z));this.streaming=uniform(1);this.dt=uniform(0);this.time=uniform(0);this.goal=uniform(new T.Vector4(0,1,70,0));this.shot=uniform(new T.Vector4());this.aim=uniform(new T.Vector4(0,0,-1,100));this.blast=uniform(new T.Vector4());this.car=uniform(new T.Vector4());this.carOld=uniform(new T.Vector4());this.tool=uniform(0);this.jet=uniform(new T.Vector4());this.jetOld=uniform(new T.Vector4());
  this.rays=uniformArray(Array.from({length:6},()=>new T.Vector4()));this.melee=uniform(new T.Vector4());this.meleeAim=uniform(new T.Vector4());this.blastType=uniform(3);
  this.defenseOrigins=uniformArray(Array.from({length:2},()=>new T.Vector4()));this.defenseRays=uniformArray(Array.from({length:2},()=>new T.Vector4()));this.defenseIds=uniform(new T.Vector2(-1,-1));
  // Fixed uniforms add allied combat without another storage-buffer binding.
  this.botOrigins=uniformArray(Array.from({length:2},()=>new T.Vector4()));this.botRays=uniformArray(Array.from({length:2},()=>new T.Vector4()));this.botIds=uniform(new T.Vector2(-1,-1));
  this.supportOrigins=uniformArray(Array.from({length:8},()=>new T.Vector4()));this.supportRays=uniformArray(Array.from({length:8},()=>new T.Vector4()));this.carStyle=uniform(new T.Vector4());
  this.botCars=uniformArray(Array.from({length:3},()=>new T.Vector4()));this.botCarsOld=uniformArray(Array.from({length:3},()=>new T.Vector4()));
  this.viewProjection=uniform(new T.Matrix4());this.viewEnabled=uniform(0);
  this.blood=instancedArray(count*3,'vec4');
  Object.assign(this, createKernels(this));
  const geo=QUALITY.liteCrowd?zombieLiteGeometry():zombieGeometry();geo.instanceCount=count;this.trianglesPerEnemy=(geo.index?.count||geo.getAttribute('position').count)/3;
  const p=this.pos.toAttribute(),s=this.state.toAttribute(),v=this.vel.toAttribute();
  // Existing seed and vertex colors select worn fabric hues; no new instance buffers.
  const baseColor=attribute('color','vec3'),fabric=step(.012,baseColor.x.sub(baseColor.y));
  const clothTint=mix(mix(vec3(.63,.85,1.08),vec3(1.08,.64,.52),s.y.mul(3).clamp(0,1)),vec3(.75,.94,.66),s.y.sub(.5).mul(2).clamp(0,1));
  const variedColor=baseColor.mul(mix(vec3(1),clothTint,fabric)).mul(QUALITY.liteCrowd?vec3(1):texture(zombieTexture()).rgb);
  const m=QUALITY.liteCrowd?new T.MeshBasicNodeMaterial():new T.MeshStandardNodeMaterial({roughness:.96});m.positionNode=bodyFn({q:positionGeometry,part:attribute('part','float'),p,s,v,time:this.time});if(!QUALITY.liteCrowd)m.normalNode=transformNormalToView(normalFn({n:normalLocal,q:positionGeometry,part:attribute('part','float'),p,s,v,time:this.time}));m.colorNode=mix(variedColor.mul(mix(vec3(.57,.65,.53),vec3(1.1,.84,.53),s.y)).mul(mix(vec3(1),mix(vec3(1.55,.46,.22),vec3(.47,.66,.85),step(1.5,s.w)),step(.5,s.w))),vec3(1.7,1.6,1.3),step(this.time,s.z)).mul(mix(.32,1,step(.01,s.x)));
  this.mesh=new T.Mesh(geo,m);this.mesh.frustumCulled=false;this.mesh.castShadow=QUALITY.shadows;this.mesh.receiveShadow=QUALITY.shadows;scene.add(this.mesh);
  this.reset();
  this.gore=addGore(this,scene);
 }
 clearBotInputs(){for(const list of [this.supportOrigins?.array,this.supportRays?.array])for(const v of list||[])v.set(0,0,0,0);this.carStyle?.value.set(0,0,0,0);this.botIds.value.set(-1,-1);for(const list of [this.botOrigins,this.botRays,this.botCars,this.botCarsOld])for(const v of list.array)v.set(0,0,0,0);}
 reset(list){this.clearBotInputs();this.pressure?.reset();this.pressureScan?.value.set(0,0,0,0);if(this.pressureRecruit)this.pressureRecruit.value=0;this.streaming.value=list?0:1;this.generation=(this.generation||0)+1;const p=this.pos.value.array,s=this.state.value.array,v=this.vel.value.array;p.fill(0);s.fill(0);v.fill(0);const sites=regionsNear(0,0);let seed=74129;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<this.count;i++){let x,z,hp=90;if(list){const a=list[i];x=a?.x??180;z=a?.z??180;hp=a?(a.hp??90):0;}else{const site=sites[i%sites.length];let tries=0;do{const q=encounterOffset(i,rand()*Math.PI*2,rand());x=site.x+q.x;z=site.z+q.z;}while(++tries<30&&(solid(x,z,2,false)||Math.hypot(x,z-70)<28));if(site.kind==='home'){const q=spawnCrowdOffset(i);x=q.x;z=q.z;}}
    const y=height(x,z),r=rand(),type=list?(list[i]?.type??0):(r>.93?2:r>.73?1:0);if(hp>0)hp=list?(list[i]?.hp??(type===2?340:type===1?60:90)):(type===2?340:type===1?60:90);p.set([x,y,z,0],i*4);s.set([hp,r,-10,list&&!list[i]?-1:type],i*4);v.set([0,0,0,hp?0:10],i*4);
  }
  // Do this after the released RNG sequence so type/HP/speed seeds and guard
  // positions remain byte-identical. Explicit test fixtures are untouched.
  if(!list)for(let i=0;i<this.count;i++)if(!isRegionalGuard(i)){
   let q,attempt=0;do{q=localCrowdOffset(i,attempt++);q.z+=96;}while(solid(q.x,q.z,2)||Math.hypot(q.x,q.z-70)<localCrowdClearance);
   p.set([q.x,height(q.x,q.z),q.z,0],i*4);
  }
  for(const b of [this.blood]){b.value.array.fill(0);for(let i=0;i<this.count*3;i++)b.value.array[i*4+3]=-10;b.value.needsUpdate=true;}
  let alive=0,nearby=0;for(let i=0;i<this.count;i++)if(s[i*4]>0){alive++;if(Math.hypot(p[i*4],p[i*4+2]-70)<=CROWD_PRESSURE.nearbyRadius)nearby++;}
  for(const b of [this.pos,this.state,this.vel])b.value.needsUpdate=true;this.counters.value.array.fill(0);this.counters.value.array[CROWD_COUNTERS.alive]=alive;this.counters.value.array[CROWD_COUNTERS.nearby]=nearby;this.counters.value.needsUpdate=true;this.stats={kills:0,hits:0,carKills:0,bombKills:0,carContacts:0,contactMs:0,scrap:0,skidKills:0,jetContacts:0,footContactMs:0,cabContactMs:0,meleeHits:0,missileKills:0,botGunKills:0,botRamKills:0,alive,nearby,recycled:0};}
 setPressureContext(context){this.pressure.setContext(context);}
 updateFlow(){this.fieldOrigin.value.set(this.field.origin.x,this.field.origin.z);this.flow.value.array.set(this.field.data);this.flow.value.needsUpdate=true;}
 updateView(camera){camera.updateMatrixWorld();this.viewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.viewEnabled.value=1;}
 step(dt,time,goal,shot,blast,car,carOld,tool,jet,jetOld,melee,meleeAim,blastType=3){const pressure=this.pressure.step(dt,time,this.stats,goal);this.pressureScan.value.set(pressure.cursor,pressure.scanCount,this.streaming.value>.5?pressure.budget:0,pressure.epoch);this.pressureRecruit.value=this.streaming.value>.5?pressure.recruitBudget:0;this.pressureOrigin.value.set(pressure.x,pressure.z);this.melee.value.copy(melee);this.meleeAim.value.copy(meleeAim);this.blastType.value=blastType;for(let i=0;i<6;i++)this.rays.array[i].copy(shot.rays[i]);this.dt.value=dt;this.time.value=time;this.goal.value.copy(goal);this.shot.value.copy(shot.origin);this.aim.value.copy(shot.aim);this.blast.value.copy(blast);this.car.value.copy(car);this.carOld.value.copy(carOld);this.tool.value=tool;this.jet.value.copy(jet);this.jetOld.value.copy(jetOld);this.renderer.compute([this.clear,this.snapshot,this.sim,...this.gore.nodes]);}
 async readStats(){if(this.pending)return this.pending;const generation=this.generation;this.pending=(async()=>{try{const b=await this.renderer.getArrayBufferAsync(this.counters.value);if(generation!==this.generation)return this.stats;const c=new Uint32Array(b);this.stats={kills:c[0],hits:c[1],carKills:c[2],bombKills:c[3],carContacts:c[4],contactMs:c[5],scrap:c[6],skidKills:c[7],jetContacts:c[8],footContactMs:c[9],cabContactMs:c[10],meleeHits:c[11],missileKills:c[12],botGunKills:c[13],botRamKills:c[14],alive:c[CROWD_COUNTERS.alive],nearby:c[CROWD_COUNTERS.nearby],recycled:c[CROWD_COUNTERS.recycled]};return this.stats;}finally{this.pending=null;}})();return this.pending;}
 async sample(n=8){const p=new Float32Array(await this.renderer.getArrayBufferAsync(this.pos.value)),s=new Float32Array(await this.renderer.getArrayBufferAsync(this.state.value));return Array.from({length:n},(_,i)=>({x:p[i*4],y:p[i*4+1],z:p[i*4+2],hp:s[i*4]}));}
}


