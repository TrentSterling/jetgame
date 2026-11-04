import {passengerSeat,nearestPassengerCar,passengerExit,canRide,chooseBoardingTarget} from './passenger.js';
import {SeatHandoff} from './seat-handoff.js';
import {Fleet} from './fleet.js';
import {SpawnDefenses} from './defenses.js';
import {BotPlayers} from './bot-players.js';
import {GameSave} from './save-game.js';
import {Expeditions} from './expeditions.js';
import * as T from 'three/webgpu';
import {Field,height,obstacles,terrainRayDistance} from './nav.js';
import {makeWorld} from './world.js';
import {weapon,buggy,jet,parachute,poseVehicleOccupant} from './art.js';
import {Horde} from './horde.js';
import {Effects} from './fx.js';
import {startupUI,withStartupRenderTarget} from './startup.js';
import {flightVector} from './flight.js';
import {stepAircraft,resetAircraftSystems,aircraftTelemetry,aircraftBreakupMotion} from './aircraft-systems.js';
import {flightTelemetry} from './flight-control.js';
import {moveFlightMouse,flightInputFeedback} from './flight-input.js';
import {updateJetExhaust} from './jet-exhaust.js';
import {groundScrapeDamage,resetFlightDamage} from './flight-damage.js';
import {Progression,CLUSTER_UNLOCK} from './progression.js';
import {VEHICLE_KITS,kitEnabled,purchaseKit} from './chaos-state.js';
import {WastelandChaos} from './chaos-runtime.js';
import {VehicleEffects} from './vehicle-fx.js';
import {freeSpot} from './collision.js';
import {resetInfantry,stepInfantry,groundSurface,updateBoost} from './movement.js';

import {resetDriving,stepDriving,drivingSteeringAngle} from './driving.js';
import {trackSurface} from './track-layout.js';
import {StuntCourse} from './stunt-course.js';
import {DrivingEffects} from './driving-fx.js';
import {Combat,carWeaponDirection} from './combat.js';
import {CombatLighting} from './combat-lighting.js';
import {Ordnance} from './ordnance.js';
import {CombatTargets} from './combat-targets.js';
import {GpuHUD} from './gpu-hud.js';
import {missionHUD} from './hud-mission.js';
import {HudNavigation} from './hud-navigation.js';
import {ChaseCamera} from './chase-camera.js';
import {poseSuspension} from './suspension.js';
import {carImpactDamage,dentVehicle,attachVehicleDamage,resetVehicleDamage,repairVehicleDamage} from './vehicle-demolition.js';
import {createWeaponPose,sampleWeaponPose,applyWeaponPose} from './weapon-motion.js';
const combat=new Combat();let lighting,saves;
const rideHeight=(x,z)=>trackSurface(x,z,height);

