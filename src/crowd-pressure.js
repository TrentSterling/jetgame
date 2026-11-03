// A fixed pool can sustain an expedition without tying population to the
// lifetime kill score. This director only issues a bounded number of attempts;
// the GPU still checks corpse age, camera visibility and navigable ground.
export const CROWD_COUNTER_COUNT=18;
export const CROWD_COUNTERS=Object.freeze({alive:15,nearby:16,recycled:17});
export const CROWD_PRESSURE=Object.freeze({
 corpseSeconds:12,corpseClearance:24,spawnClearance:66,spawnMin:78,spawnMax:152,
 nearbyRadius:100,scanCount:768,maxPerStep:12,maxDt:.1,
 arrivalSeconds:12,cycleSeconds:80,recoverSeconds:16,buildSeconds:24,
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

export class CrowdPressure{
 constructor(count=12000){this.count=Math.max(1,Math.floor(count));this.reset();}
 reset(time=0){this.credit=0;this.cursor=0;this.lastTime=finite(time,0);this.startedAt=this.lastTime;this.surgeUntil=-Infinity;this.lastSurge=-Infinity;this.pendingSurge=false;this.context={active:false,intensity:0,health:100};this.report={phase:'arrival',budget:0,rate:0,targetNearby:0};}
 setContext(context={}){
  const intensity=clamp(finite(context.intensity,0),0,1.5),active=context.active===true;
  if(active&&intensity>=1.1&&(!this.context.active||this.context.intensity<1.1))this.pendingSurge=true;
  this.context={active,intensity,sheltered:context.sheltered===true,
   x:finite(context.x,NaN),z:finite(context.z,NaN),health:clamp(finite(context.health,100),0,100)};
 }
 step(dt,time,stats={},goal={x:0,z:0}){
  const t=finite(time,0),elapsed=clamp(finite(dt,0),0,CROWD_PRESSURE.maxDt),c=this.context;
  // A checkpoint can move game time backwards. Unspent credits never survive it.
  if(t<this.lastTime){this.credit=0;this.startedAt=t;this.surgeUntil=this.lastSurge=-Infinity;this.pendingSurge=false;}
  this.lastTime=t;
  const age=Math.max(0,t-this.startedAt),cycle=Math.max(0,age-CROWD_PRESSURE.arrivalSeconds)%CROWD_PRESSURE.cycleSeconds;
  let phase=age<CROWD_PRESSURE.arrivalSeconds?'arrival':cycle<CROWD_PRESSURE.recoverSeconds?'recover':cycle<CROWD_PRESSURE.recoverSeconds+CROWD_PRESSURE.buildSeconds?'build':'assault';
  if(this.pendingSurge&&age>=CROWD_PRESSURE.arrivalSeconds){if(t-this.lastSurge>=44){this.surgeUntil=t+18;this.lastSurge=t;}this.pendingSurge=false;}
  if(t<this.surgeUntil)phase='assault';
  else if(t<this.surgeUntil+CROWD_PRESSURE.recoverSeconds)phase='recover';
  // Mission pressure grows inside the wave; it never removes the recovery beat.
  const intensity=c.active?c.intensity:0;
  let targetNearby=phase==='assault'?540:phase==='build'?300:130;
  targetNearby=Math.min(this.count,Math.round(targetNearby*(1+intensity*.65)));
  let maximumRate=phase==='assault'?100:phase==='build'?48:8;
  maximumRate*=1+intensity*.6;
  if(c.health<=30||c.sheltered){phase='recover';targetNearby=Math.min(this.count,90);maximumRate=0;}
  if(phase==='arrival')maximumRate=0;
  const nearby=clamp(finite(stats.nearby,0),0,this.count),alive=clamp(finite(stats.alive,this.count),0,this.count);
  const demand=clamp((targetNearby-nearby)/Math.max(1,targetNearby),0,1);
  const rate=alive>=this.count?0:maximumRate*demand;
  // No stockpiled wave after a pause, full arena, camera turn or low-health lull.
  this.credit=rate>0?Math.min(CROWD_PRESSURE.maxPerStep,this.credit+rate*elapsed):0;
  const budget=Math.min(Math.floor(this.credit+1e-9),this.count-alive);
  this.credit-=budget;
  const cursor=this.cursor;
  this.cursor=(this.cursor+Math.min(this.count,CROWD_PRESSURE.scanCount))%this.count;
  const gx=finite(goal.x,0),gz=finite(goal.z,0);
  // Pull arrivals toward a nearby objective, while keeping their ring inside
  // the player's navigation window. Distant mission markers do not move it.
  const local=c.active&&Number.isFinite(c.x)&&Number.isFinite(c.z)&&Math.hypot(c.x-gx,c.z-gz)<180;
  const x=gx+(local?clamp(c.x-gx,-30,30):0),z=gz+(local?clamp(c.z-gz,-30,30):0);
  this.report={phase,budget,rate,targetNearby,nearby,alive,intensity};
  return {budget,cursor,scanCount:Math.min(this.count,CROWD_PRESSURE.scanCount),epoch:Math.floor(t*.5),x,z,...this.report};
 }
}

function hash(value){let x=value>>>0;x=(x^(x>>>16))>>>0;x=Math.imul(x,0x7feb352d)>>>0;x=(x^(x>>>15))>>>0;x=Math.imul(x,0x846ca68b)>>>0;return (x^(x>>>16))>>>0;}
export function reinforcementPosition(id,attempt,origin,epoch=0){
 const seed=(Math.imul(id,31)+Math.imul(attempt,719)+Math.imul(epoch,2246822519))>>>0;
 const angle=hash(seed)/4294967296*Math.PI*2;
 const radius=CROWD_PRESSURE.spawnMin+hash((seed+0x9e3779b9)>>>0)/4294967296*(CROWD_PRESSURE.spawnMax-CROWD_PRESSURE.spawnMin);
 return {x:origin.x+Math.cos(angle)*radius,z:origin.z+Math.sin(angle)*radius};
}
export const reinforcementWGSL=`fn pressureSpawn(id:u32,attempt:u32,origin:vec2f,epoch:u32)->vec2f{
 let seed=id*31u+attempt*719u+epoch*2246822519u;
 let angle=f32(pressureHash(seed))/4294967296.0*6.28318530718;
 let radius=${CROWD_PRESSURE.spawnMin}.0+f32(pressureHash(seed+0x9e3779b9u))/4294967296.0*${CROWD_PRESSURE.spawnMax-CROWD_PRESSURE.spawnMin}.0;
 return origin+vec2f(cos(angle),sin(angle))*radius;
}
fn pressureHash(value:u32)->u32{var x=value;x=x^(x>>16u);x=x*0x7feb352du;x=x^(x>>15u);x=x*0x846ca68bu;return x^(x>>16u);}`;
