import {Fleet} from './fleet.js';
import {GameSave} from './save-game.js';
import {Expeditions} from './expeditions.js';
import * as T from 'three/webgpu';
import {Field,height,obstacles,terrainRayDistance} from './nav.js';
import {makeWorld} from './world.js';
import {weapon,buggy,jet,parachute} from './art.js';
import {Horde} from './horde.js';
import {Effects} from './fx.js';
import {startupUI} from './startup.js';
import {stepFlight,flightVector} from './flight.js';
import {Progression} from './progression.js';
import {VehicleEffects} from './vehicle-fx.js';
import {freeSpot} from './collision.js';
import {resetInfantry,stepInfantry,groundSurface,updateBoost} from './movement.js';

import {resetDriving,stepDriving} from './driving.js';
import {trackSurface} from './track-layout.js';
import {StuntCourse} from './stunt-course.js';
import {DrivingEffects} from './driving-fx.js';
import {Combat} from './combat.js';
import {CombatLighting} from './combat-lighting.js';
import {Ordnance} from './ordnance.js';
import {poseSuspension} from './suspension.js';
const combat=new Combat();let lighting,saves;
const rideHeight=(x,z)=>trackSurface(x,z,height);

const $=id=>document.getElementById(id),canvas=$('world');
const scene=new T.Scene(),camera=new T.PerspectiveCamera(75,innerWidth/innerHeight,.05,2400);
const renderer=new T.WebGPURenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
const field=new Field(),world=makeWorld(scene),fx=new Effects(scene),gun=weapon(),canopy=parachute();
let carMesh=buggy(),jetMesh=jet();
scene.add(camera,carMesh,jetMesh,canopy);camera.add(gun);gun.scale.setScalar(.62);gun.position.set(.28,-.23,-.5);gun.rotation.y=-.025;
const upgrades=new Progression(),vehicleFX=new VehicleEffects(scene),course=new StuntCourse(scene,world.solids),drivingFX=new DrivingEffects(scene,rideHeight);
const car={pos:new T.Vector3(-7,0,59),yaw:0,speed:0,health:100,impactAt:0},plane={pos:new T.Vector3(25,1,83),yaw:0,pitch:0,flightPitch:0,roll:0,speed:0,skimming:false,health:100,impactAt:0};
carMesh.position.copy(car.pos);jetMesh.position.copy(plane.pos);
const player={pos:new T.Vector3(0,0,70),yaw:0,pitch:0,vy:0,health:100};resetInfantry(player);
for(const body of [car,plane])Object.assign(body,{boost:1,boostDelay:0,boosting:false,boostLocked:false,wallContact:false});
plane.taxiing=true;resetDriving(car);
const fleet=new Fleet(scene,car,carMesh,plane,jetMesh);
const expeditions=new Expeditions(scene,world.solids,(scrap,n)=>{upgrades.rewards+=scrap;player.health=100;if(car.health>0)car.health=Math.min(100,car.health+55);if(plane.health>0)plane.health=Math.min(100,plane.health+55);bombs=upgrades.bombCapacity;ammo=upgrades.magazine;},message,k=>fx.sound(k));
fleet.update(expeditions.sites,player.pos,null);
let previousFoot=0,previousCab=0,previousJet=0,jumps=0;
let horde,mode='foot',running=false,paused=true,time=0,last=performance.now(),flowAt=0,statsAt=0,shotAt=0,reload=0,ammo=32,bombs=6,bombAt=0,rearm=0,dead=false,won=false,score=0,previousHits=0,previousContacts=0,previousCar=0,hitFade=0,damageFade=0,recoil=0,shakes=0,navUpdates=0,frames=0,dtAvg=1/60;
const keys=new Set(),pressed=new Set();let mouseDown=false,secondaryDown=false,aimX=0,aimY=0;const ray=new T.Raycaster(),forward=new T.Vector3(),right=new T.Vector3(),look=new T.Vector3(),target=new T.Vector4(),carNow=new T.Vector4(),carBefore=new T.Vector4(),blast=new T.Vector4(),jetNow=new T.Vector4(),jetBefore=new T.Vector4(),shot={origin:new T.Vector4(),aim:new T.Vector4(0,0,-1,150),rays:Array.from({length:6},()=>new T.Vector4())};const activeBombs=[];
const melee=new T.Vector4(),meleeAim=new T.Vector4();let blastType=3,gunRounds=0,bombImpacts=0;
const frameSamples=[];
let deathAt=0,respawnAt=0,respawnMode='foot',shieldUntil=0,respawns=0,hudAt=0;
const deathPoint=new T.Vector3(),pendingBlasts=[];
const ordnance=new Ordnance(scene,world.solids,fx,(p,r)=>{pendingBlasts.push({value:new T.Vector4(p.x,p.y,p.z,r),type:5});for(const prop of course.props||[])if(prop.mesh?.visible&&prop.mesh.position.distanceTo(p)<r)course.shatter(prop,12,12,18);});
let transitionLeft=0;const transitionFrom=new T.Vector3(),transitionRotation=new T.Quaternion(),transitionTarget=new T.Quaternion();
const currentBody=()=>mode==='foot'?player:mode==='car'?car:plane;
function frameTiming(){if(!frameSamples.length)return null;const sorted=[...frameSamples].sort((a,b)=>a-b);return {samples:sorted.length,meanMs:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(2),p95Ms:+sorted[Math.floor(sorted.length*.95)].toFixed(2),maxMs:+sorted.at(-1).toFixed(2)};}
const modeNames={foot:'ON FOOT',car:'BUGGY',jet:'STRIKE AIRCRAFT'};
function message(text,seconds=2){$('message').textContent=text;$('message').dataset.until=time+seconds;}
function activate(next,snap=false){
 transitionFrom.copy(camera.position);transitionRotation.copy(camera.quaternion);transitionLeft=snap?0:.38;
 // Continuous movement carries across boarding; one-shot actions do not.
 mode=next;pressed.clear();mouseDown=secondaryDown=false;aimX=aimY=0;gun.visible=next==='foot';$('mode').textContent=next==='foot'?modeNames[next]:fleet.active[next].name.toUpperCase();recoil=0;canopy.visible=false;
 if(currentBody().health<=0){destroy();return;}syncVehicles();if(snap)updateCamera(0,true);hudAt=0;updateHUD();
}
function nearbyVehicle(){
 if(mode!=='foot'||dead)return null;
 return fleet.nearest(player.pos)?.type??null;
}
function exitVehicle(){
 const body=currentBody(),previous=mode,airborne=body.pos.y-groundSurface(body.pos.x,body.pos.z,rideHeight,obstacles)>4;
 const departure=body.pos.clone();let exit=null;
 if(airborne)exit=departure.clone().add(new T.Vector3(0,2,0));
 else{
  const radius=previous==='car'?3.4:5.4;
  for(const angle of [Math.PI/2,-Math.PI/2,Math.PI,0,Math.PI/4,-Math.PI/4]){
   const x=body.pos.x-Math.sin(body.yaw+angle)*radius,z=body.pos.z-Math.cos(body.yaw+angle)*radius;
   const walls=obstacles.filter(o=>body.pos.y<height(o.x,o.z)+o.h);
   if(freeSpot(x,z,.6,walls)){exit=new T.Vector3(x,groundSurface(x,z,rideHeight,obstacles),z);break;}
  }
 }
 if(!exit){message('EXIT BLOCKED',1);return false;}
 resetInfantry(player);player.pos.copy(exit);player.yaw=body.yaw;player.pitch=airborne?-.16:0;
 player.vx=previous==='car'?car.vx:-Math.sin(body.yaw)*body.speed*.55;player.vz=previous==='car'?car.vz:-Math.cos(body.yaw)*body.speed*.55;
 if(airborne){player.vy=8;player.grounded=false;player.hasChute=true;player.chuteDelay=.25;}
 body.boosting=false;activate('foot');message(airborne?'EJECTED · SPACE CUT / OPEN CHUTE':'ON FOOT',2);return true;
}
function interact(){
 if(dead)return false;
 if(mode!=='foot')return exitVehicle();
 const entry=fleet.nearest(player.pos);if(!entry)return false;const next=entry.type;fleet.select(entry);if(next==='car')carMesh=entry.mesh;else jetMesh=entry.mesh;
 player.parachute=false;activate(next);message(next==='car'?'SHIFT BOOST · E EXIT':'W THROTTLE · MOUSE UP TO LIFT · E EJECT',3);return true;
}
// Explicit test fixture. Gameplay only boards a nearby vehicle via E.
function setMode(next){if(dead){respawnMode=next;return;}
 if(next==='foot'&&mode!=='foot'){exitVehicle();transitionLeft=0;updateCamera(0,true);return;}
 if(next==='jet'&&plane.speed===0){plane.pos.set(25,28,125);plane.speed=28;plane.yaw=plane.pitch=plane.flightPitch=0;plane.taxiing=false;}
 activate(next,true);
}
function begin(){if(window.bootError){location.reload();return;}if(!window.HordeStartup?.ready)return;last=performance.now();paused=false;running=true;if(saves)saves.started=true;keys.clear();pressed.clear();$('gate').hidden=true;fx.audioStart();canvas.requestPointerLock?.();}
function syncVehicles(){
 carMesh.position.copy(car.pos);carMesh.position.y+=car.suspension;carMesh.rotation.order='YXZ';carMesh.rotation.set(car.pitch,car.yaw,car.roll);
 carMesh.userData.driver.visible=mode==='car'&&!dead;
 carMesh.userData.driver.rotation.z=-car.roll*.6;carMesh.userData.head.rotation.y=car.steer*.2;
 for(const wheel of carMesh.userData.wheelPivots)wheel.rotation.y=wheel.position.z<0?-car.steer*.42:0;
 poseSuspension(carMesh,car,rideHeight);
 jetMesh.position.copy(plane.pos);jetMesh.rotation.order='YXZ';jetMesh.rotation.set(plane.flightPitch,plane.yaw,plane.roll);
}
function breakVehicle(which){
 const body=which==='car'?car:plane,mesh=which==='car'?carMesh:jetMesh;if(!mesh.visible)return;
 syncVehicles();const velocity=which==='car'?new T.Vector3(car.vx,car.vy,car.vz):flightDirection().multiplyScalar(plane.speed);
 vehicleFX.breakup(mesh,velocity);mesh.visible=false;body.speed=body.vx=body.vz=body.vy=0;body.boosting=false;
 fx.explosion(body.pos,10);pendingBlasts.push(new T.Vector4(body.pos.x,body.pos.y,body.pos.z,12));
}
function takeDamage(amount,which=mode){
 if(amount<=0||(which===mode&&(dead||time<shieldUntil)))return;
 const body=which==='foot'?player:which==='car'?car:plane;if(body.health<=0)return;
 body.health=Math.max(0,body.health-amount*(body.armor??1));if(which===mode)damageFade=Math.min(.7,amount*.045);
 if(body.health<=0){if(which!=='foot')breakVehicle(which);if(which===mode)destroy();}
}
function crashDamage(body,speed){if(time<body.impactAt||speed<5)return;body.impactAt=time+.8;const which=body===car?'car':'jet';takeDamage(Math.min(65,Math.max(6,(speed-4)*.85)),which);if(which===mode)shakes=.18;fx.sound('crush');}
function destroy(){if(dead)return;dead=true;deathAt=time;respawnAt=time+2.4;respawnMode=mode;deathPoint.copy(currentBody().pos);keys.clear();mouseDown=secondaryDown=false;gun.visible=canopy.visible=false;currentBody().boosting=false;
 if(mode!=='foot')breakVehicle(mode);else fx.sound('bomb');
 shakes=.2;$('crosshair').hidden=true;
}
function respawn(){if(!dead||time<deathAt+.65)return false;
 const next=respawnMode,z=deathPoint.z>=0?150:-150,yaw=z>0?0:Math.PI;
 combat.stamina=1;combat.shoveDelay=combat.recoverDelay=0;
 dead=false;shieldUntil=time+3.2;respawns++;keys.clear();pressed.clear();mouseDown=secondaryDown=false;aimX=aimY=0;shakes=damageFade=0;reload=0;ammo=upgrades.magazine;bombs=upgrades.bombCapacity;
 const body=next==='foot'?player:next==='car'?car:plane;body.health=player.health=100;body.pos.set(0,next==='jet'?12:next==='foot'?32:0,z);body.yaw=yaw;body.boost=1;body.boostLocked=false;body.boostDelay=0;body.wallContact=false;transitionLeft=0;
 if(next==='car'){car.speed=22;resetDriving(car);car.impactAt=0;carMesh.visible=true;}
 if(next==='jet'){plane.speed=32;plane.pitch=plane.flightPitch=plane.roll=0;plane.impactAt=0;plane.skimming=plane.taxiing=false;jetMesh.visible=true;}
 if(next==='foot'){resetInfantry(player);player.pitch=-.2;player.grounded=false;player.hasChute=player.parachute=true;player.vy=-4.5;}
 mode=next;gun.visible=next==='foot';$('mode').textContent=next==='foot'?modeNames[next]:fleet.active[next].name.toUpperCase();$('crosshair').hidden=false;$('gate').hidden=true;syncVehicles();updateCamera(0,true);
 const arrival=new T.Vector3(0,height(0,z),z);fx.explosion(arrival,7);pendingBlasts.push(new T.Vector4(0,arrival.y+.5,z,11));message('BACK IN · 3 SECONDS OF ARMOR',3.2);flowAt=0;return true;
}
function restart(){
 keys.clear();pressed.clear();frameSamples.length=0;
 fleet.reset();carMesh=fleet.active.car.mesh;jetMesh=fleet.active.jet.mesh;expeditions.reset();
 for(const b of activeBombs){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}activeBombs.length=0;fx.clear();
 horde.reset();lighting?.clear();combat.reset();ordnance.clear();gunRounds=bombImpacts=0;upgrades.reset();vehicleFX.clear();drivingFX.clear();course.reset();jumps=0;pendingBlasts.length=0;resetInfantry(player);player.pos.set(0,0,70);player.health=car.health=plane.health=100;car.impactAt=plane.impactAt=0;carMesh.visible=jetMesh.visible=true;player.yaw=player.pitch=player.vy=0;dead=won=false;shieldUntil=respawns=respawnAt=0;time=0;flowAt=statsAt=shotAt=bombAt=rearm=0;$('crosshair').hidden=false;
 score=previousHits=previousContacts=previousCar=previousFoot=previousCab=previousJet=0;ammo=32;bombs=6;reload=0;shakes=damageFade=hitFade=0;car.pos.set(-7,0,59);car.speed=car.yaw=0;resetDriving(car);plane.pos.set(25,1,83);plane.speed=plane.yaw=plane.pitch=plane.flightPitch=plane.roll=0;plane.skimming=false;
 for(const body of [car,plane])Object.assign(body,{boost:1,boostDelay:0,boostLocked:false,boosting:false,wallContact:false});plane.taxiing=true;canopy.visible=false;
 $('message').textContent='';$('message').dataset.until=0;$('objective').textContent='CLEAR THE AIRFIELD';mode='foot';setMode('foot');
}
function saveRuntime(){return {mode,time,ammo,bombs,bombAt,rearm,shotAt,reload,dead,won,score,previousHits,previousContacts,previousCar,previousFoot,previousCab,previousJet,deathAt,respawnAt,respawnMode,shieldUntil,respawns,jumps,gunRounds,bombImpacts,deathPoint:deathPoint.toArray()};}
function restoreRuntime(s){
 ({mode,time,ammo,bombs,bombAt,rearm,shotAt,reload,dead,won,score,previousHits,previousContacts,previousCar,previousFoot,previousCab,previousJet,deathAt,respawnAt,respawnMode,shieldUntil,respawns,jumps,gunRounds,bombImpacts}=s);deathPoint.fromArray(s.deathPoint);
 carMesh=fleet.active.car.mesh;jetMesh=fleet.active.jet.mesh;
 keys.clear();pressed.clear();mouseDown=secondaryDown=false;aimX=aimY=0;flowAt=statsAt=0;paused=true;transitionLeft=0;
 world.update(currentBody().pos);expeditions.lastRegion='';expeditions.updateSites(currentBody().pos);fleet.update(expeditions.sites,currentBody().pos,expeditions.party?.vehicle);
 field.update(currentBody().pos.x,currentBody().pos.z);horde.updateFlow();gun.visible=mode==='foot'&&!dead;$('crosshair').hidden=dead;$('mode').textContent=mode==='foot'?modeNames[mode]:fleet.active[mode].name.toUpperCase();syncVehicles();updateCamera(0,true);hudAt=0;updateHUD();
}
function checkpointPause(){if(saves?.started)void saves.save();}
function updateCamera(dt,snap=false){
 if(dead){const dest=deathPoint.clone().add(new T.Vector3(8,6,12));camera.position.lerp(dest,1-Math.exp(-dt*2.4));camera.up.set(0,1,0);camera.lookAt(deathPoint.clone().add(new T.Vector3(0,1,0)));return;}
 if(mode==='foot'){camera.up.set(0,1,0);camera.rotation.order='YXZ';camera.rotation.set(player.pitch,player.yaw,player.slideTime>0?-.035:player.parachute?-Math.sin(time*2)*.018:0);camera.position.copy(player.pos).add(new T.Vector3(0,player.eyeHeight-player.landing*.16,0));const speed=Math.hypot(player.vx,player.vz),walk=player.grounded&&player.slideTime===0;camera.position.y+=walk?Math.sin(time*(player.sprinting?17:12))*.025*Math.min(1,speed/6):0;gun.position.set(.28+Math.sin(time*6)*.004,-.23-reload*.07-(player.sprinting?.06:0)-(player.parachute?.07:0),-.5+recoil*.055);gun.rotation.x=-recoil*.055+(reload>0?-.45:player.sprinting?-.16:0);const shove=Math.sin(combat.shoveAnimation*Math.PI);gun.position.z-=shove*.38;gun.position.x-=shove*.2;gun.rotation.z=-shove*.45;}
 else if(mode==='car'){
  const f=new T.Vector3(-Math.sin(car.yaw),0,-Math.cos(car.yaw)),motion=new T.Vector3(car.vx,0,car.vz);
  if(motion.length()>4&&car.speed>0)f.lerp(motion.normalize(),.4).normalize();
  const dest=car.pos.clone().addScaledVector(f,-(8.5+Math.abs(car.speed)*.028)).add(new T.Vector3(0,4.1,0));dest.y=Math.max(dest.y,rideHeight(dest.x,dest.z)+2.4);
  if(snap)camera.position.copy(dest);else camera.position.lerp(dest,1-Math.exp(-dt*7));look.copy(car.pos).addScaledVector(f,8).add(new T.Vector3(0,1.25,0));camera.up.set(0,1,0);camera.lookAt(look);
 }
 else{const f=flightDirection(),dest=plane.pos.clone().addScaledVector(f,-13).add(new T.Vector3(0,4.8,0));dest.y=Math.max(dest.y,height(dest.x,dest.z)+2.8);if(snap)camera.position.copy(dest);else camera.position.lerp(dest,1-Math.exp(-dt*7));camera.up.set(0,1,0);camera.lookAt(plane.pos.clone().addScaledVector(f,19).add(new T.Vector3(0,1,0)));}
 const fov=mode==='foot'?(player.parachute?84:player.slideTime>0?88:player.sprinting?85:75):currentBody().boosting?88:75;
 camera.fov=snap?fov:T.MathUtils.lerp(camera.fov,fov,1-Math.exp(-dt*7));camera.updateProjectionMatrix();
 if(transitionLeft>0&&!snap){transitionLeft=Math.max(0,transitionLeft-dt);const t=1-transitionLeft/.38,s=t*t*(3-2*t);camera.position.lerpVectors(transitionFrom,camera.position,s);transitionTarget.copy(camera.quaternion);camera.quaternion.slerpQuaternions(transitionRotation,transitionTarget,s);}
 if(shakes>0){camera.position.x+=(Math.random()-.5)*shakes;camera.position.y+=(Math.random()-.5)*shakes;}
 camera.updateMatrixWorld();
 let reticle=new T.Vector3(0,0,0);
 if(mode==='car')reticle.copy(car.pos).add(new T.Vector3(0,1.95,0)).addScaledVector(new T.Vector3(-Math.sin(car.yaw),-.018,-Math.cos(car.yaw)),100).project(camera);
 if(mode==='jet')reticle.copy(plane.pos).addScaledVector(flightDirection(),150).project(camera);
 $('crosshair').style.left=(50+reticle.x*50)+'%';$('crosshair').style.top=(50-reticle.y*50)+'%';
}
function flightDirection(){const f=flightVector(plane);return new T.Vector3(f.x,f.y,f.z);}
function buyUpgrade(which){if(dead||paused)return false;if(!upgrades.buy(which))return false;if(which==='foot')ammo=Math.min(upgrades.magazine,ammo+8);if(which==='jet')bombs++;message(`${{foot:'CARBINE',car:'BUGGY',jet:'STRIKE KIT'}[which]} ${upgrades.levels[which]} INSTALLED`,2);fx.sound('hit');updateHUD();return true;}
function clippedRay(origin,dir,range){
 range=terrainRayDistance(origin,dir,range);ray.set(origin,dir);ray.far=range;const hit=ray.intersectObjects(world.solids,false)[0];if(hit)range=Math.min(range,hit.distance);return {range,hit};
}
function shoot(){if(time+1e-6<shotAt||reload>0||dead)return false;if(mode==='foot'&&ammo<=0){reload=1.35;return false;}
 camera.getWorldDirection(forward);let origin=camera.position.clone(),dir=forward.clone(),range=180,damage=upgrades.rifleDamage;
 if(mode==='jet'){origin=plane.pos.clone().addScaledVector(flightDirection(),4);dir=flightDirection();range=320;damage=95;}
 if(mode==='car'){origin=car.pos.clone().add(new T.Vector3(0,1.95,0));dir.set(-Math.sin(car.yaw),-.018,-Math.cos(car.yaw));damage=75;}
 shot.origin.set(origin.x,origin.y,origin.z,damage);const count=mode==='jet'?6:1;
 for(let i=0;i<6;i++){
  if(i>=count){shot.rays[i].set(0,0,0,0);continue;}
  const d=dir.clone();if(mode==='jet'){const side=new T.Vector3(Math.cos(plane.yaw),0,-Math.sin(plane.yaw)),spread=(i-2.5)*.031+(Math.random()-.5)*.017;d.addScaledVector(side,spread);d.y-=.016+Math.random()*.04;d.normalize();}
  const cast=clippedRay(origin,d,range);shot.rays[i].set(d.x,d.y,d.z,cast.range);if(cast.hit?.object.userData.breakable)course.shatter(cast.hit.object.userData.breakable,d.x*12,d.z*12,12);
  fx.tracer(mode==='foot'?gun.localToWorld(new T.Vector3(0,.04,-.95)):origin,origin.clone().addScaledVector(d,Math.min(cast.range,150)),mode==='jet'?'#ffe299':'#ffd087',mode==='jet'?.035:.055,mode==='jet'?.025:.018);
 }
 shot.aim.copy(shot.rays[0]);shotAt=Math.max(time-.035,shotAt)+(mode==='foot'?upgrades.rifleInterval:mode==='jet'?.05:.065);gunRounds+=count;if(mode==='foot')ammo--;recoil=1;gun.userData.flash.visible=mode==='foot';fx.sound('gun');lighting?.flash(origin,'#ffc477',mode==='jet'?140:45,mode==='jet'?24:12,.1,0);return true;
}
function secondary(){
 if(dead)return false;
 if(mode==='foot'){
  if(!combat.shove())return false;camera.getWorldDirection(forward);const origin=player.pos.clone().add(new T.Vector3(0,1.1,0));const range=clippedRay(origin,forward,3.8).range;melee.set(origin.x,origin.y,origin.z,22);meleeAim.set(forward.x,forward.y,forward.z,range);fx.sound('shove');return true;
 }
 const count=combat.missile(mode);if(!count)return false;const body=currentBody(),dir=mode==='car'?new T.Vector3(-Math.sin(car.yaw),-.005,-Math.cos(car.yaw)):flightDirection();
 const origin=body.pos.clone().add(new T.Vector3(0,mode==='car'?1.8:0,0)).addScaledVector(dir,mode==='car'?3.1:4.6),cast=clippedRay(origin,dir,mode==='car'?180:320);
 const target=origin.clone().addScaledVector(dir,cast.range);if(!cast.hit&&cast.range>=(mode==='car'?180:320)){target.copy(origin).addScaledVector(dir,mode==='car'?95:210);target.y=height(target.x,target.z)+.5;}
 for(let i=0;i<count;i++){const side=count===2?(i?1:-1):combat.missilesFired%2?1:-1;const launch=origin.clone().add(new T.Vector3(Math.cos(body.yaw)*side*1.1,0,-Math.sin(body.yaw)*side*1.1));ordnance.launch(launch,dir,target,mode,body.speed);}
 fx.sound('rocket');return true;
}
function dropBomb(){if(mode!=='jet'||bombs<=0||time<bombAt||dead)return false;bombs--;bombAt=time+.6;const mesh=new T.Mesh(new T.SphereGeometry(.3,6,4),new T.MeshStandardMaterial({color:'#eeb856'}));mesh.scale.set(.6,.6,2);mesh.position.copy(plane.pos).add(new T.Vector3(0,-.8,0));scene.add(mesh);activeBombs.push({mesh,vel:flightDirection().multiplyScalar(plane.speed*.7)});return true;}
function driveCar(dt,w,a,boost,handbrake){
 const result=stepDriving(car,dt,{throttle:w,steer:a,boost,handbrake,torque:upgrades.torque},rideHeight,obstacles);
 if(result.impactSpeed>5)crashDamage(car,result.impactSpeed);
 if(result.landingSpeed>18)crashDamage(car,result.landingSpeed);
 if(result.landingSpeed>5&&car.lastAirTime>.35){jumps++;car.boost=Math.min(1,car.boost+.12);if(mode==='car'){shakes=Math.min(.18,result.landingSpeed*.008);fx.sound('crush');}}
 for(const wheel of carMesh.userData.wheels)wheel.rotation.y-=car.speed*dt/.65;
 drivingFX.emit(car,dt,handbrake);
}
function coastVehicles(dt){
 if((mode!=='car'||dead)&&car.health>0)driveCar(dt,0,0,false,false);
 if((mode!=='jet'||dead)&&plane.health>0&&plane.speed>.02){
  const agl=plane.pos.y-height(plane.pos.x,plane.pos.z);plane.pitch=-.28;
  if(agl<1.55){plane.taxiing=true;plane.speed=Math.max(0,plane.speed-dt*20);}
  const flight=stepFlight(plane,dt,{throttle:0,bank:0,yaw:0,pitch:0,boost:false},rideHeight,obstacles);
  if(flight.impact&&!plane.wallContact)crashDamage(plane,flight.impactSpeed);plane.wallContact=flight.impact;
  if(flight.groundImpact>8)crashDamage(plane,flight.groundImpact*1.5);
 }
 syncVehicles();
}
function updateControls(dt){
 if(pressed.has('KeyE'))interact();
 const w=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),a=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),shift=keys.has('ShiftLeft')||keys.has('ShiftRight');
 const carBoost=updateBoost(car,mode==='car'&&shift&&w>0,dt),jetBoost=updateBoost(plane,mode==='jet'&&shift,dt);
 if(mode==='foot'){
  const wasChute=player.parachute;
  stepInfantry(player,dt,{forward:w,strafe:a,sprint:shift,crouch:keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight'),slide:pressed.has('KeyC')||pressed.has('ControlLeft')||pressed.has('ControlRight'),jump:pressed.has('Space')},rideHeight,obstacles);
  if(wasChute&&player.grounded)shieldUntil=Math.max(shieldUntil,time+1.5);
 }else if(mode==='car'){
  driveCar(dt,w,a,carBoost,keys.has('Space'));
 }else{
  const flight=stepFlight(plane,dt,{throttle:w,bank:a,yaw:aimX,pitch:aimY,boost:jetBoost},rideHeight,obstacles);
  if(flight.impact&&!plane.wallContact)crashDamage(plane,flight.impactSpeed);plane.wallContact=flight.impact;
  if(flight.groundImpact>8)crashDamage(plane,flight.groundImpact*1.5);
  if(flight.returning)message('AIRFIELD ←',.3);
  if(plane.skimming&&plane.speed>8)fx.skid(plane.pos,plane.yaw,time);
  if(pressed.has('Space'))dropBomb();
  if(bombs<upgrades.bombCapacity){rearm+=dt;if(rearm>upgrades.rearmSeconds){bombs++;rearm=0;}}
 }
 canopy.visible=mode==='foot'&&player.parachute;canopy.position.copy(player.pos);canopy.rotation.set(0,player.yaw,Math.sin(time*2)*.025);const opening=canopy.visible?Math.min(1,canopy.scale.x+dt*5):.08;canopy.scale.set(opening,1,opening);
 for(const [body,mesh] of [[car,carMesh],[plane,jetMesh]])for(const flame of mesh.userData.boost){flame.visible=body.health>0&&(body.boosting||(body===plane&&body.speed>1));flame.scale.y=(body.boosting?2.2:.65)*(1+Math.sin(time*55)*.12);}
 if(pressed.has('KeyR')&&mode==='foot'&&ammo<upgrades.magazine&&reload<=0)reload=1.35;
 if(reload>0){reload=Math.max(0,reload-dt);if(!reload)ammo=upgrades.magazine;}
}
function acceptStats(s){
 const hits=s.hits-previousHits,carHits=s.carContacts-previousCar,jetHits=s.jetContacts-previousJet;
 if(hits>0){hitFade=1;fx.sound('hit');}
 takeDamage(Math.max(0,s.footContactMs-previousFoot)*.006,'foot');takeDamage(Math.max(0,s.cabContactMs-previousCab)*.0015,'car');
 if(carHits>0){hitFade=1;fx.sound('crush');takeDamage(carHits*.025,'car');const drag=Math.max(.62,1-carHits*.007);car.vx*=drag;car.vz*=drag;car.speed*=drag;car._speed=car.speed;if(mode==='car')shakes=Math.min(.3,carHits*.025);}
 if(jetHits>0){hitFade=1;fx.sound('crush');takeDamage(jetHits*.018,'jet');if(mode==='jet')shakes=Math.min(.055,jetHits*.004);}
 previousHits=s.hits;previousContacts=s.contactMs;previousCar=s.carContacts;previousFoot=s.footContactMs;previousCab=s.cabContactMs;previousJet=s.jetContacts;score=s.kills;upgrades.sync(s.scrap);updateHUD();
}

function step(dt){if(!horde)return;dt=Math.min(dt,.035);time+=dt;world.surfaces.update(time);shot.origin.w=0;blast.w=0;blastType=3;melee.w=0;combat.update(dt);
 carBefore.set(car.pos.x,car.pos.y+.9,car.pos.z,0);jetBefore.set(plane.pos.x,plane.pos.y,plane.pos.z,0);
 if(!dead)updateControls(dt);coastVehicles(dt);updateCamera(dt);if(!dead&&(mouseDown||keys.has('Fire')))shoot();if(!dead&&secondaryDown)secondary();ordnance.update(dt);for(const flash of jetMesh.userData.flashes)flash.visible=mode==='jet'&&!dead&&recoil>.6;for(const barrel of jetMesh.userData.guns)barrel.rotation.z+=dt*(mouseDown?45:3);for(let i=0;i<ordnance.active.length&&i<6;i++)lighting?.flash(ordnance.active[i].mesh.position,'#ff962c',80,15,.08,i+1);
 for(let i=activeBombs.length-1;i>=0;i--){const b=activeBombs[i];b.vel.y-=dt*16;b.mesh.position.addScaledVector(b.vel,dt);const gy=height(b.mesh.position.x,b.mesh.position.z);if(b.mesh.position.y<=gy+.2){bombImpacts++;const p=b.mesh.position.clone();p.y=gy;blast.set(p.x,p.y+.5,p.z,upgrades.blastRadius);fx.explosion(p,upgrades.blastRadius);shakes=mode==='jet'?.07:.25;scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();activeBombs.splice(i,1);break;}}
 const pos=currentBody().pos;world.update(pos);expeditions.update(dt,{pos,mode,body:currentBody(),holding:keys.has('KeyF'),dead:dead||!!(expeditions.party&&fleet.entries.find(e=>e.id===expeditions.party.vehicle)?.body.health<=0),damaged:damageFade>.08,capacity:currentBody().seats??0});fleet.update(expeditions.sites,pos,expeditions.party?.vehicle);fx.mixer.update(dt,{pos,yaw:currentBody().yaw,mode,speed:mode==='foot'?Math.hypot(player.vx,player.vz):currentBody().speed,boost:!!currentBody().boosting,slip:car.slip,grounded:mode==='foot'?player.grounded:car.grounded});target.set(pos.x,pos.y+.8,pos.z,dead?3:mode==='jet'?2:mode==='car'?1:0);
 if(time>flowAt){field.update(pos.x,pos.z);horde.updateFlow();flowAt=time+.8;navUpdates++;}
 carNow.set(car.pos.x,car.pos.y+.9,car.pos.z,car.health>0?Math.hypot(car.pos.x-carBefore.x,car.pos.z-carBefore.z)/dt*upgrades.plow:0);
 jetNow.set(plane.pos.x,plane.pos.y,plane.pos.z,plane.health>0?Math.hypot(plane.pos.x-jetBefore.x,plane.pos.z-jetBefore.z)/dt:0);
 const smashed=course.sweep(car,carBefore);if(smashed){car.boost=Math.min(1,car.boost+smashed*.05);fx.sound('crush');if(mode==='car')shakes=.08;}
 if(pendingBlasts.length&&blast.w===0){const event=pendingBlasts.shift();blast.copy(event.value||event);blastType=event.type||3;}
 horde.step(dt,time,target,shot,blast,carNow,carBefore,mode==='jet'?3:1,jetNow,jetBefore,melee,meleeAim,blastType);
 course.update(dt);drivingFX.update(dt);fx.update(dt);vehicleFX.update(dt,{car,jet:plane});recoil=Math.max(0,recoil-dt*8);if(recoil<.55)gun.userData.flash.visible=false;shakes*=Math.exp(-dt*15);hitFade=Math.max(0,hitFade-dt*5);damageFade=Math.max(0,damageFade-dt*2);
 if(time>statsAt){statsAt=time+.14;horde.readStats().then(s=>acceptStats(s));}

 if(score>=500&&!won){won=true;message('500 kills. The survivors still need a way out.',5);}
 if(dead){message(`${respawnMode.toUpperCase()} IN ${Math.max(0,respawnAt-time).toFixed(1)} · 1/2/3 CHOOSE${time-deathAt>.65?' · R LAUNCH':''}`,.2);if(time>=respawnAt)respawn();}
 updateHUD();pressed.clear();
}

function updateHUD(){const now=performance.now();if(now<hudAt)return;hudAt=now+75;const hp=currentBody().health; $('kills').textContent=`${score.toLocaleString()} kills · ${expeditions.rescued} rescued`;const destination=expeditions.target;$('objective').textContent=destination?`${destination.kind==='return'?'Return to':'Explore'} ${destination.name} · ${destination.distance>1000?(destination.distance/1000).toFixed(1)+' km':Math.round(destination.distance)+' m'}`:'Find survivors beyond the airfield';$('health').querySelector('b').textContent=Math.ceil(hp);$('health').querySelector('i').style.width=Math.max(0,hp)+'%';$('health').querySelector('span').textContent=time<shieldUntil?'ARMORED':mode==='foot'?'HEALTH':'HULL';$('health').querySelector('i').style.background=time<shieldUntil?'#8bddd3':hp<30?'#ec633c':'#f6b154';
 $('hint').textContent=mode==='car'?'WASD drive · RMB missile · Space handbrake · Shift boost · E exit':mode==='jet'?'W/S throttle · A/D turn · Mouse steer · RMB missiles · Space bomb · Shift boost · E eject':'WASD · Mouse aim · RMB shove · E enter · Shift sprint · C slide · Space jump';
 $('weapon').innerHTML=mode==='foot'?`CARBINE<br><b>${reload>0?'··':ammo}</b><small> / ∞</small>`:mode==='car'?`RMB MISSILES ${combat.ammo.car}<br><b>${Math.abs(car.speed*3.6).toFixed(0)}</b><small> KM/H</small>`:`MISSILES ${combat.ammo.jet} · BOMBS ${bombs} · ALT ${Math.round(plane.pos.y)} M<br><b>${Math.round(plane.speed*3.6)}</b><small> KM/H</small>`;
 $('crosshair').querySelector('b').style.opacity=hitFade;$('hit').style.opacity=shakes;$('damage').style.opacity=damageFade;if(time>Number($('message').dataset.until))$('message').textContent='';
 $('upgrades').textContent=upgrades.earned||upgrades.rewards?`${upgrades.scrap} SCRAP · `+[['Z','foot','CARBINE'],['X','car','TORQUE'],['V','jet','BOMBS']].map(([key,m,name])=>`${key} ${name} ${upgrades.levels[m]===3?'MAX':upgrades.cost(m)}`).join(' · '):'';
 const nearby=fleet.nearest(player.pos),missionPrompt=expeditions.prompt(currentBody().pos,mode);$('interact').textContent=dead?'':missionPrompt||(mode==='foot'?(nearby?`E  ${nearby.name} · ${nearby.body.seats} passenger seats`:player.parachute?'SPACE  CUT CHUTE · SHIFT  DIVE':player.hasChute?'SPACE  OPEN CHUTE':''):mode==='car'?'E  EXIT':plane.pos.y-height(plane.pos.x,plane.pos.z)>4?'E  EJECT':'E  EXIT');
 $('boost').hidden=dead;if(mode==='foot'){$('boost').querySelector('i').style.transform=`scaleX(${combat.stamina})`;$('boost').querySelector('span').textContent=combat.stamina<.28?'RECOVERING':'RMB SHOVE';$('boost').classList.toggle('active',combat.shoveAnimation>0);}else{$('boost').querySelector('i').style.transform=`scaleX(${currentBody().boost})`;$('boost').querySelector('span').textContent=currentBody().boosting?'BOOST':currentBody().boostLocked?'RELEASE SHIFT':'SHIFT BOOST';$('boost').classList.toggle('active',currentBody().boosting);}
 const waypoint=$('waypoint');if(destination){const at=new T.Vector3(destination.x,height(destination.x,destination.z)+16,destination.z).project(camera);waypoint.hidden=dead;waypoint.style.left=(50+Math.max(-.88,Math.min(.88,at.x*(at.z>1?-1:1)))*50)+'%';waypoint.style.top=(50+Math.max(-.65,Math.min(.6,-at.y))*50)+'%';waypoint.textContent=`◇ ${destination.kind==='return'?'Refuge':'Survivors'} · ${Math.round(destination.distance)} m`;}else waypoint.hidden=true;
 for(const [name,body] of [['car',car],['jet',plane]]){const marker=$('marker-'+name),distance=player.pos.distanceTo(body.pos),point=body.pos.clone().add(new T.Vector3(0,3,0)).project(camera);marker.hidden=dead||mode!=='foot'||body.health<=0||distance>100||point.z>1||point.z<0||Math.abs(point.x)>.95||Math.abs(point.y)>.85;if(!marker.hidden){marker.style.left=(50+point.x*50)+'%';marker.style.top=(50-point.y*50)+'%';marker.textContent=`◇ ${name==='car'?'CAR':'JET'} · ${Math.round(distance)} m`;}}
}

window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','Tab'].includes(e.code)||(!paused&&e.ctrlKey))e.preventDefault();if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);if(e.code==='Escape'){paused=true;fx.mixer.setPaused(true);keys.clear();pressed.clear();mouseDown=secondaryDown=false;document.exitPointerLock?.();$('gate').hidden=false;$('play').textContent='Resume';}if(e.repeat)return;if(dead){if(e.code==='Digit1')respawnMode='foot';if(e.code==='Digit2')respawnMode='car';if(e.code==='Digit3')respawnMode='jet';if(e.code==='KeyR')respawn();}if(e.code==='KeyH')$('help').hidden=!$('help').hidden;if(e.code==='KeyM')message(fx.mixer.mute()?'Sound muted':'Sound on',2);});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pressed.clear();mouseDown=secondaryDown=false;});
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!e.repeat)checkpointPause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpointPause();});
window.addEventListener('pagehide',checkpointPause);
window.addEventListener('keydown',e=>{if(!e.repeat){const m={KeyZ:'foot',KeyX:'car',KeyV:'jet'}[e.code];if(m)buyUpgrade(m);}});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas)return;if(mode==='foot'){player.yaw-=e.movementX*.002;player.pitch=T.MathUtils.clamp(player.pitch-e.movementY*.002,-1.4,1.4);}else if(mode==='jet'){aimX=T.MathUtils.clamp(aimX+e.movementX*.004,-1,1);aimY=T.MathUtils.clamp(aimY+e.movementY*.004,-1,1);}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{if(e.button!==0&&e.button!==2)return;if(document.pointerLockElement!==canvas){begin();return;}if(e.button===0)mouseDown=true;else secondaryDown=true;});window.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;if(e.button===2)secondaryDown=false;});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&!new URLSearchParams(location.search).has('test')){paused=true;keys.clear();mouseDown=secondaryDown=false;$('gate').hidden=false;if(!dead)$('play').textContent='Resume';checkpointPause();}});
$('save-now').addEventListener('click',()=>void saves?.save());
$('play').addEventListener('click',begin);window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
const startup=startupUI(renderer);
async function init(){try{
 if(!navigator.gpu)throw new Error('WebGPU is unavailable. Enable hardware acceleration and reload.');
 await startup.phase('Building terrain on 4 workers',()=>world.ready);
 await startup.phase('Starting GPU',()=>renderer.init());
 if(!renderer.backend.isWebGPUBackend||!renderer.backend.device)throw new Error('No WebGPU adapter. Enable hardware acceleration and reload.');
 startup.attach(renderer.backend.device);
 await startup.phase('Building horde',()=>{horde=new Horde(renderer,scene,field);updateCamera(0,true);updateHUD();});
 await startup.phase('Preparing LTC and combat froxels',async()=>{lighting=new CombatLighting(scene,renderer);await lighting.init();fleet.onAdd=expeditions.onAdd=world.stream.onAdd=root=>lighting.attach(root);lighting.update(camera,0);fx.onExplosion=(p,r)=>lighting.flash(p,'#ff8835',r*130,r*3,.8);},true);
 await startup.phase('Preparing crowd grid',()=>renderer.compute(horde.clear),true);
 await startup.phase('Preparing crowd positions',()=>renderer.compute(horde.snapshot),true);
 await startup.phase('Preparing combat',()=>renderer.compute(horde.sim),true);
 await startup.phase('Preparing blood',()=>renderer.compute([horde.gore.clear,horde.gore.compact]),true);
 await startup.phase('Preparing lighting and effects',async()=>{
   // Exercise the real effect material variants before the first shot/bomb.
   fx.tracer(new T.Vector3(0,1,60),new T.Vector3(0,1,55));
   fx.explosion(new T.Vector3(0,0,60),1);
   fx.skid(new T.Vector3(0,0,60),0,0);
   gun.userData.flash.visible=true;canopy.visible=true;carMesh.userData.driver.visible=true;for(const mesh of [carMesh,jetMesh])for(const flame of mesh.userData.boost)flame.visible=true;
   await renderer.compileAsync(scene,camera);
   renderer.render(scene,camera);
   fx.clear();lighting.clear();lighting.update(camera,0);gun.userData.flash.visible=canopy.visible=carMesh.userData.driver.visible=false;for(const mesh of [carMesh,jetMesh])for(const flame of mesh.userData.boost)flame.visible=false;
 },true);
 await startup.phase('Drawing battlefield',()=>renderer.render(scene,camera),true);
 const params=new URLSearchParams(location.search);
 saves=new GameSave({horde,fleet,expeditions,player,upgrades,combat,course,readRuntime:saveRuntime,writeRuntime:restoreRuntime},{enabled:!params.has('test')||params.has('save-test'),name:params.has('save-test')?'Horde3D-test-'+params.get('save-test'):'Horde3D-expedition',status:text=>{$('save-status').textContent=text;}});
 await startup.phase('Loading expedition checkpoint',async()=>{await saves.load();if(saves.loaded){await world.stream.settled();renderer.compute([horde.clear,horde.snapshot,horde.gore.clear,horde.gore.compact]);renderer.render(scene,camera);if(horde.pending)await horde.pending;acceptStats(await horde.readStats());await renderer.compileAsync(scene,camera);}},true);
 startup.ready();
 $('save-now').disabled=!saves.enabled||saves.blocked;if(saves.loaded)$('play').textContent='Continue expedition';
 const testMode=new URLSearchParams(location.search).has('test');if(testMode){$('gate').hidden=true;paused=true;}
 window.HordeLab={ready:true,renderer,lighting,world,scene,camera,horde,player,car,plane,fleet,expeditions,saves,audio:fx.mixer,keys,pressed,setMode,interact,nearbyVehicle,upgrades,buyUpgrade,vehicleFX,course,drivingFX,get carMesh(){return carMesh;},get jetMesh(){return jetMesh;},combat,ordnance,rideHeight,takeDamage,respawn,resetDriving,
  report:()=>({mode,time,frames,paused,terrain:world.stream.report(),expedition:expeditions.report(),fleet:fleet.report(),audio:fx.mixer.report(),health:currentBody().health,healthByMode:{foot:player.health,car:car.health,jet:plane.health},dead,respawnMode,respawns,shieldSeconds:Math.max(0,shieldUntil-time),scrap:upgrades.scrap,levels:{...upgrades.levels},wreckParts:vehicleFX.parts.length,smokePuffs:vehicleFX.activePuffs,ammo,bombs,bombImpacts,bombsInFlight:activeBombs.length,alive:horde.count-horde.stats.kills,stats:{...horde.stats},position:player.pos.toArray(),carPosition:car.pos.toArray(),jetPosition:plane.pos.toArray(),speed:mode==='car'?car.speed:plane.speed,lighting:{active:lighting.active,froxels:2880,areaLights:lighting.area.length,terrainWorkers:world.terrain.userData.workers},combat:{stamina:combat.stamina,shoves:combat.shoves,missilesFired:combat.missilesFired,ammo:{...combat.ammo},activeMissiles:ordnance.active.length,missileImpacts:ordnance.impacts,gunRounds},suspension:carMesh.userData.suspension.map(l=>({wheelY:l.pivot.position.y,compression:l.compression})),driving:{vx:car.vx,vz:car.vz,slip:car.slip,steer:car.steer,grounded:car.grounded,airTime:car.airTime,jumps,smashed:course.smashed,driver:carMesh.userData.driver.visible,tireMarks:drivingFX.markCount},movement:{speed:Math.hypot(player.vx,player.vz),sprint:player.sprinting,slide:player.slideTime,grounded:player.grounded,parachute:player.parachute,hasChute:player.hasChute,eyeHeight:player.eyeHeight,vy:player.vy},boost:{car:car.boost,jet:plane.boost,active:!!currentBody().boosting},nearby:nearbyVehicle(),trianglesPerEnemy:horde.trianglesPerEnemy,navUpdates,startup:startup.state,frameTiming:frameTiming(),fps:Math.round(1/dtAvg),gpu:renderer.backend.isWebGPUBackend}),
  start:()=>{last=performance.now();paused=false;running=true;saves.started=true;$('gate').hidden=true;},pause:()=>{paused=true;checkpointPause();},restart,
  advance:async(n=1)=>{for(let i=0;i<n;i++){step(1/60);lighting.update(camera,1/60);renderer.render(scene,camera);}await renderer.backend.device.queue.onSubmittedWorkDone();if(horde.pending)await horde.pending;acceptStats(await horde.readStats());return window.HordeLab.report();},
  aim:(yaw,pitch=0)=>{player.yaw=yaw;player.pitch=pitch;updateCamera(0,true);},fire:on=>{mouseDown=on;},secondary:on=>{secondaryDown=on;},steer:(x,y)=>{aimX=x;aimY=y;},bomb:dropBomb,
  resetEnemies:list=>{horde.reset(list);previousHits=previousContacts=previousCar=previousFoot=previousCab=previousJet=0;renderer.render(scene,camera);},
  render:async()=>{syncVehicles();updateCamera(0,true);hudAt=0;updateHUD();lighting.update(camera,0);renderer.render(scene,camera);},
 };
 let idleRenderAt=0;
 renderer.setAnimationLoop(()=>{const now=performance.now(),dt=(now-last)/1000;last=now;if(document.hidden)return;dtAvg=dtAvg*.97+Math.min(dt,.2)*.03;if(!paused){frameSamples.push(dt*1000);if(frameSamples.length>600)frameSamples.shift();step(dt);}else {fx.mixer.setPaused(true);if(now<idleRenderAt)return;}idleRenderAt=now+100;lighting.update(camera,paused?0:Math.min(dt,.035));renderer.render(scene,camera);if(!paused)saves.tick();frames++;});
 console.log('Horde3D READY',horde.count,'mesh enemies',horde.trianglesPerEnemy,'triangles each');
 }catch(e){startup.fail(e);}}
init();
