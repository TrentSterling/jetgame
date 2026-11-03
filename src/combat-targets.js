// Reuses the allies' four-Hz position/state snapshot. No GPU reads originate
// here. Rebuild the spatial index only when that shared snapshot changes.
export const COMBAT_TARGET_LIMITS=Object.freeze({
 cellSize:8,maxSnapshotAge:.55,predictionSeconds:.25,maxActorSpeed:14,
 coneDegrees:10,maxDistance:150,maxAimCells:1024,maxAimActors:1024,maxLOS:8,
 maxSweepCells:256,maxSweepActors:256,
});
const C=COMBAT_TARGET_LIMITS,EPS=1e-9,DEG=Math.PI/180;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const pointAt=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

// Same seed/type scaling and runner lean as Horde.bodyVertex. A torso capsule
// covers feet through crown; arms do not turn near misses into contact hits.
export function actorCapsule(position,type=0,seed=.5,heading=0,out=null){
 if(!finite(position)||![0,1,2].includes(type)||!Number.isFinite(seed)||!Number.isFinite(heading))return null;
 const heavy=type===2?1:0,runner=type===1?1:0,scale=(.87+clamp(seed,0,1)*.28)*(1+heavy*.6);
 const radius=.32*scale*(1+heavy*.35-runner*.22),height=1.88*scale*(1+runner*.07);
 const low=radius+.025*scale,high=height-radius;
 const result=out||{a:{},b:{},center:{}},a=result.a,b=result.b,center=result.center,sine=Math.sin(heading),cosine=Math.cos(heading);
 const az=-runner*Math.max(0,low-.8)*.15,bz=-.035*scale-runner*Math.max(0,high-.8)*.15;
 a.x=position.x+sine*az;a.y=position.y+low;a.z=position.z+cosine*az;b.x=position.x+sine*bz;b.y=position.y+high;b.z=position.z+cosine*bz;
 center.x=(a.x+b.x)*.5;center.y=(a.y+b.y)*.5;center.z=(a.z+b.z)*.5;result.radius=radius;result.height=height;result.scale=scale;return result;
}

function sphereFraction(ox,oy,oz,dx,dy,dz,radius){
 const c=ox*ox+oy*oy+oz*oz-radius*radius;if(c<=0)return 0;
 const a=dx*dx+dy*dy+dz*dz;if(a<EPS)return Infinity;
 const b=ox*dx+oy*dy+oz*dz,disc=b*b-a*c;if(disc<0)return Infinity;
 const t=(-b-Math.sqrt(Math.max(0,disc)))/a;return t>=0&&t<=1?t:Infinity;
}

// Exact segment against a round capsule, including endpoints and initial
// overlap. Returns the first fraction of the segment, or null for a miss.
export function segmentCapsuleFraction(start,end,a,b,radius){
 if(!finite(start)||!finite(end)||!finite(a)||!finite(b)||!Number.isFinite(radius)||radius<0)return null;
 const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,ax=b.x-a.x,ay=b.y-a.y,az=b.z-a.z,ox=start.x-a.x,oy=start.y-a.y,oz=start.z-a.z,axis2=ax*ax+ay*ay+az*az;
 if(axis2<EPS){const t=sphereFraction(ox,oy,oz,dx,dy,dz,radius);return Number.isFinite(t)?t:null;}
 const along=(ox*ax+oy*ay+oz*az)/axis2,nearest=clamp(along,0,1),sx=ox-ax*nearest,sy=oy-ay*nearest,sz=oz-az*nearest;
 if(sx*sx+sy*sy+sz*sz<=radius*radius)return 0;
 let best=Math.min(sphereFraction(ox,oy,oz,dx,dy,dz,radius),sphereFraction(ox-ax,oy-ay,oz-az,dx,dy,dz,radius));
 const motion=(dx*ax+dy*ay+dz*az)/axis2,qx=dx-ax*motion,qy=dy-ay*motion,qz=dz-az*motion,rx=ox-ax*along,ry=oy-ay*along,rz=oz-az*along;
 const aa=qx*qx+qy*qy+qz*qz,bb=qx*rx+qy*ry+qz*rz,cc=rx*rx+ry*ry+rz*rz-radius*radius,disc=bb*bb-aa*cc;
 if(aa>EPS&&disc>=0){
  for(const t of [(-bb-Math.sqrt(Math.max(0,disc)))/aa,(-bb+Math.sqrt(Math.max(0,disc)))/aa]){
   const h=along+motion*t;if(t>=0&&t<=1&&h>=0&&h<=1)best=Math.min(best,t);
  }
 }
 return Number.isFinite(best)?best:null;
}

