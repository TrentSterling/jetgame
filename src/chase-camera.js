import * as T from 'three/webgpu';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const spring=()=>({value:0,velocity:0});
function follow(state,target,omega,dt,snap,angular=false){
 if(snap){state.value=target;state.velocity=0;return target;}
 if(angular)target=state.value+wrap(target-state.value);
 const error=state.value-target,combined=state.velocity+omega*error,decay=Math.exp(-omega*dt);
 state.value=target+(error+combined*dt)*decay;
 state.velocity=(state.velocity-omega*combined*dt)*decay;
 if(angular)state.value=wrap(state.value);
 return state.value;
}

// Follow the rendered chassis hardpoint, not a delayed world-space position.
// Only the orbit/framing parameters have springs. This keeps the vehicle's
// local center at a stable screen position through drift, suspension and flight.
export class ChaseCamera{
 constructor(){
  this.anchor=new T.Vector3();this.offset=new T.Vector3();this.localAnchor=new T.Vector3();this.screen=new T.Vector3();
  this.heading=spring();this.pitch=spring();this.distance=spring();this.height=spring();this.fov=spring();
  this.reset();
 }
 reset(){this.body=null;this.mode=null;this.initialized=false;}
 update(camera,body,mesh,{mode='car',dt=0,snap=false,ground=()=>0,shake=0,time=0}={}){
  dt=clamp(finite(dt),0,.25);
  snap=!!snap||!this.initialized||this.body!==body||this.mode!==mode;
  this.body=body;this.mode=mode;this.initialized=true;
  const car=mode==='car',speed=Math.abs(finite(body.speed)),yaw=finite(body.yaw);
  // The car root is at wheel contact height. Its chassis/collision center is
  // about one metre above that origin. The aircraft already uses its hull pivot.
  this.localAnchor.set(0,car?1.05:0,0);
  if(mesh){mesh.updateWorldMatrix(true,false);this.anchor.copy(this.localAnchor).applyMatrix4(mesh.matrixWorld);}
  else this.anchor.copy(body.pos).add(this.localAnchor);
  let wantedYaw=yaw;
  if(car){
   const vx=finite(body.vx),vz=finite(body.vz),motionSpeed=Math.hypot(vx,vz);
   const motionYaw=motionSpeed>1e-6?Math.atan2(-vx,-vz):yaw;
   // Continuous weighting replaces the old >4m/s and speed>0 switches.
   // A reversing or spinning hull cannot make the boom change sides by 180°.
   const weight=.34*smooth(2,18,motionSpeed)*smooth(-2,8,finite(body.speed));
   wantedYaw+=clamp(wrap(motionYaw-yaw),-1.15,1.15)*weight;
  }
  const heading=follow(this.heading,wantedYaw,car?9:10,dt,snap,true);
  const orbitPitch=follow(this.pitch,car?0:clamp(finite(body.flightPitch),-.7,.85)*.55,8,dt,snap);
  const distance=follow(this.distance,car?8.5+speed*.028:13+(body.boosting?.8:0),7,dt,snap);
  const targetFov=body.boosting?88:75+Math.min(7,Math.max(0,speed-15)*.16);
  camera.fov=follow(this.fov,targetFov,8,dt,snap);camera.updateProjectionMatrix();
  const cp=Math.cos(orbitPitch),sp=Math.sin(orbitPitch);
  this.offset.set(Math.sin(heading)*distance*cp,-distance*sp,Math.cos(heading)*distance*cp);
  const x=this.anchor.x+this.offset.x,z=this.anchor.z+this.offset.z,clearance=car?1.15:1.8;
  const vx=car?finite(body.vx):-Math.sin(yaw)*speed*Math.cos(finite(body.flightPitch));
  const vz=car?finite(body.vz):-Math.cos(yaw)*speed*Math.cos(finite(body.flightPitch));
  // Look a fraction of a second ahead to raise the boom before a hillside
  // reaches it. The final floor remains a safety limit, never an anchor filter.
  const floor=finite(ground(x,z),-1e6)+clearance;
  const aheadFloor=finite(ground(x+vx*.18,z+vz*.18),-1e6)+clearance;
  const wantedHeight=Math.max(car?3.05:4.8,Math.max(floor,aheadFloor)-this.anchor.y-this.offset.y);
  const height=follow(this.height,wantedHeight,12,dt,snap);
  this.offset.y+=height;
  // Presentation recoil is a small orbit around the same hardpoint. It cannot
  // contaminate follow state or throw the tracked vehicle across the screen.
  const strength=clamp(finite(shake),0,.2);
  if(strength>0){
   this.offset.applyAxisAngle(T.Object3D.DEFAULT_UP,(Math.sin(time*29)+Math.sin(time*43)*.35)*strength*.012);
   this.offset.y+=Math.sin(time*37)*strength*.13;
  }
  camera.position.copy(this.anchor).add(this.offset);
  camera.position.y=Math.max(camera.position.y,finite(ground(camera.position.x,camera.position.z),-1e6)+clearance);
  camera.up.set(0,1,0);camera.lookAt(this.anchor);
  // Framing is specified in screen space, so FOV changes do not move the
  // reference point. Both yaw and pitch are computed from one current anchor.
  this.framing=car?-.28:-.18;
  camera.rotateX(Math.atan(-this.framing*Math.tan(camera.fov*Math.PI/360)));
  camera.updateMatrixWorld();this.screen.copy(this.anchor).project(camera);
  return this;
 }
 report(){return {active:this.initialized,mode:this.mode,anchor:this.anchor.toArray(),anchorNDC:this.screen.toArray(),heading:this.heading.value,distance:this.distance.value,height:this.height.value,fov:this.fov.value,framing:this.framing,reference:this.mode==='car'?'mesh-local chassis center':'mesh-local aircraft pivot'};}
}
