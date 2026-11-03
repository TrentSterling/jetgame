// Small explicit contracts give each site a different reason to stop and fight.
// Durations are simulation seconds; all progress survives an interrupted fight.
export const MISSION_RULES=Object.freeze({
 settlement:{name:'Shelter breakout',repair:4,hold:24,radius:42},
 relay:{name:'Relay defense',repair:5,hold:30,radius:28},
 quarry:{name:'Medical evacuation',repair:4,pickup:1.2,radius:42},
 depot:{name:'Supply convoy',repair:3,pickup:1.2,radius:42},
});
export const SUPPLY_POINTS=Object.freeze([{x:-9,z:12},{x:19,z:8}]);
export const missionRules=site=>MISSION_RULES[site.kind]||MISSION_RULES.settlement;
export const supplyCount=mask=>Number(!!(mask&1))+Number(!!(mask&2));
export function missionDefaults(site,state){
 const ready=!!site.ready;
 return {...state,alarmed:state.alarmed??ready,defense:state.defense??(ready?missionRules(site).hold||0:0),supplyMask:state.supplyMask??(ready&&site.kind==='depot'?3:0)};
}
export function survivorSpeed(kind,distance,boarding=false){
 const medical=kind==='quarry';
 // Stabilized evacuees can run. Catch-up speed is bounded and never teleports.
 return boarding?(medical?4.6:5.8):distance>15?(medical?6:7.4):(medical?4:5.2);
}
