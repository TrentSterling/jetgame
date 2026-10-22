// Original compact control law for Horde3D's 14-62 m/s world. Commands are
// dimensionless; demand is acceleration in g, response rates are radians/s.
// This is an assisted point-mass model, not a six-DOF fighter simulation.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const axis=v=>Number.isFinite(v)?clamp(v,-1,1):0;
const approach=(v,target,maximum)=>v+clamp(target-v,-maximum,maximum);
export const FLIGHT_TUNING=Object.freeze({gravity:9.81,deadZone:.035,expo:1.5,
 pitchUpLoad:2.4,pitchDownLoad:1.6,loadOnset:4.5,
 bankLimit:1.05,bankRate:1.65,bankAcceleration:6,bankGain:6,inducedDrag:.5});

export function shapeFlightAxis(value){
 const v=axis(value),m=Math.abs(v),t=FLIGHT_TUNING;
 return m<=t.deadZone?0:Math.sign(v)*((m-t.deadZone)/(1-t.deadZone))**t.expo;
}
export function flightCommand(input={}){
 return {throttle:axis(input.throttle),pitch:shapeFlightAxis(input.pitch),
  turn:clamp(shapeFlightAxis(input.yaw)+shapeFlightAxis(input.bank)*.85,-1,1),
  groundTurn:axis(input.yaw),groundBank:axis(input.bank),boost:input.boost===true};
}
export function resetFlightControl(body){body.flightPitchLoad=body.flightRollRate=0;}
export function validFlightControl(body){
 const t=FLIGHT_TUNING;
 return (body.flightPitchLoad===undefined||Number.isFinite(body.flightPitchLoad)&&body.flightPitchLoad>=-t.pitchDownLoad&&body.flightPitchLoad<=t.pitchUpLoad)
  &&(body.flightRollRate===undefined||Number.isFinite(body.flightRollRate)&&Math.abs(body.flightRollRate)<=t.bankRate);
}
export function stepFlightControl(body,dt,command,airborne){
 const t=FLIGHT_TUNING,weight=clamp(airborne,0,1),speed=Math.max(14,body.speed);
 const pitchTarget=-command.pitch*(command.pitch<0?t.pitchUpLoad:t.pitchDownLoad);
 body.flightPitchLoad=approach(body.flightPitchLoad??0,pitchTarget,t.loadOnset*dt);
 // Keep the former low ground-bank angle so taxi/skid steering does not ask
 // terrain support to lift the body unnecessarily to clear a lowered wing.
 const groundBank=-(command.groundTurn+command.groundBank)*.48*.3;
 const bankTarget=groundBank*(1-weight)-command.turn*t.bankLimit*weight;
 const previousRate=body.flightRollRate??0;
 // A critically damped servo has a continuous acceleration demand. Moving
 // the rate toward a freshly clipped target every render frame caused large
 // reversal drift. Heun integration keeps onset/release stable at the bounded
 // aircraft substep while retaining explicit rate and acceleration limits.
 const acceleration=(roll,rate)=>clamp(t.bankGain*t.bankGain*(bankTarget-roll)-2*t.bankGain*rate,-t.bankAcceleration,t.bankAcceleration);
 const first=acceleration(body.roll,previousRate);
 const predictedRate=clamp(previousRate+first*dt,-t.bankRate,t.bankRate);
 const predictedRoll=body.roll+(previousRate+predictedRate)*.5*dt;
 const second=acceleration(predictedRoll,predictedRate);
 body.flightRollRate=clamp(previousRate+(first+second)*.5*dt,-t.bankRate,t.bankRate);
 const roll=clamp(body.roll+(previousRate+body.flightRollRate)*.5*dt,-t.bankLimit,t.bankLimit);
 const lateral=Math.tan(roll)*weight;
 const groundRate=-(command.groundTurn*2.35*(1-clamp((speed-25)/90,0,.35))+command.groundBank*1.45);
 const yawRate=groundRate*(1-weight)+t.gravity*lateral/speed;
 const pitchRate=clamp(t.gravity*body.flightPitchLoad/speed,-1.25,1.25);
 const drag=t.inducedDrag*(body.flightPitchLoad**2+lateral**2)*weight;
 return {roll,yawRate,pitchRate,drag};
}

// Read-only response for presentation and inspection. Load is the requested
// support estimate, not measured post-contact specific force. A later pilot
// effects model must use measured acceleration. No render/DOM/audio dependency.
export function flightTelemetry(body){
 const t=FLIGHT_TUNING,pitchLoad=body.flightPitchLoad??0;
 return {pitchLoad,rollRate:body.flightRollRate??0,bank:body.roll,
  load:Math.hypot(Math.cos(body.flightPitch??body.pitch)+pitchLoad,Math.tan(body.roll)),
  turnRate:t.gravity*Math.tan(body.roll)/Math.max(14,body.speed),speed:body.speed};
}