const overlaps=(a,b)=>a.x0<=b.x1&&a.x1>=b.x0&&a.y0<=b.y1&&a.y1>=b.y0&&a.z0<=b.z1&&a.z1>=b.z0;
function boxFraction(start,end,box,radius=0){
 let lo=0,hi=1;
 for(const axis of ['x','y','z']){
  const d=end[axis]-start[axis],min=box[axis+'0']-radius,max=box[axis+'1']+radius;
  if(Math.abs(d)<EPS){if(start[axis]<min||start[axis]>max)return Infinity;continue;}
  let a=(min-start[axis])/d,b=(max-start[axis])/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return Infinity;
 }
 return lo;
}
export class CombatTargets{
 constructor({snapshot,generation,visible}={}){
  this.source=snapshot;this.getGeneration=typeof generation==='function'?generation:()=>this.source?.latest?.generation;
  // Without a world visibility test, assistance stays off. Physical missile
  // contacts are still available; Ordnance compares them with world contacts.
  this.visible=typeof visible==='function'?visible:()=>false;
  this.time=0;this.indexed=null;this.epoch=-1;this.builds=0;this.ready=false;this.count=0;
  // Packed reusable records: xyz, heading, seed, type, hp, velocity xyz.
  // Capsules are lazy query-time data; rebuilding 12k records does not create
  // 12k geometry objects or sort a hierarchy on the animation thread.
  this.data=new Float64Array(0);this.stamps=new Uint32Array(0);this.next=new Int32Array(0);this.shapes=[];this.grid=null;this.shapePosition={};this.sweepA={};this.sweepB={};this.sweepEnd={};
  this.lastAim={actors:0,nodes:0,los:0,limited:false};this.lastSweep={actors:0,nodes:0,limited:false};
 }
 reset(){this.indexed=null;this.epoch=-1;this.ready=false;this.count=0;}
 reserve(capacity){
  if(capacity<=this.stamps.length)return;
  const data=new Float64Array(capacity*10),stamps=new Uint32Array(capacity);data.set(this.data);stamps.set(this.stamps);this.data=data;this.stamps=stamps;this.next=new Int32Array(capacity);
  let size=32;while(size<capacity*2)size*=2;
  this.grid={mask:size-1,x:new Float64Array(size),z:new Float64Array(size),stamps:new Uint32Array(size),heads:new Int32Array(size),bounds:new Float64Array(size*6),boxes:[]};
 }
 slot(x,z,stamp=this.builds){
  const grid=this.grid;let slot=(Math.imul(x|0,73856093)^Math.imul(z|0,19349663))&grid.mask;
  while(grid.stamps[slot]===stamp&&(grid.x[slot]!==x||grid.z[slot]!==z))slot=(slot+1)&grid.mask;
  return slot;
 }
 update(time){
  this.time=time;const snapshot=this.source?.latest,epoch=this.source?.epoch??0;
  if(!snapshot||!Number.isFinite(time)||!Number.isFinite(snapshot.time)||snapshot.generation!==this.getGeneration()||time<snapshot.time-1e-6){this.reset();return false;}
  if(snapshot!==this.indexed||epoch!==this.epoch){
   const previous=this.indexed;
   const interval=snapshot.time-(previous?.time??-Infinity),continuous=epoch===this.epoch&&previous?.generation===snapshot.generation&&interval>=.02&&interval<=.65;
   const positions=snapshot.positions,states=snapshot.states,stamp=this.builds+1,capacity=Math.floor((positions?.length??0)/4);
   this.reserve(capacity);
   const data=this.data,stamps=this.stamps,grid=this.grid;this.count=0;
   for(const target of snapshot.targets||[]){
    const id=target.id,k=id*4;if(!Number.isInteger(id)||id<0||!positions||!states||k+3>=positions.length||k+3>=states.length||!Number.isFinite(states[k])||!(states[k]>0))continue;
    const x=positions[k],y=positions[k+1],z=positions[k+2],heading=positions[k+3],seed=states[k+1],type=states[k+3],cellX=Math.floor(x/C.cellSize),cellZ=Math.floor(z/C.cellSize);
    if(!Number.isFinite(y)||!Number.isFinite(heading)||!Number.isFinite(seed)||!Number.isSafeInteger(cellX)||!Number.isSafeInteger(cellZ)||type<0||type>2||!Number.isInteger(type)||stamps[id]===stamp)continue;
    const at=id*10;let vx=0,vy=0,vz=0;
    if(continuous&&stamps[id]===this.builds&&data[at+4]===seed&&data[at+5]===type&&states[k]<=data[at+6]){
     vx=(x-data[at])/interval;vy=(y-data[at+1])/interval;vz=(z-data[at+2])/interval;
     // Relocated/recycled actors never extrapolate across their old location.
     if(vx*vx+vy*vy+vz*vz>C.maxActorSpeed*C.maxActorSpeed)vx=vy=vz=0;
    }
    data[at]=x;data[at+1]=y;data[at+2]=z;data[at+3]=heading;data[at+4]=seed;data[at+5]=type;data[at+6]=states[k];data[at+7]=vx;data[at+8]=vy;data[at+9]=vz;stamps[id]=stamp;this.count++;
    const slot=this.slot(cellX,cellZ,stamp),box=slot*6,px=vx*C.predictionSeconds,py=vy*C.predictionSeconds,pz=vz*C.predictionSeconds;
    // A conservative envelope contains every seeded/type-scaled capsule plus
    // the complete short prediction. Exact shapes are evaluated only on hits.
    const x0=x+Math.min(0,px)-1.2,x1=x+Math.max(0,px)+1.2,y0=y+Math.min(0,py),y1=y+Math.max(0,py)+3.5,z0=z+Math.min(0,pz)-1.2,z1=z+Math.max(0,pz)+1.2;
    const bounds=grid.bounds;
    if(grid.stamps[slot]!==stamp){
     grid.stamps[slot]=stamp;grid.x[slot]=cellX;grid.z[slot]=cellZ;grid.heads[slot]=-1;
     bounds[box]=x0;bounds[box+1]=x1;bounds[box+2]=y0;bounds[box+3]=y1;bounds[box+4]=z0;bounds[box+5]=z1;
    }else{
     bounds[box]=Math.min(bounds[box],x0);bounds[box+1]=Math.max(bounds[box+1],x1);bounds[box+2]=Math.min(bounds[box+2],y0);bounds[box+3]=Math.max(bounds[box+3],y1);bounds[box+4]=Math.min(bounds[box+4],z0);bounds[box+5]=Math.max(bounds[box+5],z1);
    }
    this.next[id]=grid.heads[slot];grid.heads[slot]=id;
   }
   this.indexed=snapshot;this.epoch=epoch;this.builds=stamp;
  }
  this.ready=time-snapshot.time<=C.maxSnapshotAge;return this.ready;
 }
 current(){return this.update(this.time);}
 live(id){const s=this.indexed.states,k=id*4,at=id*10;return this.stamps[id]===this.builds&&s[k]>0&&s[k+1]===this.data[at+4]&&s[k+3]===this.data[at+5];}
 shape(id){
  let shape=this.shapes[id];if(shape?.stamp===this.builds)return shape;
  const data=this.data,at=id*10,position=this.shapePosition;position.x=data[at];position.y=data[at+1];position.z=data[at+2];shape=actorCapsule(position,data[at+5],data[at+4],data[at+3],shape);
  shape.stamp=this.builds;this.shapes[id]=shape;return shape;
 }
 motion(id,time){const age=clamp(time-this.indexed.time,0,C.predictionSeconds),at=id*10;return {x:this.data[at+7]*age,y:this.data[at+8]*age,z:this.data[at+9]*age};}
 roots(box,maxCells){
  // A record is keyed by its feet. Cover its whole shape and capped prediction
  // even if either crosses a cell boundary after the last shared sample.
  const margin=1.2+C.maxActorSpeed*C.predictionSeconds;
  const x0=Math.floor((box.x0-margin)/C.cellSize),x1=Math.floor((box.x1+margin)/C.cellSize),z0=Math.floor((box.z0-margin)/C.cellSize),z1=Math.floor((box.z1+margin)/C.cellSize);
  if(![x0,x1,z0,z1].every(Number.isSafeInteger)||(x1-x0+1)*(z1-z0+1)>maxCells)return null;
  const roots=[];if(!this.grid)return roots;
  const grid=this.grid,bounds=grid.bounds;
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const slot=this.slot(x,z);if(grid.stamps[slot]!==this.builds)continue;
   let node=grid.boxes[slot];if(!node)node=grid.boxes[slot]={slot,box:{},stamp:0};
   if(node.stamp!==this.builds){const at=slot*6,b=node.box;b.x0=bounds[at];b.x1=bounds[at+1];b.y0=bounds[at+2];b.y1=bounds[at+3];b.z0=bounds[at+4];b.z1=bounds[at+5];node.stamp=this.builds;}
   if(overlaps(node.box,box))roots.push(node);
  }
  return roots;
 }
 aim(origin,direction,{preferredId=null,maxDistance=C.maxDistance,coneDegrees=C.coneDegrees}={}){
  const report=this.lastAim={actors:0,nodes:0,los:0,limited:false};
  if(!this.current()||!finite(origin)||!finite(direction)||!Number.isFinite(maxDistance)||!Number.isFinite(coneDegrees))return null;
  const length=Math.hypot(direction.x,direction.y,direction.z);if(!Number.isFinite(length)||length<EPS||maxDistance<=0||coneDegrees<=0)return null;
  maxDistance=Math.min(C.maxDistance,maxDistance);coneDegrees=Math.min(C.coneDegrees,coneDegrees);
  const forward={x:direction.x/length,y:direction.y/length,z:direction.z/length},cosine=Math.cos(coneDegrees*DEG),spread=maxDistance*Math.sin(coneDegrees*DEG);
  const end={x:origin.x+forward.x*maxDistance,y:origin.y+forward.y*maxDistance,z:origin.z+forward.z*maxDistance},box={};
  for(const axis of ['x','y','z']){box[axis+'0']=Math.min(origin[axis],end[axis])-spread;box[axis+'1']=Math.max(origin[axis],end[axis])+spread;}
  const roots=this.roots(box,C.maxAimCells);if(!roots){report.limited=true;return null;}
  const ranked=[];
  const age=clamp(this.time-this.indexed.time,0,C.predictionSeconds),data=this.data;
  const consider=id=>{
   report.actors++;if(!this.live(id))return;
   const center=this.shape(id).center,at=id*10,x=center.x+data[at+7]*age,y=center.y+data[at+8]*age,z=center.z+data[at+9]*age,dx=x-origin.x,dy=y-origin.y,dz=z-origin.z,distance=Math.hypot(dx,dy,dz);
   if(distance<EPS||distance>maxDistance)return;
   const alignment=(dx*forward.x+dy*forward.y+dz*forward.z)/distance;if(alignment<cosine)return;
   const score=((1-alignment)/(1-cosine)+distance/maxDistance*.06)*(id===preferredId ? .72 : 1);
   let index=ranked.findIndex(other=>score<other.score||score===other.score&&(distance<other.distance||distance===other.distance&&id<other.id));if(index<0)index=ranked.length;if(index>=C.maxLOS)return;
   const candidate={id,point:{x,y,z},direction:{x:dx/distance,y:dy/distance,z:dz/distance},distance,generation:this.indexed.generation,score};
   ranked.splice(index,0,candidate);if(ranked.length>C.maxLOS)ranked.pop();
  };
  if(Number.isInteger(preferredId)&&this.live(preferredId))consider(preferredId);
  const queue=[];
  for(const bucket of roots){
   const b=bucket.box,dx=(b.x0+b.x1)*.5-origin.x,dy=(b.y0+b.y1)*.5-origin.y,dz=(b.z0+b.z1)*.5-origin.z;
   const distance=Math.hypot(dx,dy,dz),radius=Math.hypot(b.x1-b.x0,b.y1-b.y0,b.z1-b.z0)*.5,minDistance=Math.max(0,distance-radius);
   if(minDistance>maxDistance)continue;
   const alignment=distance>EPS?clamp((dx*forward.x+dy*forward.y+dz*forward.z)/distance,-1,1):1,sine=Math.min(1,radius/Math.max(EPS,distance)),tangent=Math.sqrt(Math.max(0,1-sine*sine));
   const bestAlignment=distance<=radius||alignment>=tangent?1:alignment*tangent+Math.sqrt(Math.max(0,1-alignment*alignment))*sine;
   if(bestAlignment<cosine)continue;
   queue.push({bucket,score:(1-bestAlignment)/(1-cosine)+minDistance/maxDistance*.06});
  }
  queue.sort((a,b)=>a.score-b.score);
  for(const {bucket,score} of queue){
   if(ranked.length===C.maxLOS&&score>ranked.at(-1).score)break;report.nodes++;
   for(let id=this.grid.heads[bucket.slot];id>=0;id=this.next[id]){if(id===preferredId)continue;if(report.actors>=C.maxAimActors){report.limited=true;break;}consider(id);}if(report.limited)break;
  }
  for(const candidate of ranked){report.los++;if(this.visible(origin,candidate.point)){delete candidate.score;return candidate;}}
  return null;
 }
 sweep(start,end,{radius=.14,time=this.time,dt=0}={}){
  const report=this.lastSweep={actors:0,nodes:0,limited:false};
  if(!this.current()||![start,end].every(finite)||!Number.isFinite(radius)||radius<0||radius>2||!Number.isFinite(time)||!Number.isFinite(dt)||dt<0||dt>.25)return null;
  // Ordnance supplies the beginning time of each substep. Extrapolation can
  // only cover the current update, never an arbitrary future/frozen target.
  if(time<this.indexed.time-.25||time>this.time+.001||time+dt>this.time+.251)return null;
  const box={};for(const axis of ['x','y','z']){box[axis+'0']=Math.min(start[axis],end[axis])-radius;box[axis+'1']=Math.max(start[axis],end[axis])+radius;}
  const roots=this.roots(box,C.maxSweepCells);if(!roots){report.limited=true;return null;}
  const queue=[];let best=null,bestFraction=Infinity;
  const age=clamp(time-this.indexed.time,0,C.predictionSeconds),motionTime=clamp(time+dt-this.indexed.time,0,C.predictionSeconds)-age,data=this.data,a=this.sweepA,b=this.sweepB,relativeEnd=this.sweepEnd;
  for(const bucket of roots){const fraction=boxFraction(start,end,bucket.box,radius);if(Number.isFinite(fraction))queue.push({bucket,fraction});}
  queue.sort((a,b)=>a.fraction-b.fraction);
  for(const {bucket,fraction} of queue){
   if(fraction>=bestFraction)break;report.nodes++;
   for(let id=this.grid.heads[bucket.slot];id>=0;id=this.next[id]){
    if(report.actors>=C.maxSweepActors){report.limited=true;return null;}report.actors++;if(!this.live(id))continue;
    const shape=this.shape(id),at=id*10,vx=data[at+7],vy=data[at+8],vz=data[at+9];
    a.x=shape.a.x+vx*age;a.y=shape.a.y+vy*age;a.z=shape.a.z+vz*age;b.x=shape.b.x+vx*age;b.y=shape.b.y+vy*age;b.z=shape.b.z+vz*age;
    relativeEnd.x=end.x-vx*motionTime;relativeEnd.y=end.y-vy*motionTime;relativeEnd.z=end.z-vz*motionTime;
    const fraction=segmentCapsuleFraction(start,relativeEnd,a,b,shape.radius+radius);
    if(fraction!==null&&(fraction<bestFraction||fraction===bestFraction&&id<best.id)){
     bestFraction=fraction;best={id,point:pointAt(start,end,fraction),fraction,distance:Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)*fraction,generation:this.indexed.generation};
    }
   }
  }
  return best;
 }
 report(){return {ready:this.ready,builds:this.builds,targets:this.count,age:this.indexed?Math.max(0,this.time-this.indexed.time):null,aim:{...this.lastAim},sweep:{...this.lastSweep}};}
}