const canvas=document.getElementById('world');
const scene=new T.Scene(),camera=new T.PerspectiveCamera(75,innerWidth/innerHeight,.05,2400);
const renderer=new T.WebGPURenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
const hud=new GpuHUD();hud.resize(innerWidth,innerHeight);
const ui={screen:'loading',backScreen:'start',message:'',messageUntil:0,saveStatus:'Local expedition checkpoints',continuing:false,sceneFade:0,kitPage:false};
const navigation=new HudNavigation();
const chaseCamera=new ChaseCamera();
const reticlePoint=new T.Vector3(),hudPoint=new T.Vector3(),aimOrigin=new T.Vector3(),aimDirection=new T.Vector3();
const loadingScene=new T.Scene();loadingScene.background=new T.Color('#0b1018');
let hudReady=false,carAim=null,startupTarget=null;
const startupSize=new T.Vector2();
const field=new Field(),world=makeWorld(scene),fx=new Effects(scene),gun=weapon(),canopy=parachute(),defenses=new SpawnDefenses(scene,world,fx),bots=new BotPlayers(scene,world,fx,rideHeight);
let carMesh=buggy(),jetMesh=jet();
scene.add(camera,carMesh,jetMesh,canopy);camera.add(gun);gun.scale.setScalar(.62);gun.position.set(.28,-.23,-.5);gun.rotation.y=-.025;
const gunPose=createWeaponPose(),gunShotTimes=new Float64Array(4).fill(-Infinity);
const gunPoseState={time:0,shotTimes:gunShotTimes,reload:0,speed:0,walk:false,sprinting:false,parachute:false,shoveAnimation:0};let gunShotIndex=0;
const upgrades=new Progression(),vehicleFX=new VehicleEffects(scene,{ground:rideHeight,obstacles}),course=new StuntCourse(scene,world.solids),drivingFX=new DrivingEffects(scene,rideHeight);
drivingFX.fx=fx;
let car={pos:new T.Vector3(-7,0,59),yaw:0,speed:0,health:100,impactAt:0};
const plane={pos:new T.Vector3(25,1,83),yaw:0,pitch:0,flightPitch:0,roll:0,speed:0,skimming:false,health:100,impactAt:0};
carMesh.position.copy(car.pos);jetMesh.position.copy(plane.pos);
const player={pos:new T.Vector3(0,0,70),yaw:0,pitch:0,vy:0,health:100};resetInfantry(player);
for(const body of [car,plane])Object.assign(body,{boost:1,boostDelay:0,boosting:false,boostLocked:false,wallContact:false});
plane.taxiing=true;resetDriving(car);
const fleet=new Fleet(scene,car,carMesh,plane,jetMesh);
const expeditions=new Expeditions(scene,world.solids,(scrap,n)=>{upgrades.rewards+=scrap;player.health=100;if(car.health>0){car.health=Math.min(100,car.health+55);repairVehicleDamage(car,.7);}if(plane.health>0)plane.health=Math.min(100,plane.health+55);bombs=upgrades.bombCapacity;ammo=upgrades.magazine;},message,k=>fx.sound(k));
fleet.update(expeditions.sites,player.pos,null);
let previousFoot=0,previousCab=0,previousJet=0,jumps=0;
let horde,mode='foot',running=false,paused=true,time=0,last=performance.now(),flowAt=0,statsAt=0,shotAt=0,reload=0,ammo=32,bombs=6,bombAt=0,rearm=0,dead=false,won=false,score=0,previousHits=0,previousContacts=0,previousCar=0,hitFade=0,damageFade=0,recoil=0,shakes=0,navUpdates=0,frames=0,dtAvg=1/60;
const impactNormal=new T.Vector3(),impactNormalMatrix=new T.Matrix3();
const keys=new Set(),pressed=new Set();let mouseDown=false,secondaryDown=false,aimX=0,aimY=0;const ray=new T.Raycaster(),forward=new T.Vector3(),right=new T.Vector3(),look=new T.Vector3(),target=new T.Vector4(),carNow=new T.Vector4(),carBefore=new T.Vector4(),blast=new T.Vector4(),jetNow=new T.Vector4(),jetBefore=new T.Vector4(),shot={origin:new T.Vector4(),aim:new T.Vector4(0,0,-1,150),rays:Array.from({length:6},()=>new T.Vector4())};const activeBombs=[];
const melee=new T.Vector4(),meleeAim=new T.Vector4();let blastType=3,gunRounds=0,bombImpacts=0;
const frameSamples=[];
let deathAt=0,respawnAt=0,respawnMode='foot',shieldUntil=0,respawns=0,hurtUntil=0;
let clusterAvailableSeen=false;
const deathPoint=new T.Vector3(),pendingBlasts=[];
const combatTargets=new CombatTargets({snapshot:defenses.crowdSnapshot,generation:()=>horde?.generation,visible:(origin,point)=>{
 const view=new T.Vector3().copy(point).project(camera);if(view.z<0||view.z>1)return false;
 const from=new T.Vector3().copy(origin),direction=new T.Vector3().copy(point).sub(from),distance=direction.length();
 if(distance<.01)return true;direction.multiplyScalar(1/distance);
 return clippedRay(from,direction,distance).range>=distance-.06;
}});
const ordnance=new Ordnance(scene,world.solids,fx,(p,r)=>{pendingBlasts.push({value:new T.Vector4(p.x,p.y,p.z,r),type:5});for(const prop of course.props||[])if(prop.mesh?.visible&&prop.mesh.position.distanceTo(p)<r)course.shatter(prop,12,12,18);},{sweepActors:(start,end,options)=>combatTargets.sweep(start,end,options)});
const chaos=new WastelandChaos(scene,upgrades,fx,{obstacles,clip:clippedRay,message,save:()=>{if(saves?.started)void saves.save({followup:true});},explode:(p,r)=>{if(pendingBlasts.length>=48)return false;pendingBlasts.push({value:new T.Vector4(p.x,p.y,p.z,r),type:5});fx.explosion(p,r);return true;}});
let transitionLeft=0;const transitionFrom=new T.Vector3(),transitionRotation=new T.Quaternion(),transitionTarget=new T.Quaternion();
let passenger=null,carRevision=0,carStatsRevision=0;const seatPoint=new T.Vector3(),driverAnchor=new T.Vector3(),handoff=new SeatHandoff(bots);
const exitVehicles=()=>[...bots.cars.map(c=>({body:c.body,radius:3.6})),...fleet.entries.map(e=>({body:e.body,radius:e.type==='jet'?6:3.6}))];
function bindCar(body,mesh){
 car=body;carMesh=mesh;carAim=null;carRevision++;chaos.invalidateRewards();
 if(handoff.active)driverAnchor.copy(body.pos);
 // Rebinding must never turn the gap between two cars into a collision sweep.
 carBefore.set(body.pos.x,body.pos.y+.9,body.pos.z,0);carNow.copy(carBefore);
}
function releaseDriver(){
 if(!handoff.active)return null;
 const ride=handoff.release(time);bindCar(fleet.car,fleet.active.car.mesh);
 if(ride)poseVehicleOccupant(ride.mesh,ride.body,{seat:'driver',visible:ride.body.health>0});
 return ride;
}
function rideWith(driver,snap=false){
 resetInfantry(player);passenger={driver,epoch:bots.epoch,yaw:driver.body.yaw,anchor:driver.body.pos.clone(),anchorYaw:driver.body.yaw};
 player.yaw=driver.body.yaw;player.pitch=0;syncPassenger();activate('foot',snap);
}
function swapSeats(){
 if(dead)return false;
 if(passenger){
  if(passenger.epoch!==bots.epoch||!bots.cars.includes(passenger.driver)){passenger=null;message('ALLY VEHICLE UNAVAILABLE',1.5);return false;}
  const ride=handoff.take(passenger.driver,time);
  if(!ride){message('WAIT UNTIL THE CAR IS UPRIGHT',1.5);return false;}
  passenger=null;bindCar(ride.body,ride.mesh);activate('car');message('YOU HAVE THE WHEEL · Q HAND BACK',2.5);return true;
 }
 if(mode==='car'&&handoff.valid()){
  const ride=releaseDriver();rideWith(ride.driver);message('ALLY DRIVING · Q TAKE WHEEL',2.5);return true;
 }
 return false;
}
function exitBorrowedDriver(emergency=false){
 if(!handoff.active)return false;
 const body=car,exit=passengerExit(body,rideHeight,obstacles,exitVehicles(),emergency);
 if(!exit){message('EXIT BLOCKED',1);return false;}
 resetInfantry(player);player.pos.set(exit.x,exit.y,exit.z);player.yaw=body.yaw;player.pitch=0;player.vx=exit.vx;player.vz=exit.vz;
 if(exit.airborne){player.vy=5;player.grounded=false;player.hasChute=true;player.chuteDelay=.25;}
 releaseDriver();activate('foot');message(exit.airborne?'EJECTED · SPACE OPEN CHUTE':'ALLY HAS THE WHEEL',2);return true;
}
function checkpointPassenger(){
 const driver=passenger?.driver||handoff.active?.driver;if(!driver)return null;
 const exit=passengerExit(driver.body,rideHeight,obstacles,exitVehicles(),true);
 // Allied vehicles are transient AI actors. Save a safe on-foot location;
 // never manufacture a duplicate fleet car or overwrite a good save in a wall.
 if(!exit)throw Error('Checkpoint waiting for a clear vehicle exit.');
 return exit;
}
function validateDriverBinding(){
 if(!handoff.active)return;
 if(handoff.valid()){driverAnchor.copy(car.pos);return;}
 if(dead){releaseDriver();return;}
 if(handoff.owns()){destroy();return;}
 // A reset can reuse an ally object. Never destroy or drive its new body.
 // Redeploy from the last owned position instead of teleporting to that ally
 // or returning a live foot player to a stale, possibly blocked boarding spot.
 releaseDriver();passenger=null;player.pos.copy(driverAnchor);mode='foot';destroy();
}
function leavePassenger(emergency=false){
 if(!passenger)return false;
 const ride=passenger,exit=passengerExit(ride.driver.body,rideHeight,obstacles,exitVehicles(),emergency);
 if(!exit){message('EXIT BLOCKED',1);return false;}
 passenger=null;resetInfantry(player);player.pos.set(exit.x,exit.y,exit.z);player.vx=exit.vx;player.vz=exit.vz;
 if(exit.airborne){player.vy=5;player.grounded=false;player.hasChute=true;player.chuteDelay=.25;}
 activate('foot',emergency);message(exit.airborne?'EJECTED · SPACE OPEN CHUTE':'ON FOOT',2);return true;
}
function syncPassenger(){
 if(!passenger)return;
 const c=passenger.driver,b=c.body;
 if(!bots.cars.includes(c)||passenger.epoch!==bots.epoch){passenger=null;return;}
 if(!canRide(c)&&((b.health??100)<=0||!c.mesh.visible||Math.abs(b.roll||0)>.95||Math.abs(b.pitch||0)>1.1)){
  if(leavePassenger(true))return;
  // No safe exit exists: retain the seat rather than teleport through a wall.
 }
 player.yaw+=Math.atan2(Math.sin(b.yaw-passenger.yaw),Math.cos(b.yaw-passenger.yaw));passenger.yaw=b.yaw;
 passengerSeat(b,seatPoint);player.pos.copy(seatPoint);player.pos.y-=player.eyeHeight;
 player.vx=player.vz=player.vy=0;player.sprinting=false;player.slideTime=0;player.grounded=false;player.parachute=false;
}
const currentBody=()=>mode==='foot'?player:mode==='car'?car:plane;
function frameTiming(){if(!frameSamples.length)return null;const sorted=[...frameSamples].sort((a,b)=>a-b);return {samples:sorted.length,meanMs:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(2),p95Ms:+sorted[Math.floor(sorted.length*.95)].toFixed(2),maxMs:+sorted.at(-1).toFixed(2)};}
const modeNames={foot:'ON FOOT',car:'BUGGY',jet:'STRIKE AIRCRAFT'};
function message(text,seconds=2){ui.message=text;ui.messageUntil=time+seconds;}
function activate(next,snap=false){
 if(next!=='car')releaseDriver();
 if(next!=='foot')passenger=null;
 transitionFrom.copy(camera.position);transitionRotation.copy(camera.quaternion);transitionLeft=snap?0:.38;
 // Continuous movement carries across boarding; one-shot actions do not.
 chaos.invalidateRewards();mode=next;pressed.clear();mouseDown=secondaryDown=false;aimX=aimY=0;carAim=null;gun.visible=next==='foot';recoil=0;gunShotTimes.fill(-Infinity);gunShotIndex=0;canopy.visible=false;
 if(currentBody().health<=0){destroy();return;}syncVehicles();if(snap)updateCamera(0,true);updateHUD();
}
function boardingTarget(){
 if(mode!=='foot'||dead||passenger)return null;
 return chooseBoardingTarget(nearestPassengerCar(bots.cars,player.pos,obstacles),fleet.nearest(player.pos),player.pos);
}
function nearbyVehicle(){return boardingTarget()?.type??null;}
function exitVehicle(){
 if(passenger)return leavePassenger();
 if(handoff.active)return exitBorrowedDriver();
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
 body.boosting=false;if(previous==='jet')resetAircraftSystems(plane);activate('foot');message(airborne?'EJECTED · SPACE CUT / OPEN CHUTE':'ON FOOT',2);return true;
}
function interact(){
 if(dead)return false;
 if(passenger)return leavePassenger();
 if(mode!=='foot')return exitVehicle();
 const target=boardingTarget();
 if(target?.type==='passenger'){
  const ally=target.driver;
  rideWith(ally);message('RIDING WITH '+ally.kind.toUpperCase()+' · Q TAKE WHEEL · E EXIT',3);return true;
 }
 const entry=target?.entry;if(!entry)return false;const next=entry.type;fleet.select(entry);if(next==='car')bindCar(fleet.car,entry.mesh);else jetMesh=entry.mesh;
 player.parachute=false;activate(next);message(next==='car'?'SHIFT BOOST · E EXIT':'W THROTTLE · MOUSE UP TO LIFT · E EJECT',3);return true;
}
// Explicit test fixture. Gameplay only boards a nearby vehicle via E.
function setMode(next){if(passenger&&next==='foot'){leavePassenger();return;}if(dead){respawnMode=next;return;}
 if(next==='foot'&&mode!=='foot'){exitVehicle();transitionLeft=0;updateCamera(0,true);return;}
 if(next==='jet'&&plane.speed===0){plane.pos.set(25,28,125);plane.speed=28;plane.yaw=plane.pitch=plane.flightPitch=0;plane.taxiing=false;}
 activate(next,true);
}
function startGameplay(){last=performance.now();paused=false;running=true;if(saves)saves.started=true;keys.clear();pressed.clear();mouseDown=secondaryDown=false;ui.screen='game';ui.sceneFade=0;ui.focusAction=null;hud.setPointer(-1,-1);}
function begin(){if(window.bootError){location.reload();return;}if(!window.HordeStartup?.ready)return;startGameplay();ui.sceneFade=1;fx.audioStart();canvas.requestPointerLock?.();}
function pauseGame(screen='pause'){
 paused=true;fx.mixer.setPaused(true);keys.clear();pressed.clear();mouseDown=secondaryDown=false;
 ui.backScreen=running?'pause':'start';ui.screen=screen;ui.focusAction=null;document.exitPointerLock?.();updateHUD();hud.setPointer(-1,-1);
}
function openMenu(screen){pauseGame(screen);checkpointPause();}
function backMenu(){ui.screen=ui.backScreen;ui.focusAction=null;updateHUD();hud.setPointer(-1,-1);}
function handleUIAction(action){
 if(!action)return;
 if(action==='reload'){location.reload();return;}
 if(!window.HordeStartup?.ready)return;
 if(action==='play'||action==='resume'){begin();return;}
 if(action==='save'){if(saves?.enabled&&!saves.blocked)void saves.save();return;}
 if(action==='upgrade-page'){ui.kitPage=!ui.kitPage;ui.focusAction=null;updateHUD();return;}
 if(action==='help'||action==='upgrades'){openMenu(action);return;}
 if(action==='back'){backMenu();return;}
 if(action==='mute'){message(fx.mixer.mute()?'Sound muted':'Sound on');updateHUD();return;}
 if(action==='deploy'){if(respawn()&&paused)begin();return;}
 if(action.startsWith('respawn:')){const next=action.slice(8);if(['foot','car','jet'].includes(next))respawnMode=next;updateHUD();return;}
 if(action.startsWith('upgrade:')){if(buyUpgrade(action.slice(8)))checkpointPause();}
}
function syncVehicles(dt=0,impact=false){
 if(handoff.valid())driverAnchor.copy(car.pos);
 carMesh.position.copy(car.pos);carMesh.position.y+=car.suspension;carMesh.rotation.order='YXZ';carMesh.rotation.set(car.pitch,car.yaw,car.roll);
 poseVehicleOccupant(carMesh,car,{seat:handoff.active?'passenger':'driver',visible:mode==='car'&&!dead,dt});
 const wheelAngle=-drivingSteeringAngle(car);
 for(const wheel of carMesh.userData.wheelPivots)wheel.rotation.y=wheel.position.z<0?wheelAngle:0;
 poseSuspension(carMesh,car,rideHeight,dt);
 attachVehicleDamage(carMesh).sync(car,dt,vehicleFX,impact);
 jetMesh.position.copy(plane.pos);jetMesh.rotation.order='YXZ';jetMesh.rotation.set(plane.flightPitch,plane.yaw,plane.roll);
 updateJetExhaust(jetMesh,plane,time);
}
function breakVehicle(which,impact=null){
 const body=which==='car'?car:plane,mesh=which==='car'?carMesh:jetMesh;if(!mesh.visible)return;
 syncVehicles(0,which==='car');if(which==='car')carMesh.userData.vehicleDamage?.prepareWreck(body);const motion=which==='jet'?aircraftBreakupMotion(plane,impact):null,velocity=which==='car'?new T.Vector3(car.vx,car.vy,car.vz):motion?new T.Vector3().copy(motion.velocity):flightDirection().multiplyScalar(plane.speed);
 vehicleFX.breakup(mesh,velocity,which==='jet'?{physical:true,origin:body.pos,...motion}:undefined);mesh.visible=false;body.speed=body.vx=body.vz=body.vy=0;body.boosting=false;
 fx.explosion(body.pos,10);pendingBlasts.push(new T.Vector4(body.pos.x,body.pos.y,body.pos.z,12));
}
function takeDamage(amount,which=mode,impact=null){
 if(amount<=0||(which===mode&&(dead||time<shieldUntil)))return;
 const body=which==='foot'?player:which==='car'?car:plane;if(body.health<=0)return;
 body.health=Math.max(0,body.health-amount*(body.armor??1));if(which===mode){damageFade=Math.min(.7,amount*.045);hurtUntil=time+.45;}
 if(body.health<=0){if(which!=='foot')breakVehicle(which,impact);if(which===mode)destroy();}
}
function crashDamage(body,speed,impact=null){if(time<body.impactAt||speed<5)return;body.impactAt=time+.8;const which=body===car?'car':'jet';takeDamage(Math.min(65,Math.max(6,(speed-4)*.85)),which,impact);if(which===mode)shakes=.18;fx.sound('crush');}
function destroy(){if(dead)return;passenger=null;dead=true;deathAt=time;respawnAt=time+2.4;respawnMode=mode;deathPoint.copy(currentBody().pos);keys.clear();mouseDown=secondaryDown=false;gun.visible=canopy.visible=false;currentBody().boosting=false;
 if(mode!=='foot')breakVehicle(mode);else fx.sound('bomb');
 releaseDriver();
 shakes=.2;carAim=null;
}
function respawn(){if(!dead||time<deathAt+.65)return false;
 resetFlightDamage(plane);
 const next=respawnMode,z=deathPoint.z>=0?150:-150,yaw=z>0?0:Math.PI;
 combat.stamina=1;combat.shoveDelay=combat.recoverDelay=0;
 dead=false;shieldUntil=time+3.2;hurtUntil=0;respawns++;keys.clear();pressed.clear();mouseDown=secondaryDown=false;aimX=aimY=0;shakes=damageFade=0;reload=0;gunShotTimes.fill(-Infinity);gunShotIndex=0;ammo=upgrades.magazine;bombs=upgrades.bombCapacity;
 const body=next==='foot'?player:next==='car'?car:plane;body.health=player.health=100;body.pos.set(0,next==='jet'?12:next==='foot'?32:0,z);body.yaw=yaw;body.boost=1;body.boostLocked=false;body.boostDelay=0;body.wallContact=false;transitionLeft=0;
 if(next==='car'){resetVehicleDamage(car);car.speed=22;resetDriving(car);car.impactAt=0;carMesh.visible=true;bindCar(car,carMesh);}
 if(next==='jet'){resetAircraftSystems(plane);plane.speed=32;plane.pitch=plane.flightPitch=plane.roll=0;plane.impactAt=0;plane.skimming=plane.taxiing=false;jetMesh.visible=true;jetMesh.userData.jetDamage?.reset();}
 if(next==='foot'){resetInfantry(player);player.pitch=-.2;player.grounded=false;player.hasChute=player.parachute=true;player.vy=-4.5;}
 chaos.invalidateRewards();mode=next;gun.visible=next==='foot';carAim=null;if(!paused)ui.screen='game';syncVehicles();updateCamera(0,true);
 const arrival=new T.Vector3(0,height(0,z),z);fx.explosion(arrival,7);pendingBlasts.push(new T.Vector4(0,arrival.y+.5,z,11));message('BACK IN · 3 SECONDS OF ARMOR',3.2);flowAt=0;return true;
}
function restart(){
 resetFlightDamage(plane);
 releaseDriver();passenger=null;hurtUntil=0;
 keys.clear();pressed.clear();frameSamples.length=0;
 fleet.reset();bindCar(fleet.car,fleet.active.car.mesh);jetMesh=fleet.active.jet.mesh;expeditions.reset();
 for(const b of activeBombs){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}activeBombs.length=0;fx.clear();
 horde.reset();chaos.reset();bots.reset();defenses.reset();defenses.clearShots(horde);lighting?.clear();combat.reset();ordnance.clear();carAim=null;gunRounds=bombImpacts=0;upgrades.reset();vehicleFX.clear();drivingFX.clear();course.reset();jumps=0;pendingBlasts.length=0;resetInfantry(player);player.pos.set(0,0,70);player.health=car.health=plane.health=100;car.impactAt=plane.impactAt=0;carMesh.visible=jetMesh.visible=true;player.yaw=player.pitch=player.vy=0;dead=won=false;shieldUntil=respawns=respawnAt=0;time=0;flowAt=statsAt=shotAt=bombAt=rearm=0;
 clusterAvailableSeen=false;score=previousHits=previousContacts=previousCar=previousFoot=previousCab=previousJet=0;ammo=32;bombs=6;reload=0;shakes=damageFade=hitFade=0;car.pos.set(-7,0,59);car.speed=car.yaw=0;resetDriving(car);plane.pos.set(25,1,83);plane.speed=plane.yaw=plane.pitch=plane.flightPitch=plane.roll=0;plane.skimming=false;
 for(const body of [car,plane])Object.assign(body,{boost:1,boostDelay:0,boostLocked:false,boosting:false,wallContact:false});plane.taxiing=true;resetAircraftSystems(plane);canopy.visible=false;
 ui.message='';ui.messageUntil=0;mode='foot';setMode('foot');
}
function saveRuntime(){return {terrainRevision:2,chaosTracker:chaos.track,mode:handoff.active&&!dead?'foot':mode,time,ammo,bombs,bombAt,rearm,shotAt,reload,dead,won,score,previousHits,previousContacts,previousCar,previousFoot,previousCab,previousJet,deathAt,respawnAt,respawnMode,shieldUntil,hurtUntil,respawns,jumps,gunRounds,bombImpacts,deathPoint:deathPoint.toArray()};}
function restoreRuntime(s){
 chaos.reset();chaos.track=s.chaosTracker??0;
 resetFlightDamage(plane);vehicleFX.clear();ordnance.clear();pendingBlasts.length=0;for(const b of activeBombs){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}activeBombs.length=0;
 releaseDriver();passenger=null;
 hurtUntil=s.hurtUntil??0;
 ({mode,time,ammo,bombs,bombAt,rearm,shotAt,reload,dead,won,score,previousHits,previousContacts,previousCar,previousFoot,previousCab,previousJet,deathAt,respawnAt,respawnMode,shieldUntil,respawns,jumps,gunRounds,bombImpacts}=s);deathPoint.fromArray(s.deathPoint);
 bindCar(fleet.car,fleet.active.car.mesh);jetMesh=fleet.active.jet.mesh;
 keys.clear();pressed.clear();mouseDown=secondaryDown=false;aimX=aimY=0;flowAt=statsAt=0;paused=true;transitionLeft=0;gunShotTimes.fill(-Infinity);gunShotIndex=0;
 world.update(currentBody().pos);expeditions.lastRegion='';expeditions.updateSites(currentBody().pos);fleet.update(expeditions.sites,currentBody().pos,expeditions.party?.vehicle);
 field.update(currentBody().pos.x,currentBody().pos.z);horde.updateFlow();const restored=currentBody().pos;horde.goal.value.set(restored.x,restored.y+.8,restored.z,dead?3:mode==='jet'?2:mode==='car'?1:0);gun.visible=mode==='foot'&&!dead;carAim=null;syncVehicles();updateCamera(0,true);updateHUD();
}
function checkpointPause(){if(saves?.started)void saves.save();}
function updateCamera(dt,snap=false){
 if(dead){chaseCamera.reset();const dest=deathPoint.clone().add(new T.Vector3(8,6,12));if(snap)camera.position.copy(dest);else camera.position.lerp(dest,1-Math.exp(-dt*2.4));camera.up.set(0,1,0);camera.lookAt(deathPoint.clone().add(new T.Vector3(0,1,0)));camera.updateMatrixWorld();projectReticle();return;}
 syncPassenger();
 if(mode==='foot'){chaseCamera.reset();camera.up.set(0,1,0);camera.rotation.order='YXZ';camera.rotation.set(player.pitch,player.yaw,player.slideTime>0?-.035:player.parachute?-Math.sin(time*2)*.018:0);camera.position.copy(player.pos).add(new T.Vector3(0,player.eyeHeight-player.landing*.16,0));const speed=Math.hypot(player.vx,player.vz),walk=player.grounded&&player.slideTime===0;camera.position.y+=walk?Math.sin(time*(player.sprinting?17:12))*.025*Math.min(1,speed/6):0;gunPoseState.time=time;gunPoseState.reload=reload;gunPoseState.speed=speed;gunPoseState.walk=walk;gunPoseState.sprinting=player.sprinting;gunPoseState.parachute=player.parachute;gunPoseState.shoveAnimation=combat.shoveAnimation;applyWeaponPose(gun,sampleWeaponPose(gunPose,gunPoseState));const fov=player.parachute?84:player.slideTime>0?88:player.sprinting?85:75;camera.fov=snap?fov:T.MathUtils.lerp(camera.fov,fov,1-Math.exp(-dt*7));camera.updateProjectionMatrix();}
 else chaseCamera.update(camera,currentBody(),mode==='car'?carMesh:jetMesh,{mode,dt,snap,ground:mode==='car'?rideHeight:height,shake:shakes,time});
 if(transitionLeft>0&&!snap){transitionLeft=Math.max(0,transitionLeft-dt);const t=1-transitionLeft/.38,s=t*t*(3-2*t);camera.position.lerpVectors(transitionFrom,camera.position,s);transitionTarget.copy(camera.quaternion);camera.quaternion.slerpQuaternions(transitionRotation,transitionTarget,s);}
 if(mode==='foot'&&shakes>0){camera.position.x+=Math.sin(time*43)*shakes*.4;camera.position.y+=Math.sin(time*37)*shakes*.4;}
 camera.updateMatrixWorld();
 if(mode!=='foot'&&chaseCamera.initialized)chaseCamera.screen.copy(chaseCamera.anchor).project(camera);
 projectReticle();
}
function projectReticle(){
 reticlePoint.set(0,0,0);
 if(mode==='car')reticlePoint.copy(car.pos).add(new T.Vector3(0,1.95,0)).addScaledVector(carWeaponDirection(car),100).project(camera);
 if(mode==='jet')reticlePoint.copy(plane.pos).addScaledVector(flightDirection(),150).project(camera);
}
function flightDirection(){const f=flightVector(plane);return new T.Vector3(f.x,f.y,f.z);}
function changeMissiles(){
 if(dead||(paused&&ui.screen!=='upgrades'))return false;
 const owned=upgrades.equipment.cluster,changed=owned?upgrades.toggleMissiles():upgrades.buyCluster();
 if(!changed){message('CLUSTER WARHEADS · '+Math.max(0,CLUSTER_UNLOCK.cost-upgrades.scrap)+' MORE SCRAP',2);updateHUD();return false;}
 clusterAvailableSeen=true;message(owned?upgrades.missileWarhead.toUpperCase()+' MISSILES EQUIPPED':'CLUSTER WARHEADS UNLOCKED · RMB INTO A CROWD',3.5);fx.sound('hit');updateHUD();
 if(saves?.started)void saves.save({followup:true});return true;
}
function buyUpgrade(which){if(which.startsWith('kit:')){
 if(dead||(paused&&ui.screen!=='upgrades'))return false;
 const result=purchaseKit(upgrades,which.slice(4));if(!result){message('NOT ENOUGH SCRAP',1.5);return false;}
 message(result.kit.name+(result.purchased?' INSTALLED':result.equipped?' ENABLED':' DISABLED'),2);updateHUD();if(saves?.started)void saves.save({followup:true});return true;
 }if(which==='cluster')return changeMissiles();if(dead||(paused&&ui.screen!=='upgrades'))return false;if(!upgrades.buy(which))return false;if(which==='foot')ammo=Math.min(upgrades.magazine,ammo+8);if(which==='jet')bombs++;message(`${{foot:'CARBINE',car:'BUGGY',jet:'STRIKE KIT'}[which]} ${upgrades.levels[which]} INSTALLED`,2);fx.sound('hit');updateHUD();if(saves?.started)void saves.save({followup:true});return true;}
