import {shapeFlightAxis,FLIGHT_TUNING} from './flight-control.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Mouse is a persistent virtual stick, not a world-space point the nose chases.
// Discard excess travel at the edge so a reverse motion responds immediately.
export function moveFlightMouse(x,y,dx,dy){
 const safe=v=>Number.isFinite(v)?v:0;
 return {x:clamp(safe(x)+safe(dx)*.004,-1,1),y:clamp(safe(y)+safe(dy)*.004,-1,1)};
}
export function flightInputFeedback(x,y,body){
 x=clamp(Number.isFinite(x)?x:0,-1,1);y=clamp(Number.isFinite(y)?y:0,-1,1);
 const pitch=body.pitch??0,up=y< -FLIGHT_TUNING.deadZone,down=y>FLIGHT_TUNING.deadZone;
 const limit=up&&pitch>FLIGHT_TUNING.pitchMax-.025?'CLIMB LIMIT':down&&pitch<FLIGHT_TUNING.pitchMin+.025?'DIVE LIMIT':Math.max(Math.abs(x),Math.abs(y))>.99?'FULL INPUT':'';
 return {x,y,turn:shapeFlightAxis(x),pitch:shapeFlightAxis(y),limit,semantics:'persistent virtual stick',pitchResponse:body.flightPitchLoad??0};
}
