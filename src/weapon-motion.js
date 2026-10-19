// Visual-only first-person motion. Sampling uses absolute game time, never a
// spring integrator, so a saved pose is identical at 30, 60 and 144 Hz.
// All animated parts have identity pivots; geometry is authored in gun space.
export const WEAPON_RELOAD_SECONDS=1.35;
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const ramp=(time,start,end)=>ease((time-start)/(end-start));
const transform=()=>({position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0}});

export function createWeaponPose(){
 return {...transform(),magazine:transform(),bolt:transform(),supportHand:transform(),reloadPhase:'ready'};
}
function resetPart(part){part.position.x=part.position.y=part.position.z=part.rotation.x=part.rotation.y=part.rotation.z=0;}
function recoilPulse(age){
 if(age<0||age>=.24)return 0;
 if(age<.016)return ramp(age,0,.016);
 if(age<.105)return 1-1.075*ramp(age,.016,.105);
 return -.075*(1-ramp(age,.105,.24));
}
function boltPulse(age){
 if(age<0||age>=.075)return 0;
 return ramp(age,0,.01)*(1-ramp(age,.025,.075));
}

// Reuse both out and state. shotAge supports isolated previews; shotTimes may
// instead contain a small preallocated ring of absolute firing timestamps.
// Reload is the existing countdown, not an animation-owned gameplay timer.
export function sampleWeaponPose(out,state){
 const time=state.time??0,reload=state.reload??0;
 const walk=state.walk?clamp((state.speed??0)/6):0;
 const sprint=state.sprinting?1:0,chute=state.parachute?1:0;
 const shove=Math.sin(clamp(state.shoveAnimation??0)*Math.PI);
 let kick=0,bolt=0;
 if(state.shotTimes){
  for(let i=0;i<state.shotTimes.length;i++){
   const age=time-state.shotTimes[i];kick+=recoilPulse(age);bolt+=boltPulse(age);
  }
 }else{const age=state.shotAge??Infinity;kick=recoilPulse(age);bolt=boltPulse(age);}
 kick=Math.max(-.2,Math.min(1.4,kick));bolt=Math.min(1.1,bolt);

 const p=reload>0?clamp(1-reload/WEAPON_RELOAD_SECONDS):1;
 const lower=ramp(p,0,.16)*(1-ramp(p,.79,1));
 const present=ramp(p,.12,.31)*(1-ramp(p,.78,1));
 const extract=ramp(p,.27,.44)*(1-ramp(p,.57,.73));
 const seat=ramp(p,.72,.755)*(1-ramp(p,.755,.81));
 const grasp=ramp(p,.10,.27)*(1-ramp(p,.78,.95));
 const settle=1-present*.7;
 const cadence=time*(sprint?17:12);
 // The root keeps the established camera-space rest pose and shove reach.
 out.position.x=.28+(Math.sin(time*1.7)*.003+Math.sin(cadence)*.006*walk)*settle-.07*present-shove*.2;
 out.position.y=-.23+(Math.sin(time*2.3)*.002+Math.sin(cadence*2)*.0035*walk)*settle-.06*sprint-.07*chute-.035*lower+.09*present+.004*kick;
 out.position.z=-.5+.055*kick-.10*present-shove*.38-.007*seat;
 out.rotation.x=.065*kick-.16*sprint-.18*lower+.05*present+.006*Math.sin(cadence)*walk*settle+.013*seat;
 out.rotation.y=-.025-.18*present+Math.sin(time*1.7)*.002*settle;
 out.rotation.z=-.45*shove-.24*present-.006*kick+Math.sin(cadence)*.006*walk*settle;

 resetPart(out.magazine);resetPart(out.bolt);resetPart(out.supportHand);
 out.magazine.position.x=-.018*extract;
 out.magazine.position.y=-.21*extract+.012*seat;
 out.magazine.position.z=.018*extract;
 out.magazine.rotation.x=-.055*extract;
 out.magazine.rotation.z=-.04*extract;
 out.bolt.position.z=.052*bolt;
 // The actual palm center in art.js is (-.025,-.06,-.43). Anchor it to
 // (0,-.24,-.10) on the magazine while grasped, compensating for both part
 // rotations. Shared approximate translations let the glove drift above it.
 // Then release and return to the foregrip before the receiver settles.
 if(grasp>0)placeSupportPalm(out.supportHand,out.magazine,grasp);
 out.reloadPhase=reload<=0?'ready':p<.27?'lower':p<.57?'mag-out':p<.81?'seat':'return';
 return out;
}
function placeSupportPalm(hand,magazine,grasp){
 hand.rotation.x=.10*grasp+magazine.rotation.x;
 hand.rotation.y=-.06*grasp;
 hand.rotation.z=.08*grasp+magazine.rotation.z;
 // Rotate the magazine contact anchor (Euler XYZ; magazine yaw is zero).
 const mc=Math.cos(magazine.rotation.x),ms=Math.sin(magazine.rotation.x);
 const mx=.24*Math.sin(magazine.rotation.z),my=-.24*Math.cos(magazine.rotation.z);
 const targetX=magazine.position.x+mx;
 const targetY=magazine.position.y+my*mc+.10*ms;
 const targetZ=magazine.position.z+my*ms-.10*mc;
 // Rotate the authored palm using scalar math to avoid per-frame objects.
 const cx=Math.cos(hand.rotation.x),sx=Math.sin(hand.rotation.x),cy=Math.cos(hand.rotation.y),sy=Math.sin(hand.rotation.y),cz=Math.cos(hand.rotation.z),sz=Math.sin(hand.rotation.z);
 const zx=-.025*cz+.06*sz,zy=-.025*sz-.06*cz;
 const rx=zx*cy-.43*sy,rz=-zx*sy-.43*cy;
 hand.position.x=-.025+(targetX+.025)*grasp-rx;
 hand.position.y=-.06+(targetY+.06)*grasp-(zy*cx-rz*sx);
 hand.position.z=-.43+(targetZ+.43)*grasp-(zy*sx+rz*cx);
}
function applyPart(part,pose){
 if(!part)return;
 part.position.set(pose.position.x,pose.position.y,pose.position.z);
 part.rotation.set(pose.rotation.x,pose.rotation.y,pose.rotation.z);
}
export function applyWeaponPose(gun,pose){
 applyPart(gun,pose);
 applyPart(gun.userData.magazine,pose.magazine);
 applyPart(gun.userData.bolt,pose.bolt);
 applyPart(gun.userData.supportHand,pose.supportHand);
 return gun;
}