function clippedRay(origin,dir,range){
 range=terrainRayDistance(origin,dir,range);ray.set(origin,dir);ray.far=range;const hit=ray.intersectObjects(world.solids,false)[0];if(hit)range=Math.min(range,hit.distance);return {range,hit};
}
function updateAimAssist(){
 combatTargets.update(time);
 if(mode!=='car'||dead){carAim=null;return;}
 aimOrigin.copy(car.pos);aimOrigin.y+=1.95;aimDirection.copy(carWeaponDirection(car));
 carAim=combatTargets.aim(aimOrigin,aimDirection,{preferredId:carAim?.id,maxDistance:150,coneDegrees:10});
}
function shoot(){if(time+1e-6<shotAt||reload>0||dead)return false;if(mode==='foot'&&ammo<=0){reload=1.35;return false;}
 camera.getWorldDirection(forward);let origin=camera.position.clone(),dir=forward.clone(),range=180,damage=upgrades.rifleDamage;
 if(mode==='jet'){origin=plane.pos.clone().addScaledVector(flightDirection(),4);dir=flightDirection();range=320;damage=95;}
 if(mode==='car'){origin=car.pos.clone().add(new T.Vector3(0,1.95,0));dir.copy(carAim?.direction||carWeaponDirection(car));damage=95;}
 shot.origin.set(origin.x,origin.y,origin.z,damage);const count=mode==='jet'?6:1;
 // A filled circular cone around the barrel, not a horizontal fan with world-down bias.
 // Share a rotating six-sector pattern per salvo so short bursts cover both axes.
 const coneSide=mode==='jet'?new T.Vector3(Math.cos(plane.yaw),0,-Math.sin(plane.yaw)).applyAxisAngle(dir,-plane.roll):null;
 const coneUp=mode==='jet'?new T.Vector3().crossVectors(coneSide,dir).normalize():null;
 const conePhase=mode==='jet'?Math.random()*Math.PI*2:0;
 for(let i=0;i<6;i++){
  if(i>=count){shot.rays[i].set(0,0,0,0);continue;}
  const d=dir.clone();if(mode==='jet'){const angle=conePhase+i*Math.PI/3,radius=.085*Math.sqrt(Math.random());d.addScaledVector(coneSide,Math.cos(angle)*radius).addScaledVector(coneUp,Math.sin(angle)*radius).normalize();}
  const cast=clippedRay(origin,d,range);shot.rays[i].set(d.x,d.y,d.z,cast.range);if(cast.hit?.object.userData.breakable)course.shatter(cast.hit.object.userData.breakable,d.x*12,d.z*12,12);
  if(cast.hit){impactNormal.copy(cast.hit.face?.normal||new T.Vector3(0,1,0)).applyNormalMatrix(impactNormalMatrix.getNormalMatrix(cast.hit.object.matrixWorld));fx.surfaceImpact(cast.hit.point,impactNormal,mode);}
  else if(cast.range<range-.05){const point=origin.clone().addScaledVector(d,cast.range);impactNormal.set(height(point.x-.2,point.z)-height(point.x+.2,point.z),.4,height(point.x,point.z-.2)-height(point.x,point.z+.2)).normalize();fx.surfaceImpact(point,impactNormal,mode);}
  fx.tracer(mode==='foot'?gun.localToWorld(new T.Vector3(0,.04,-.95)):origin,origin.clone().addScaledVector(d,Math.min(cast.range,150)),mode==='jet'?'#ffe299':'#ffd087',mode==='jet'?.035:.055,mode==='jet'?.025:.018);
 }
 fx.weaponFire(mode==='foot'?gun.localToWorld(new T.Vector3(0,.04,-.95)):origin,dir,mode);
 shot.aim.copy(shot.rays[0]);shotAt=Math.max(time-.035,shotAt)+(mode==='foot'?upgrades.rifleInterval:mode==='jet'?.05:.065);gunRounds+=count;if(mode==='foot'){ammo--;gunShotTimes[gunShotIndex]=time;gunShotIndex=(gunShotIndex+1)%gunShotTimes.length;}recoil=1;gun.userData.flash.visible=mode==='foot';fx.sound('gun');lighting?.flash(origin,'#ffc477',mode==='jet'?140:45,mode==='jet'?24:12,.1,0);return true;
}
function secondary(){
 if(passenger)return false;
 if(dead)return false;
 if(mode==='foot'){
  if(!combat.shove())return false;camera.getWorldDirection(forward);const origin=player.pos.clone().add(new T.Vector3(0,1.1,0));const range=clippedRay(origin,forward,3.8).range;melee.set(origin.x,origin.y,origin.z,22);meleeAim.set(forward.x,forward.y,forward.z,range);fx.sound('shove');return true;
 }
 const warhead=upgrades.missileWarhead,count=combat.missile(mode,warhead);if(!count)return false;const body=currentBody(),dir=mode==='car'?new T.Vector3().copy(carWeaponDirection(car,-.005)):flightDirection();
 const origin=body.pos.clone().add(new T.Vector3(0,mode==='car'?1.8:0,0));
 const assisted=mode==='car'?combatTargets.aim(origin,dir,{preferredId:carAim?.id,maxDistance:150,coneDegrees:10}):null;
 if(assisted)dir.copy(assisted.direction);
 const range=mode==='car'?180:320,cast=clippedRay(origin,dir,range),target=origin.clone().addScaledVector(dir,cast.range);
 if(assisted)target.copy(assisted.point);
 else if(!cast.hit&&cast.range>=range){target.copy(origin).addScaledVector(dir,mode==='car'?95:210);target.y=height(target.x,target.z)+.5;}
 for(let i=0;i<count;i++){
  const side=count===2?(i?1:-1):combat.missilesFired%2?1:-1;
  const launch=origin.clone().addScaledVector(dir,mode==='car'?3.1:4.6).add(new T.Vector3(Math.cos(body.yaw)*side*1.1,0,-Math.sin(body.yaw)*side*1.1));
  // Do not spawn a rack projectile through a wall before its first sweep.
  const offset=launch.clone().sub(origin),length=offset.length();offset.multiplyScalar(1/length);
  const actor=combatTargets.sweep(origin,launch,{time,dt:0,radius:.14});
  const clear=Math.min(clippedRay(origin,offset,length).range,actor?.distance??length);launch.copy(origin).addScaledVector(offset,Math.max(0,Math.min(length,clear-.16)));
  ordnance.launch(launch,dir,target,mode,body.speed,warhead);
 }
 fx.sound('rocket');return true;
}
function dropBomb(){if(mode!=='jet'||bombs<=0||time<bombAt||dead)return false;bombs--;bombAt=time+.6;const mesh=new T.Mesh(new T.SphereGeometry(.3,6,4),new T.MeshStandardMaterial({color:'#eeb856'}));mesh.scale.set(.6,.6,2);mesh.position.copy(plane.pos).add(new T.Vector3(0,-.8,0));scene.add(mesh);activeBombs.push({mesh,vel:flightDirection().multiplyScalar(plane.speed*.7)});return true;}
function carCrash(body,speed,kind,vx,vz){
 if(time<body.impactAt)return;
 const amount=carImpactDamage(speed,kind)*(kind==='landing'&&kitEnabled(upgrades,'dampers')?.45:1);
 // Sub-damage landings still compress suspension and throw sand, once at contact.
 if(kind==='landing'&&speed>5)drivingFX.landing(body,speed);
 if(amount<=0)return;
 body.impactAt=time+.65;dentVehicle(body,speed,kind,vx,vz);
 if(kind==='wall')drivingFX.collision(body,speed,vx,vz);
 takeDamage(amount,'car');if(mode==='car')shakes=Math.min(.16,.04+speed*.002);fx.sound('crush');
}
function driveCar(dt,w,a,boost,handbrake){
 const body=car,incomingX=body.vx||0,incomingZ=body.vz||0,result=stepDriving(body,dt,{throttle:w,steer:a,boost,handbrake,torque:upgrades.torque},rideHeight,obstacles);
 if(result.impactSpeed>5)carCrash(body,result.impactSpeed,'wall',incomingX-body.vx,incomingZ-body.vz);
 if(body!==car)return;
 if(result.landingSpeed>0){chaos.chain.landed(time,car.lastAirTime,Math.hypot(incomingX,incomingZ));car._chaosLanded=time;}
 if(kitEnabled(upgrades,'dampers')&&car.grounded){car.suspensionV*=Math.exp(-dt*4);car.drivePitchV*=Math.exp(-dt*2);}
 if(result.landingSpeed>0)carCrash(body,result.landingSpeed,'landing',incomingX,incomingZ);
 if(body!==car)return;
 if(result.landingSpeed>5&&car.lastAirTime>.35){jumps++;car.boost=Math.min(1,car.boost+.12);if(mode==='car'){shakes=Math.min(.18,result.landingSpeed*.008);fx.sound('crush');}}
 for(const wheel of carMesh.userData.wheels)wheel.rotation.y-=car.speed*dt/.65;
 drivingFX.emit(car,dt,handbrake);
}
function coastVehicles(dt){
 if((mode!=='car'||dead)&&car.health>0)driveCar(dt,0,0,false,false);
 if((mode!=='jet'||dead)&&plane.health>0){
  jetMesh.userData.jetDamage?.begin(plane);
  const flight=stepAircraft(plane,dt,{piloted:false,throttle:0,bank:0,yaw:0,pitch:0,boost:false},rideHeight,obstacles);
  jetMesh.userData.jetDamage?.observe(plane,flight,flight.simulatedDt,time,mode==='jet'&&(dead||time<shieldUntil));
  if(flight.impact&&(!plane.wallContact||flight.impactChanged))crashDamage(plane,flight.impactChanged?flight.newImpactSpeed:flight.impactSpeed,flight.impactMotion);plane.wallContact=flight.impact;
  if(flight.groundImpact>8)crashDamage(plane,flight.groundImpact*1.5);
  takeDamage(groundScrapeDamage(plane,flight,dt,time,mode==='jet'&&(dead||time<shieldUntil)),'jet');
 }
 syncVehicles(dt);
}
function updateControls(dt){
 if(pressed.has('KeyN'))chaos.cycle();
 if(pressed.has('KeyE'))interact();
 else if(pressed.has('KeyQ'))swapSeats();
 const w=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),a=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),shift=keys.has('ShiftLeft')||keys.has('ShiftRight');
 const carBoost=updateBoost(car,mode==='car'&&shift&&w>0,dt);
 if(passenger){syncPassenger();}
 else if(mode==='foot'){
  const wasChute=player.parachute;
  stepInfantry(player,dt,{forward:w,strafe:a,sprint:shift,crouch:keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight'),slide:pressed.has('KeyC')||pressed.has('ControlLeft')||pressed.has('ControlRight'),jump:pressed.has('Space')},rideHeight,obstacles);
  if(wasChute&&player.grounded)shieldUntil=Math.max(shieldUntil,time+1.5);
 }else if(mode==='car'){
  driveCar(dt,w,a,carBoost,keys.has('Space'));
 }else{
  jetMesh.userData.jetDamage?.begin(plane);
  if(pressed.has('KeyC'))aimX=aimY=0;
  const flight=stepAircraft(plane,dt,{piloted:true,throttle:w,bank:a,yaw:aimX,pitch:aimY,boost:shift},rideHeight,obstacles);
  jetMesh.userData.jetDamage?.observe(plane,flight,flight.simulatedDt,time,dead||time<shieldUntil);
  if(flight.impact&&(!plane.wallContact||flight.impactChanged))crashDamage(plane,flight.impactChanged?flight.newImpactSpeed:flight.impactSpeed,flight.impactMotion);plane.wallContact=flight.impact;
  if(flight.groundImpact>8)crashDamage(plane,flight.groundImpact*1.5);
  takeDamage(groundScrapeDamage(plane,flight,dt,time,dead||time<shieldUntil),'jet');
  if(flight.returning)message('AIRFIELD ←',.3);
  if(plane.skimming&&plane.speed>8)fx.skid(plane.pos,plane.yaw,time);
  if(pressed.has('Space'))dropBomb();
  if(bombs<upgrades.bombCapacity){rearm+=dt;if(rearm>upgrades.rearmSeconds){bombs++;rearm=0;}}
 }
 canopy.visible=mode==='foot'&&player.parachute;canopy.position.copy(player.pos);canopy.rotation.set(0,player.yaw,Math.sin(time*2)*.025);const opening=canopy.visible?Math.min(1,canopy.scale.x+dt*5):.08;canopy.scale.set(opening,1,opening);
 for(const flame of carMesh.userData.boost){flame.visible=car.health>0&&car.boosting;flame.scale.y=(car.boosting?2.2:.65)*(1+Math.sin(time*55)*.12);}
 if(pressed.has('KeyR')&&mode==='foot'&&ammo<upgrades.magazine&&reload<=0)reload=1.35;
 if(reload>0){reload=Math.max(0,reload-dt);if(!reload)ammo=upgrades.magazine;}
}
function acceptStats(s,revision=carRevision,rewardEpoch=chaos.rewardEpoch){
 const applyCar=revision===carRevision&&carStatsRevision===carRevision,affectedCar=car,hits=s.hits-previousHits,carHits=s.carContacts-previousCar,jetHits=s.jetContacts-previousJet;
 if(hits>0){hitFade=1;fx.sound('impact');}
 takeDamage(Math.max(0,s.footContactMs-previousFoot)*.006,'foot');if(applyCar&&car===affectedCar)takeDamage(Math.max(0,s.cabContactMs-previousCab)*.0015,'car');
 if(applyCar&&carHits>0){dentVehicle(affectedCar,carHits,'crowd');drivingFX.blood(affectedCar,carHits);hitFade=1;fx.sound('crush');if(car===affectedCar)takeDamage(carHits*.025*(kitEnabled(upgrades,'side')&&Math.abs(Math.sin(affectedCar.slip||0))>.35?.35:1),'car');const drag=Math.max(kitEnabled(upgrades,'ram')?.82:.62,1-carHits*(kitEnabled(upgrades,'ram')?.0025:.007));affectedCar.vx*=drag;affectedCar.vz*=drag;affectedCar.speed*=drag;affectedCar._speed=affectedCar.speed;if(mode==='car')shakes=Math.min(.3,carHits*.025);}
 if(jetHits>0){hitFade=1;fx.sound('crush');takeDamage(jetHits*.018,'jet');if(mode==='jet')shakes=Math.min(.055,jetHits*.004);}
 // The first read after a seat/vehicle exchange establishes a new baseline.
 // Shared cumulative counters cannot attribute that partial interval to a car.
 if(revision===carRevision)carStatsRevision=revision;
 chaos.onStats(s,{body:currentBody(),mode,token:horde.generation+':'+carRevision+':'+mode,active:running&&!paused&&!dead&&revision===carRevision,stale:revision!==carRevision||rewardEpoch!==chaos.rewardEpoch,time});
 previousHits=s.hits;previousContacts=s.contactMs;previousCar=s.carContacts;previousFoot=s.footContactMs;previousCab=s.cabContactMs;previousJet=s.jetContacts;score=s.kills;upgrades.sync(s.scrap);if(running&&!paused&&!dead&&!clusterAvailableSeen&&!upgrades.equipment.cluster&&upgrades.scrap>=CLUSTER_UNLOCK.cost){clusterAvailableSeen=true;message('B  CLUSTER WARHEADS READY · 600 SCRAP',3);}updateHUD();
}

function step(dt){if(!horde)return;dt=Math.min(dt,.035);time+=dt;world.surfaces.update(time);shot.origin.w=0;blast.w=0;blastType=3;melee.w=0;combat.update(dt);
 validateDriverBinding();
 carBefore.set(car.pos.x,car.pos.y+.9,car.pos.z,0);jetBefore.set(plane.pos.x,plane.pos.y,plane.pos.z,0);
 if(!dead)updateControls(dt);coastVehicles(dt);updateCamera(passenger?0:dt);updateAimAssist();if(!passenger&&!dead&&(mouseDown||keys.has('Fire')))shoot();if(!dead&&secondaryDown)secondary();ordnance.update(dt,time);for(const flash of jetMesh.userData.flashes)flash.visible=mode==='jet'&&!dead&&recoil>.6;for(const barrel of jetMesh.userData.guns)barrel.rotation.z+=dt*(mouseDown?45:3);for(let i=0;i<ordnance.active.length&&i<6;i++)lighting?.flash(ordnance.active[i].mesh.position,'#ff962c',80,15,.08,i+1);
 for(let i=activeBombs.length-1;i>=0;i--){const b=activeBombs[i];b.vel.y-=dt*16;b.mesh.position.addScaledVector(b.vel,dt);const gy=height(b.mesh.position.x,b.mesh.position.z);if(b.mesh.position.y<=gy+.2){bombImpacts++;const p=b.mesh.position.clone();p.y=gy;blast.set(p.x,p.y+.5,p.z,upgrades.blastRadius);fx.explosion(p,upgrades.blastRadius);scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();activeBombs.splice(i,1);break;}}
 const pos=currentBody().pos;world.update(pos);expeditions.update(dt,{pos,mode,body:currentBody(),holding:keys.has('KeyF'),dead:dead||!!(expeditions.party&&fleet.entries.find(e=>e.id===expeditions.party.vehicle)?.body.health<=0),damaged:time<hurtUntil,capacity:currentBody().seats??0});fleet.update(expeditions.sites,pos,expeditions.party?.vehicle);fx.mixer.update(dt,{pos,yaw:currentBody().yaw,mode,speed:mode==='foot'?Math.hypot(player.vx,player.vz):currentBody().speed,boost:!!currentBody().boosting,slip:car.slip,grounded:mode==='foot'?player.grounded:car.grounded});target.set(pos.x,pos.y+.8,pos.z,dead?3:mode==='jet'?2:mode==='car'?1:0);
 if(time>flowAt){if(field.update(pos.x,pos.z))horde.updateFlow();flowAt=time+.8;navUpdates++;}
 carNow.set(car.pos.x,car.pos.y+.9,car.pos.z,car.health>0?Math.hypot(car.pos.x-carBefore.x,car.pos.z-carBefore.z)/dt*upgrades.plow*(kitEnabled(upgrades,'ram')?1.25:1):0);
 jetNow.set(plane.pos.x,plane.pos.y,plane.pos.z,plane.health>0?Math.hypot(plane.pos.x-jetBefore.x,plane.pos.z-jetBefore.z)/dt:0);
 const smashed=course.sweep(car,carBefore);if(smashed){car.boost=Math.min(1,car.boost+smashed*.05);fx.sound('crush');if(mode==='car')shakes=.08;}
 defenses.update(dt,time,horde);
 // Allies yield to every visible evacuee and parked/player transport. Their
 // own manager supplies bot-to-bot exclusion without changing the world grid.
 const friendlies=passenger?[]:[{x:pos.x,z:pos.z,r:mode==='foot'?1:3}];
 for(const e of fleet.entries)if(e.body.health>0&&e.body.pos.distanceTo(pos)<260)friendlies.push({x:e.body.pos.x,z:e.body.pos.z,r:e.type==='jet'?5:2.7});
 for(const site of expeditions.sites.values())for(let i=0;i<site.people.length;i++)if(site.people[i].visible){const p=site.state.people[i];friendlies.push({x:p.x,z:p.z,r:1});}
 bots.update(dt,time,{horde,playerPos:pos,playerYaw:currentBody().yaw,mode,friendlies,snapshot:defenses.crowdSnapshot.latest,passengerDriver:passenger?.driver,passengerAnchor:passenger?.anchor,passengerYaw:passenger?.anchorYaw});
 if(passenger){syncPassenger();updateCamera(dt);target.set(player.pos.x,player.pos.y+.8,player.pos.z,dead?3:0);if(!dead&&(mouseDown||keys.has('Fire')))shoot();}
 chaos.step(dt,time,{body:currentBody(),car,carMesh,mode,dead,fire:mouseDown||keys.has('Fire'),drop:pressed.has('KeyG'),holding:keys.has('KeyF'),targets:combatTargets,horde,expeditions,injured:time<hurtUntil,allowEquipment:!handoff.active});
 horde.carStyle.value.set(-Math.sin(car.yaw),-Math.cos(car.yaw),Math.min(1,Math.abs(Math.sin(car.slip||0))*1.5),Math.max(0,1-(time-(car._chaosLanded??-100))/.3));
 if(pendingBlasts.length&&blast.w===0){const event=pendingBlasts.shift();blast.copy(event.value||event);blastType=event.type||3;}
 const pressure=chaos.pressure&&!expeditions.party?chaos.pressure:expeditions.pressure(pos,currentBody().health);pressure.active=pressure.active&&!dead;pressure.sheltered=pressure.sheltered||dead;horde.setPressureContext(pressure);
 horde.updateView(camera);
 horde.step(dt,time,target,shot,blast,carNow,carBefore,mode==='jet'?3:1,jetNow,jetBefore,melee,meleeAim,blastType);
 course.update(dt);drivingFX.update(dt);fx.update(dt);vehicleFX.update(dt,{car,jet:plane});recoil=Math.max(0,recoil-dt*8);if(recoil<.55)gun.userData.flash.visible=false;shakes*=Math.exp(-dt*15);hitFade=Math.max(0,hitFade-dt*5);damageFade=Math.max(0,damageFade-dt*2);
 if(time>statsAt&&!horde.pending){statsAt=time+.14;const revision=carRevision,generation=horde.generation,rewardEpoch=chaos.rewardEpoch;horde.readStats().then(s=>{if(generation===horde.generation)acceptStats(s,revision,rewardEpoch);});}

 if(score>=500&&!won){won=true;message('500 kills. The survivors still need a way out.',5);}
 if(dead){message(`${respawnMode.toUpperCase()} IN ${Math.max(0,respawnAt-time).toFixed(1)} · 1/2/3 CHOOSE${time-deathAt>.65?' · R LAUNCH':''}`,.2);if(time>=respawnAt)respawn();}
 pressed.clear();
}

function updateHUD(){
 projectReticle();
 const body=currentBody(),opportunity=chaos.target(body.pos,expeditions),destination=opportunity||expeditions.target,mission=missionHUD(expeditions,body.pos,mode,{groundHeight:height(body.pos.x,body.pos.z),vehicleId:body.fleetId??null});
 const boarding=boardingTarget();
 if(passenger){mission.actionKey='E';mission.action='Exit passenger seat';mission.interactionProgress=0;}
 else if(boarding?.driver&&mission.actionKey!=='F'){mission.actionKey='E';mission.action='Ride with '+boarding.driver.kind;mission.interactionProgress=0;}
 else if(boarding?.entry&&mission.actionKey!=='F'){mission.actionKey='E';mission.action=boarding.entry.name+' · '+boarding.entry.body.seats+' seats';mission.interactionProgress=0;}
 else if(!mission.action){
  if(mode==='foot'&&(player.parachute||player.hasChute)){mission.actionKey='SPACE';mission.action=player.parachute?'Cut chute · SHIFT dive':'Open parachute';}
  else if(mode!=='foot'){mission.actionKey='E';mission.action=mode==='jet'&&plane.pos.y-height(plane.pos.x,plane.pos.z)>4?'Eject':'Exit vehicle';}
 }
 if(opportunity){mission.mission=opportunity.name;mission.missionDetail=opportunity.detail;if(opportunity.kills>=opportunity.goal&&opportunity.distance<12&&opportunity.kind!=='horde'){mission.actionKey='F';mission.action='Salvage supplies';mission.interactionProgress=chaos.hold/2.2;}}
 if(chaos.crewLabel&&!opportunity)mission.missionDetail='CREW: '+chaos.crewLabel;
 let waypoint=null,aim=null,jet=null;
 if(destination&&!dead)waypoint=navigation.update(camera,{x:destination.x,y:height(destination.x,destination.z)+2,z:destination.z,label:destination.label||'REFUGE',distance:destination.distance},body.pos,body.yaw);
 if(carAim&&mode==='car'&&!dead){hudPoint.copy(carAim.point).project(camera);if(hudPoint.z>=0&&hudPoint.z<=1)aim={x:hudPoint.x,y:hudPoint.y,strength:1,locked:true};}
 if(mode==='jet'&&!dead){const input=flightInputFeedback(aimX,aimY,plane),recovery=flightTelemetry(plane).lowAirspeed&&!plane.taxiing&&plane.pos.y-height(plane.pos.x,plane.pos.z)>6;jet={commandX:input.x,commandY:-input.y,noseX:reticlePoint.x,noseY:reticlePoint.y,limited:!!input.limit,limitLabel:input.limit,recovery};}
 hud.update({
  screen:ui.screen==='game'&&dead?'death':ui.screen,mode,modeLabel:passenger?'PASSENGER · '+passenger.driver.kind:handoff.active?'DRIVING · '+handoff.active.driver.kind:mode==='foot'?modeNames.foot:fleet.active[mode].name,
  health:body.health,shielded:time<shieldUntil,ammo,ammoMax:upgrades.magazine,ammoSuffix:'/ '+upgrades.magazine,weapon:mode==='foot'?'CARBINE':mode==='car'?'SPEED':'AIRSPEED',
  speed:Math.abs(body.speed||0)*3.6,altitude:Math.max(0,plane.pos.y-height(plane.pos.x,plane.pos.z)),missiles:combat.ammo[mode]||0,bombs,missileWarhead:upgrades.missileWarhead,
  boost:mode==='foot'?combat.stamina:body.boost,boosting:mode==='foot'?combat.shoveAnimation>0:!!body.boosting,boostLocked:!!body.boostLocked,reload:mode==='foot'&&reload>0?1-reload/1.35:0,
  ...mission,seatAction:passenger?'Take wheel':handoff.active?'Hand back wheel':'',message:time<=ui.messageUntil?ui.message:'',hit:hitFade,damage:damageFade,reticle:{x:reticlePoint.x,y:reticlePoint.y},waypoint,aim,jet,
  kills:score,rescued:expeditions.rescued,relays:expeditions.relays,scrap:upgrades.scrap,kitPage:ui.kitPage,boostReward:time<chaos.chain.displayUntil&&chaos.chain.gained>.001?'+'+Math.round(chaos.chain.gained*100)+'% BOOST':'',mines:mode==='car'&&kitEnabled(upgrades,'mines')?upgrades.mineAmmo:-1,
  upgrades:ui.kitPage?VEHICLE_KITS.map(k=>({id:'kit:'+k.id,key:k.key,name:k.name,detail:k.detail,cost:k.cost,level:upgrades.vehicleKit.owned&k.bit?1:0,equipped:!!(upgrades.vehicleKit.enabled&k.bit),available:!dead&&(!!(upgrades.vehicleKit.owned&k.bit)||upgrades.scrap>=k.cost)})):[...['foot','car','jet'].map((id,i)=>({id,key:['Z','X','V'][i],name:['CARBINE','TORQUE','STRIKE KIT'][i],detail:['Damage, magazine, fire rate','Acceleration and crowd impact','Bombs, blast and rearm'][i],level:upgrades.levels[id],cost:upgrades.cost(id),available:!dead&&upgrades.scrap>=upgrades.cost(id)&&upgrades.levels[id]<3})),{id:'cluster',key:'B',name:CLUSTER_UNLOCK.name,detail:'4 bomblets · Slower rearm',level:upgrades.equipment.cluster?1:0,cost:CLUSTER_UNLOCK.cost,equipped:upgrades.missileWarhead==='cluster',available:!dead&&(upgrades.equipment.cluster||upgrades.scrap>=CLUSTER_UNLOCK.cost)}],
  respawnMode,respawnSeconds:Math.max(0,respawnAt-time),deployAvailable:dead&&time>=deathAt+.65,keyboardOnly:document.pointerLockElement===canvas,
  ready:!!window.HordeStartup?.ready,progress:window.HordeStartup?.progress||0,phase:window.HordeStartup?.phase||'Starting graphics',phaseDetail:window.HordeStartup?.phaseDetail||'Preparing the game renderer.',phaseIndex:window.HordeStartup?.phaseIndex||0,phaseCount:window.HordeStartup?.phaseCount||14,error:window.bootError||'',sceneFade:ui.sceneFade,
  saveStatus:ui.saveStatus,saveAvailable:!!saves?.enabled&&!saves.blocked,continuing:ui.continuing,muted:fx.mixer.muted,version:'0.15.0',
 });
}
function renderFrame(dt=0){
 if(ui.screen==='game'&&ui.sceneFade>0)ui.sceneFade=Math.max(0,ui.sceneFade-Math.max(0,dt)/.18);
 updateHUD();
 // Menus render at display cadence without re-drawing a paused 12,000-actor
 // battlefield. Active play and programmatic gameplay fixtures render both.
 if(paused&&ui.screen!=='game')renderer.render(loadingScene,camera);
 else{lighting?.update(camera,dt);renderer.render(scene,camera);}
 hud.render(renderer);
}
function focusMenu(direction=1){
 const buttons=hud.report().hitRegions.filter(button=>!button.disabled);if(!buttons.length)return;
 const at=buttons.findIndex(button=>button.action===ui.focusAction),next=buttons[(at+direction+buttons.length)%buttons.length];
 ui.focusAction=next.action;hud.setPointer(next.x+next.w/2,next.y+next.h/2);
}
function menuKey(e){
 if(e.code==='KeyU'&&window.HordeStartup?.ready){ui.kitPage=true;openMenu('upgrades');return;}
 if(e.code==='Escape'){if(!window.HordeStartup?.ready)return;if(ui.screen==='help'||ui.screen==='upgrades')backMenu();else pauseGame(running?'pause':'start');checkpointPause();return;}
 if(e.code==='KeyH'){if(window.HordeStartup?.ready){if(ui.screen==='help')backMenu();else openMenu('help');}return;}
 if(e.code==='KeyM'){message(fx.mixer.mute()?'Sound muted':'Sound on',2);updateHUD();return;}
 if(!paused)return;
 if(e.code==='Tab'||e.code==='ArrowDown'||e.code==='ArrowUp'){focusMenu(e.shiftKey||e.code==='ArrowUp'?-1:1);return;}
 if(e.code==='Enter'||e.code==='Space'){handleUIAction(ui.focusAction||(ui.screen==='pause'?'resume':ui.screen==='start'?'play':ui.screen==='error'?'reload':null));}
}
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','Tab'].includes(e.code)||(!paused&&e.ctrlKey))e.preventDefault();if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);if(e.repeat)return;if(dead){if(e.code==='Digit1')respawnMode='foot';if(e.code==='Digit2')respawnMode='car';if(e.code==='Digit3')respawnMode='jet';if(e.code==='KeyR')respawn();}if(['Escape','KeyH','KeyM','KeyU','Tab','ArrowDown','ArrowUp','Enter','Space'].includes(e.code))menuKey(e);});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pressed.clear();mouseDown=secondaryDown=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpointPause();});
window.addEventListener('pagehide',checkpointPause);
window.addEventListener('keydown',e=>{if(!e.repeat){if(!dead&&paused&&ui.screen==='upgrades'&&ui.kitPage&&/^Digit[1-5]$/.test(e.code)){buyUpgrade('kit:'+VEHICLE_KITS[Number(e.code.slice(-1))-1].id);return;}const m={KeyZ:'foot',KeyX:'car',KeyV:'jet',KeyB:'cluster'}[e.code];if(m)buyUpgrade(m);}});
window.addEventListener('mousemove',e=>{
 if(document.pointerLockElement!==canvas){if(paused){ui.focusAction=hud.hitTest(e.clientX,e.clientY);hud.setPointer(e.clientX,e.clientY);}return;}
 if(paused||dead)return;
 if(mode==='foot'){player.yaw-=e.movementX*.002;player.pitch=T.MathUtils.clamp(player.pitch-e.movementY*.002,-1.4,1.4);}
 else if(mode==='jet'){const input=moveFlightMouse(aimX,aimY,e.movementX,e.movementY);aimX=input.x;aimY=input.y;}
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
 if(e.button!==0&&e.button!==2)return;
 if(window.bootError){if(e.button===0)location.reload();return;}
 if(paused||document.pointerLockElement!==canvas){if(e.button===0)handleUIAction(hud.hitTest(e.clientX,e.clientY));return;}
 if(dead)return;
 if(e.button===0)mouseDown=true;else secondaryDown=true;
});
window.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;if(e.button===2)secondaryDown=false;});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&!new URLSearchParams(location.search).has('test')){if(!paused||ui.screen==='game')pauseGame(running?'pause':'start');checkpointPause();}});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);hud.resize(innerWidth,innerHeight);updateHUD();});
function warmBattlefield(){
 renderer.getDrawingBufferSize(startupSize);
 if(!startupTarget)startupTarget=new T.RenderTarget(startupSize.x,startupSize.y,{samples:renderer.samples,depthBuffer:true});
 else startupTarget.setSize(startupSize.x,startupSize.y);
 withStartupRenderTarget(renderer,startupTarget,()=>renderer.render(scene,camera));
}
const startup=startupUI(renderer,{phaseCount:14,onChange:state=>{
 ui.screen=state.failed?'error':state.ready?'start':'loading';
 if(state.failed){paused=true;keys.clear();pressed.clear();mouseDown=secondaryDown=false;fx.mixer.setPaused(true);if(document.pointerLockElement===canvas)document.exitPointerLock?.();}
 updateHUD();
 if(hudReady&&!state.failed){renderer.render(loadingScene,camera);hud.render(renderer);}
}});
async function init(){try{
 if(!navigator.gpu)throw new Error('WebGPU is unavailable. Enable hardware acceleration and reload.');
 await startup.phase('Starting graphics',()=>renderer.init(),false,{detail:'Connecting to your GPU and preparing the renderer.'});
 if(!renderer.backend.isWebGPUBackend||!renderer.backend.device)throw new Error('No WebGPU adapter. Enable hardware acceleration and reload.');
 startup.attach(renderer.backend.device);
 await startup.phase('Preparing the interface',async()=>{updateHUD();await renderer.compileAsync(hud.scene,hud.camera);hudReady=true;renderer.render(loadingScene,camera);hud.render(renderer);},true,{detail:'Building the GPU text, aiming markers and menus.'});
 await startup.phase('Building the wasteland',()=>world.ready,false,{detail:'Generating terrain and routes around your starting area.'});
 await startup.phase('Assembling the horde',()=>{horde=new Horde(renderer,scene,field);updateCamera(0,true);updateHUD();},false,{detail:'Creating the zombie crowd and its movement data.'});
 await startup.phase('Lighting the battlefield',async()=>{lighting=new CombatLighting(scene,renderer);await lighting.init();fleet.onAdd=expeditions.onAdd=world.stream.onAdd=root=>lighting.attach(root);lighting.update(camera,0);fx.onExplosion=(p,r)=>{lighting.flash(p,'#ff8835',r*130,r*3,.8);if(running&&!paused){const distance=currentBody().pos.distanceTo(p);if(distance<r*5)shakes=Math.max(shakes,Math.min(mode==='jet'?.1:.22,r*.022/(1+distance*.12)));}};},true,{detail:'Preparing sunlight, shadows and light from explosions.'});
 await startup.phase('Mapping crowd routes',()=>renderer.compute(horde.clear),true,{detail:'Preparing shared routes for the horde to follow.'});
 await startup.phase('Placing the crowd',()=>renderer.compute(horde.snapshot),true,{detail:'Uploading zombie positions to the battlefield.'});
 await startup.phase('Preparing combat',()=>renderer.compute(horde.sim),true,{detail:'Setting up enemy movement, contact and damage.'});
 await startup.phase('Preparing impact effects',()=>renderer.compute([horde.gore.clear,horde.gore.compact]),true,{detail:'Preparing blood, debris and enemy death effects.'});
 await startup.phase('Warming weapons and effects',async()=>{
   // Exercise the real effect material variants before the first shot/bomb.
   fx.tracer(new T.Vector3(0,1,60),new T.Vector3(0,1,55));
   fx.explosion(new T.Vector3(0,0,60),1);
   fx.skid(new T.Vector3(0,0,60),0,0);
   gun.userData.flash.visible=true;canopy.visible=true;carMesh.userData.driver.visible=true;for(const mesh of [carMesh,jetMesh])for(const flame of mesh.userData.boost)flame.visible=true;
   updateJetExhaust(jetMesh,{health:100,boosting:true,speed:0},0);
   defenses.warm(true);bots.warm(true);ordnance.warm(true);await renderer.compileAsync(scene,camera);
   warmBattlefield();defenses.warm(false);bots.warm(false);ordnance.warm(false);
   fx.clear();lighting.clear();lighting.update(camera,0);gun.userData.flash.visible=canopy.visible=carMesh.userData.driver.visible=false;for(const mesh of [carMesh,jetMesh])for(const flame of mesh.userData.boost)flame.visible=false;
   updateJetExhaust(jetMesh,plane,time);
 },true,{detail:'Preparing weapon flashes, vehicles and explosions before you play.'});
 const params=new URLSearchParams(location.search);
 saves=new GameSave({horde,defenses,bots,fleet,expeditions,player,upgrades,combat,course,readRuntime:saveRuntime,writeRuntime:restoreRuntime,checkpointPlayer:checkpointPassenger},{enabled:!params.has('test')||params.has('save-test'),name:params.has('save-test')?'Horde3D-test-'+params.get('save-test'):'Horde3D-expedition',status:text=>{ui.saveStatus=text;updateHUD();}});
 await startup.phase('Restoring your expedition',async()=>{await saves.load();ui.continuing=!!saves.loaded;if(saves.loaded){await world.stream.settled();renderer.compute([horde.clear,horde.snapshot,horde.gore.clear,horde.gore.compact]);if(horde.pending)await horde.pending;acceptStats(await horde.readStats());}},true,{detail:'Checking your local checkpoint and restoring vehicles, survivors and progress.'});
 await startup.phase('Synchronizing targets',async()=>{await defenses.crowdSnapshot.read(horde,time);combatTargets.update(time);},true,{detail:'Preparing enemy contacts for missiles and aim assistance.'});
 await startup.phase('Preparing combat sounds',()=>fx.mixer.prepare(),false,{detail:'Loading weapon and impact sounds. Playback starts when you enter.'});
 await startup.phase('Preparing your final view',async()=>{syncVehicles();updateCamera(0,true);lighting.update(camera,0);await renderer.compileAsync(scene,camera);warmBattlefield();},true,{detail:ui.continuing?'Warming the battlefield at your saved position. Your expedition is almost ready.':'Warming your starting area. Your first expedition is almost ready.'});
 startup.ready();
 const testMode=new URLSearchParams(location.search).has('test');if(testMode){ui.screen='game';paused=true;}
 window.HordeLab={ready:true,chaos,hud,combatTargets,renderer,lighting,defenses,bots,world,scene,camera,horde,player,get car(){return car;},plane,fleet,expeditions,saves,chaseCamera,audio:fx.mixer,keys,pressed,setMode,interact,swapSeats,nearbyVehicle,upgrades,buyUpgrade,changeMissiles,vehicleFX,course,drivingFX,get carMesh(){return carMesh;},get jetMesh(){return jetMesh;},combat,ordnance,rideHeight,takeDamage,respawn,resetDriving,
  report:()=>({mode,chaos:chaos.report(),seatHandoff:handoff.active?{driver:handoff.active.driver.kind,index:handoff.active.driver.index,epoch:handoff.active.epoch,valid:handoff.valid()}:null,hud:hud.report(),targeting:combatTargets.report(),passenger:passenger?{driver:passenger.driver.kind,index:passenger.driver.index,seat:passengerSeat(passenger.driver.body),epoch:passenger.epoch}:null,time,frames,paused,bots:bots.report(),crowdSnapshot:defenses.crowdSnapshot.report(),defenses:defenses.report(),terrain:world.stream.report(),expedition:expeditions.report(),fleet:fleet.report(),audio:fx.mixer.report(),health:currentBody().health,healthByMode:{foot:player.health,car:car.health,jet:plane.health},dead,respawnMode,respawns,shieldSeconds:Math.max(0,shieldUntil-time),scrap:upgrades.scrap,levels:{...upgrades.levels},equipment:{...upgrades.equipment},cameraRig:chaseCamera.report(),wreckParts:vehicleFX.parts.length,smokePuffs:vehicleFX.activePuffs,ammo,bombs,bombImpacts,bombsInFlight:activeBombs.length,alive:horde.stats.alive,pressure:{...horde.pressure.report},effects:fx.report(),stats:{...horde.stats},position:player.pos.toArray(),carPosition:car.pos.toArray(),jetPosition:plane.pos.toArray(),flight:flightTelemetry(plane),steering:flightInputFeedback(aimX,aimY,plane),aircraft:aircraftTelemetry(plane),speed:mode==='car'?car.speed:plane.speed,lighting:{active:lighting.active,froxels:2880,areaLights:lighting.area.length,terrainWorkers:world.terrain.userData.workers},combat:{stamina:combat.stamina,shoves:combat.shoves,missilesFired:combat.missilesFired,ammo:{...combat.ammo},activeMissiles:ordnance.active.length,missileImpacts:ordnance.impacts,gunRounds},suspension:carMesh.userData.suspension.map(l=>({wheelY:l.pivot.position.y,compression:l.compression})),driving:{vx:car.vx,vz:car.vz,slip:car.slip,steer:car.steer,grounded:car.grounded,airTime:car.airTime,jumps,smashed:course.smashed,driver:carMesh.userData.driver.visible,tireMarks:drivingFX.markCount},movement:{speed:Math.hypot(player.vx,player.vz),sprint:player.sprinting,slide:player.slideTime,grounded:player.grounded,parachute:player.parachute,hasChute:player.hasChute,eyeHeight:player.eyeHeight,vy:player.vy},boost:{car:car.boost,jet:plane.boost,active:!!currentBody().boosting},nearby:nearbyVehicle(),trianglesPerEnemy:horde.trianglesPerEnemy,navUpdates,startup:startup.state,frameTiming:frameTiming(),fps:Math.round(1/dtAvg),gpu:renderer.backend.isWebGPUBackend}),
  start:startGameplay,pause:()=>{paused=true;checkpointPause();},restart,
  advance:async(n=1)=>{for(let i=0;i<n;i++){step(1/60);renderFrame(1/60);}await renderer.backend.device.queue.onSubmittedWorkDone();if(horde.pending)await horde.pending;acceptStats(await horde.readStats());return window.HordeLab.report();},
  aim:(yaw,pitch=0)=>{player.yaw=yaw;player.pitch=pitch;updateCamera(0,true);},fire:on=>{mouseDown=on;},secondary:on=>{secondaryDown=on;},steer:(x,y)=>{aimX=x;aimY=y;},bomb:dropBomb,
  resetEnemies:list=>{horde.reset(list);carAim=null;updateAimAssist();previousHits=previousContacts=previousCar=previousFoot=previousCab=previousJet=0;renderFrame();},
  render:async()=>{syncVehicles();updateCamera(0,true);updateAimAssist();renderFrame();},
 };
 renderer.setAnimationLoop(()=>{
  const now=performance.now(),dt=(now-last)/1000;last=now;if(document.hidden)return;
  dtAvg=dtAvg*.97+Math.min(dt,.2)*.03;
  if(!paused){frameSamples.push(dt*1000);if(frameSamples.length>600)frameSamples.shift();step(dt);}else fx.mixer.setPaused(true);
  renderFrame(paused?0:Math.min(dt,.035));if(!paused)saves.tick();frames++;
 });
 console.log('Horde3D READY',horde.count,'mesh enemies',horde.trianglesPerEnemy,'triangles each');
 }catch(e){startup.fail(e);}finally{startupTarget?.dispose();startupTarget=null;}}
init();

