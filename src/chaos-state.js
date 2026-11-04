// Additive v0.15 progression. No renderer, timers, storage or global side effects.
export const VEHICLE_KITS=Object.freeze([
 {id:'ram',name:'RAM PLOW',cost:240,detail:'Less crowd drag; stronger bumper hits',key:'1'},
 {id:'side',name:'SIDE ARMOR',cost:300,detail:'Less crowd damage during broadside drifts',key:'2'},
 {id:'dampers',name:'LANDING DAMPERS',cost:320,detail:'Softer hard landings; faster suspension recovery',key:'3'},
 {id:'scatter',name:'SIDE SCATTERGUNS',cost:450,detail:'LMB adds short-range left and right volleys',key:'4'},
 {id:'mines',name:'REAR MINE RACK',cost:400,detail:'G drops a proximity mine; 3 regenerating charges',key:'5'},
].map((item,index)=>Object.freeze({...item,bit:1<<index})));
export const defaultVehicleKit=()=>({version:1,owned:0,enabled:0});
export function validVehicleKit(v){return v===undefined||!!v&&v.version===1&&Number.isInteger(v.owned)&&v.owned>=0&&v.owned<=31&&Number.isInteger(v.enabled)&&v.enabled>=0&&v.enabled<=31&&(v.enabled&~v.owned)===0;}
export function restoreVehicleKit(v){if(!validVehicleKit(v))throw Error('Invalid vehicle equipment');return v===undefined?defaultVehicleKit():{version:1,owned:v.owned,enabled:v.enabled};}
export function kitEnabled(upgrades,id){const kit=VEHICLE_KITS.find(k=>k.id===id);return !!kit&&!!((upgrades.vehicleKit?.enabled||0)&kit.bit);}
export function purchaseKit(upgrades,id){
 const kit=VEHICLE_KITS.find(k=>k.id===id);if(!kit||!validVehicleKit(upgrades.vehicleKit))return null;
 const state=upgrades.vehicleKit??(upgrades.vehicleKit=defaultVehicleKit());
 if(state.owned&kit.bit){state.enabled^=kit.bit;return {purchased:false,equipped:!!(state.enabled&kit.bit),kit};}
 if(!Number.isFinite(upgrades.scrap)||upgrades.scrap<kit.cost)return null;
 upgrades.spent+=kit.cost;state.owned|=kit.bit;state.enabled|=kit.bit;
 return {purchased:true,equipped:true,kit};
}
export function awardKit(upgrades){
 const state=upgrades.vehicleKit??(upgrades.vehicleKit=defaultVehicleKit());
 const kit=VEHICLE_KITS.find(k=>!(state.owned&k.bit));
 if(!kit){upgrades.rewards+=180;return null;}state.owned|=kit.bit;state.enabled|=kit.bit;return kit;
}
export const CHAOS_SITES=Object.freeze([
 {id:'bowl',name:'DUNE BOWL',x:-430,z:360,kind:'horde',goal:60,reward:220,radius:145},
 {id:'garage',name:'RIDGELINE GARAGE',x:550,z:-360,kind:'garage',goal:25,reward:140,radius:125},
 {id:'cache',name:'LOST SUPPLY TRUCK',x:210,z:650,kind:'cache',goal:15,reward:180,radius:125},
]);
export const defaultChaosProgress=()=>({version:1,done:0,kills:[0,0,0]});
export function validChaosProgress(v){return v===undefined||!!v&&v.version===1&&Number.isInteger(v.done)&&v.done>=0&&v.done<=7&&Array.isArray(v.kills)&&v.kills.length===3&&v.kills.every((n,i)=>Number.isInteger(n)&&n>=0&&n<=CHAOS_SITES[i].goal);}
export function restoreChaosProgress(v){if(!validChaosProgress(v))throw Error('Invalid wasteland encounters');return v===undefined?defaultChaosProgress():{version:1,done:v.done,kills:v.kills.slice()};}
// A short burst budget limits rewards independently of callback cadence. Never
// infer kills from contacts, and never replay pre-restore or other-seat kills.
export class DemolitionChain{
 constructor(){this.reset();}
 reset(){this.baseline=null;this.token=null;this.budget=.18;this.landingUntil=0;this.tally=0;this.gained=0;this.displayUntil=0;this.lastTime=0;}
 advance(dt){this.budget=Math.min(.18,this.budget+Math.max(0,Math.min(.1,dt))*.10);}
 landed(time,airTime,speed){if(airTime>.35&&speed>8)this.landingUntil=time+2;}
 sample(stats,{body,mode,token,active,time}){
  const values=[stats.carKills,stats.skidKills,stats.kills].map(n=>Number.isFinite(n)?Math.max(0,n):0);
  const previous=this.baseline;this.baseline=values;
  if(token!==this.token||!previous||values.some((n,i)=>n<previous[i])){this.token=token;return {kills:0,boost:0,total:0};}
  if(!active||!body||body.health<=0)return {kills:0,boost:0,total:0};
  const kills=mode==='car'?values[0]-previous[0]:mode==='jet'?values[1]-previous[1]:0;
  const total=Math.max(0,values[2]-previous[2]);
  if(kills<=0)return {kills:0,boost:0,total};
  const landing=time<=this.landingUntil&&this.landingUntil>0;
  const gain=Math.min(this.budget,kills*.006+(landing?.035:0),Math.max(0,1-(body.boost||0)));
  body.boost=Math.min(1,(body.boost||0)+gain);this.budget-=gain;
  if(landing)this.landingUntil=0;
  if(time>this.displayUntil){this.tally=0;this.gained=0;}
  this.tally+=kills;this.gained+=gain;this.displayUntil=time+1.7;this.lastTime=time;
  return {kills,boost:gain,total};
 }
 label(time){return time<this.displayUntil&&this.gained>.001?`${this.tally} SMASHED  +${Math.round(this.gained*100)}% BOOST`:'';}
}
export function recordEncounterKills(progress,pos,count){
 if(!Number.isFinite(count)||count<=0)return;
 for(let i=0;i<CHAOS_SITES.length;i++){const s=CHAOS_SITES[i];if(!(progress.done&(1<<i))&&Math.hypot(pos.x-s.x,pos.z-s.z)<s.radius)progress.kills[i]=Math.min(s.goal,progress.kills[i]+Math.floor(count));}
}
export function claimEncounter(progress,index,upgrades){
 const site=CHAOS_SITES[index];if(!site||(progress.done&(1<<index))||progress.kills[index]<site.goal)return null;
 // Mark and credit synchronously; the existing save follow-up captures both.
 progress.done|=1<<index;upgrades.rewards+=site.reward;
 const kit=site.kind==='garage'?awardKit(upgrades):null;return {site,kit};
}

