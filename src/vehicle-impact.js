export const DENT_KEYS=Object.freeze(['dentFL','dentFR','dentRL','dentRR','dentL','dentR']);
export const PANEL_ZONES=Object.freeze([[0,1],[2,3],[4],[5]]);
export const panelWear=(body,index)=>Math.max(...PANEL_ZONES[index].map(i=>Math.max(0,Math.min(1,body[DENT_KEYS[i]]||0))));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function resetVehicleDamage(body){for(const key of DENT_KEYS)body[key]=0;body.bloodCoat=0;body.panelMask=0;}
export function validVehicleDamage(body){return (body.panelMask===undefined||(Number.isInteger(body.panelMask)&&body.panelMask>=0&&body.panelMask<=15))&&[...DENT_KEYS,'bloodCoat'].every(k=>body[k]===undefined||(Number.isFinite(body[k])&&body[k]>=0&&body[k]<=1));}
export function repairVehicleDamage(body,fraction=1){const keep=1-clamp(fraction);for(const key of DENT_KEYS)body[key]=clamp(body[key]||0)*keep;body.bloodCoat=clamp(body.bloodCoat||0)*keep;if(fraction>=.6)body.panelMask=0;}
// Speeds are collision-normal m/s, not forward speed. Ordinary dune landings
// are free. Severe drops still hurt, but do not instantly consume a fresh hull.
export function carImpactDamage(speed,kind='wall'){
 if(!Number.isFinite(speed)||speed<=0)return 0;
 return kind==='landing'?Math.min(30,Math.max(0,speed-22)*.65):Math.min(38,Math.max(0,speed-8)*.48);
}
export function dentVehicle(body,speed,kind='wall',vx=body.vx||0,vz=body.vz||0){
 if(!Number.isFinite(speed)||speed<=0)return false;
 const before=DENT_KEYS.map(k=>clamp(body[k]||0)),oldMask=body.panelMask||0;let struck=0;
 if(kind==='crowd'){
  body.bloodCoat=clamp((body.bloodCoat||0)+Math.min(.22,speed*.007));
  // Bodies are not concrete walls: mostly paint/blood, very little metal wear.
  const amount=Math.min(.015,speed*.0006);body.dentFL=clamp(before[0]+amount);body.dentFR=clamp(before[1]+amount);
 }else if(kind==='landing'){
  const amount=clamp((speed-22)/95,0,.28);if(!amount)return false;
  struck=3;for(let i=0;i<4;i++)body[DENT_KEYS[i]]=clamp(before[i]+amount*(i<2?1:.65));
 }else{
  if(speed<8||!Number.isFinite(vx)||!Number.isFinite(vz))return false;
  const c=Math.cos(body.yaw||0),s=Math.sin(body.yaw||0),x=c*vx-s*vz,z=s*vx+c*vz,length=Math.hypot(x,z);
  if(length<.001)return false;
  const amount=clamp((speed-6)/65,0,.65),side=x/length,forward=-z/length;
  if(Math.abs(forward)>.25){const offset=forward>0?0:2;struck|=forward>0?1:2;
   body[DENT_KEYS[offset]]=clamp(before[offset]+amount*Math.abs(forward)*clamp(1-side,.12,1));
   body[DENT_KEYS[offset+1]]=clamp(before[offset+1]+amount*Math.abs(forward)*clamp(1+side,.12,1));
  }
  if(Math.abs(side)>.25)struck|=side<0?4:8;
  const slot=side<0?4:5;body[DENT_KEYS[slot]]=clamp(before[slot]+amount*Math.abs(side));
 }
 // Tear only under a substantial hard impact. Mowing crowds can loosen metal,
 // but is never treated as a wall collision or a reason to lose bodywork.
 if((kind==='wall'&&speed>=24)||(kind==='landing'&&speed>=34)){
  let mask=body.panelMask||0;
  for(let i=0;i<4;i++)if(panelWear(body,i)>=.78&&(struck&(1<<i)))mask|=1<<i;
  body.panelMask=mask;
 }
 return kind==='crowd'||(body.panelMask||0)!==oldMask||DENT_KEYS.some((k,i)=>(body[k]||0)!==before[i]);
}
