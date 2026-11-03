import {missionRules,supplyCount} from './mission-rules.js';

const unit=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
const distanceText=d=>d>=1000?(d/1000).toFixed(1)+' KM':Math.round(d)+' M';

// Presentation reads the actual mission state. It never advances progress or
// guesses readiness by parsing a sentence produced for the old DOM interface.
export function missionHUD(expeditions,pos,mode,{groundHeight=0,vehicleId=null}={}){
 const destination=expeditions.target;
 const result={mission:'FIND SURVIVORS',missionDetail:'Explore beyond the airfield',action:'',actionKey:'',interactionProgress:0};
 if(!destination)return result;
 result.mission=destination.kind==='return'?'RETURN TO REFUGE':destination.action||'RESCUE SURVIVORS';
 result.missionDetail=destination.name+' · '+distanceText(destination.distance);
 if(expeditions.party){
  result.missionDetail=expeditions.party.count+' ABOARD · '+result.missionDetail;
  if(mode==='foot'||(vehicleId!==null&&vehicleId!==expeditions.party.vehicle))result.action='Return to your transport';
  else if(destination.distance<35)result.action='Slow down to unload';
  return result;
 }
 const site=expeditions.sites.get(destination.id);
 if(!site||destination.distance>120)return result;
 const rules=missionRules(site),state=site.state;
 if(site.kind==='settlement'&&state.alarmed&&!site.ready){
  result.action='Defend shelter · '+Math.ceil(rules.hold-state.defense)+' S';
  result.interactionProgress=unit(state.defense/rules.hold);
 }else if(site.ready&&site.kind==='relay'){
  result.action=mode==='foot'?'Hold the relay · '+Math.ceil((1-state.signal/12)*rules.hold)+' S':'Defend relay on foot';
  result.interactionProgress=unit(state.signal/12);
 }else if(expeditions.boarding?.id===site.id){
  result.action='Keep stopped · '+expeditions.boarding.arrived+'/'+site.count+' aboard';
  result.interactionProgress=unit(expeditions.boarding.arrived/site.count);
 }else if(site.ready){
  result.action=mode==='foot'?'Team following · Find a '+site.count+'-seat carrier':'Stop near team · '+site.count+' seats needed';
 }else{
  const kit=site.kind==='quarry'&&!state.kit,supplies=site.kind==='depot'&&state.supplyMask!==3;
  const taskDistance=Math.hypot(pos.x-destination.x,pos.z-destination.z);
  const reachable=mode==='foot'&&(pos.y??0)-groundHeight<3&&taskDistance<(kit||supplies?3:8);
  result.action=kit?'Collect medical supplies':supplies?'Collect supplies · '+supplyCount(state.supplyMask)+'/2':site.kind==='quarry'?'Stabilize the team':site.kind==='settlement'?'Start evacuation':'Activate radio';
  if(reachable){result.actionKey='F';result.action='Hold to '+result.action.toLowerCase();}
  else if(mode!=='foot')result.action='Exit vehicle to help the team';
  else result.action='Reach '+(kit?'medical crate':supplies?'supply crate':'shelter');
  result.interactionProgress=unit(expeditions.progress/(kit||supplies?rules.pickup:rules.repair));
 }
 return result;
}
