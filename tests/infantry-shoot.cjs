const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
const {InfantryArsenal,BREACHER,breacherPellet}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(__dirname+'/../src/infantry-arsenal.js')).toString('base64'));
class V{constructor(x=0,y=0,z=0,w=0){Object.assign(this,{x,y,z,w});}set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}clone(){return new V(this.x,this.y,this.z,this.w)}copy(v){Object.assign(this,v);return this}add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this}addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this}normalize(){let n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this}applyQuaternion(){return this}applyAxisAngle(){return this}crossVectors(a,b){return this.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x)}}
let c={T:{Vector3:V},InfantryArsenal,BREACHER,breacherPellet,time:1,shotAt:0,carShotAt:0,jetShotAt:0,mode:'foot',reload:0,dead:false,ammo:32,upgrades:{rifleDamage:40,rifleInterval:.12},camera:{position:new V(),quaternion:{},getWorldDirection(v){return v.set(0,0,-1)}},forward:new V(),car:{pos:new V()},carAim:null,plane:{pos:new V(),yaw:0,roll:0},flightDirection:()=>new V(0,0,-1),carWeaponDirection:()=>new V(0,0,-1),shot:{origin:new V(),rays:Array.from({length:6},()=>new V()),aim:new V()},clippedRay:(o,d,range)=>({range}),fx:{tracer(){},weaponFire(){},sound(){}},gun:{localToWorld:v=>v,userData:{flash:{}}},lighting:null,gunRounds:0,gunShotTimes:new Float64Array(4),gunShotIndex:0,recoil:0,arsenal:new InfantryArsenal()};
vm.createContext(c);const main=fs.readFileSync(process.env.JET_TEST_MAIN||__dirname+'/../src/main.js','utf8');vm.runInContext(main.slice(main.indexOf('function shoot(){'),main.indexOf('function secondary(){')),c);
// Run real input callbacks and boarding code. The nearby parked vehicle,
 // pointer lock and rendering are fixture state, not a browser playtest.
 const extract=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
 const listeners={};
 const capture={addEventListener:(type,fn)=>{listeners[type]=fn;}};
 const entry={type:'car',mesh:{}};
 Object.assign(c,{window:capture,canvas:capture,document:{pointerLockElement:capture,addEventListener(){}},paused:false,
  keys:new Set(),pressed:new Set(),mouseDown:false,secondaryDown:false,aimX:0,aimY:0,passenger:null,
  camera:{...c.camera,quaternion:{}},transitionFrom:{copy(){}},transitionRotation:{copy(){}},
  transitionLeft:0,canopy:{},carMesh:{},jetMesh:{},chaos:{invalidateRewards(){}},releaseDriver(){},
  syncVehicles(){},updateHUD(){},message(){},currentBody:()=>({health:100}),boardingTarget:()=>({entry}),
  fleet:{select(){}},bindCar(){},player:{},menuKey(){}});
 vm.runInContext(extract('function activate(', 'function boardingTarget(')+
  extract('function interact(', '// Explicit test fixture.')+
  extract("window.addEventListener('keydown',e=>{if(['Space'", "document.addEventListener('visibilitychange'")+
  extract("canvas.addEventListener('mousedown'", "document.addEventListener('pointerlockchange'")+
  'function controlTick(){'+extract("if(pressed.has('KeyE'))interact();", ' const w=Number(keys.has')+
  'if(mouseDown)shoot();pressed.clear();}',c);
 for(const type of ['car','jet']){
  Object.assign(c,{mode:'foot',time:2,shotAt:0,carShotAt:0,jetShotAt:0,gunRounds:0});
  entry.type=type;c.arsenal.reward();c.arsenal.select('breacher');
  listeners.mousedown({button:0});c.controlTick();assert.equal(c.gunRounds,6);
  c.time+=1/60;listeners.keydown({code:'KeyE'});c.controlTick();listeners.keyup({code:'KeyE'});
  assert.equal(c.mode,type);assert.equal(c.gunRounds,6,'boarding must clear a held trigger');
  c.time+=1/60;listeners.mouseup({button:0});listeners.mousedown({button:0});c.controlTick();listeners.mouseup({button:0});
  assert.equal(c.gunRounds,6+(type==='car'?1:6),type+' must fire on a fresh press before the infantry deadline');
 }
 Object.assign(c,{mode:'foot',time:1,shotAt:0,carShotAt:0,jetShotAt:0,gunRounds:0});c.arsenal.reset();
assert(c.shoot());assert.equal(c.ammo,31);assert.equal(c.shot.origin.w,40);assert.equal(c.shot.rays[0].w,180);assert.equal(c.shot.rays[1].w,0);
c.arsenal.reward();c.arsenal.select('breacher');c.time=2;assert(c.shoot());assert.equal(c.ammo,31);assert.equal(c.arsenal.shells,5);assert.equal(c.shot.origin.w,19);assert(c.shot.rays.every(r=>r.w===24));assert.equal(c.shotAt,2.815);assert(!c.shoot());
// Candidate scopes the deadlines to infantry, buggy and aircraft, without
// letting a quick mode change refresh the cooldown of a weapon already fired.
c.time=2.02;c.mode='car';assert(c.shoot());assert.equal(c.shot.origin.w,95);assert.equal(c.shotAt,2.815);assert.equal(c.arsenal.shells,5);assert.equal(c.ammo,31);
const buggyDeadline=c.carShotAt;assert(buggyDeadline>c.time);assert(!c.shoot());
c.time=2.03;c.mode='jet';assert(c.shoot());assert(c.shot.rays.every(r=>r.w===320));assert.equal(c.shot.origin.w,95);
const aircraftDeadline=c.jetShotAt;assert(aircraftDeadline>c.time);assert(!c.shoot());
c.mode='car';assert(!c.shoot());assert.equal(c.carShotAt,buggyDeadline);
c.mode='foot';assert(!c.shoot());assert(c.arsenal.select('carbine'));assert(!c.shoot());assert.equal(c.ammo,31);assert(c.arsenal.select('breacher'));
for(const [mode,deadline,k,interval] of [['car',buggyDeadline,'carShotAt',.065],['jet',aircraftDeadline,'jetShotAt',.05]].sort((a,b)=>a[1]-b[1])){c.time=deadline;c.mode=mode;assert(c.shoot());assert.equal(c[k],deadline+interval);}
c.time=2.815;c.mode='foot';assert(c.shoot());assert.equal(c.arsenal.shells,4);
c.time=4;c.arsenal.beginReload();assert(!c.shoot());c.mode='car';assert(c.shoot());assert.equal(c.arsenal.shells,4);
// Exercise the real persistence code up through cadence restoration.
 const saveSource=fs.readFileSync(__dirname+'/../src/save-game.js','utf8');
 const validator=saveSource.slice(saveSource.indexOf('export const SAVE_SCHEMA'),saveSource.indexOf(' if(!s.upgrades')).replaceAll('export ','')+'return s;}';
 Object.assign(c,{validArsenal:()=>true,fleet:{active:{},car:{}},handoff:{active:false},chaos:{track:0,reset(){}},
  resetFlightDamage(){},vehicleFX:{clear(){}},ordnance:{clear(){}},pendingBlasts:[],activeBombs:[],deathPoint:{toArray:()=>[0,0,0],fromArray(){}},
  respawnMode:'foot',bombs:0,bombAt:0,rearm:0,won:false,score:0,previousHits:0,previousContacts:0,previousCar:0,
  previousFoot:0,previousCab:0,previousJet:0,deathAt:0,respawnAt:0,shieldUntil:0,hurtUntil:0,respawns:0,jumps:0,bombImpacts:0});
 vm.runInContext(extract('function saveRuntime(){','function restoreRuntime(s){')+
  extract('function restoreRuntime(s){',' bindCar(fleet.car,fleet.active.car.mesh);').trimEnd()+'}'+validator,c);
 const runtime=c.saveRuntime(),checkpoint={schema:1,world:'expeditions-1',savedAt:1,count:0,player:{pos:[0,0,0],health:100,yaw:0},runtime};
 const validate=()=>c.validateCheckpoint(checkpoint,0);
 validate();
 const expected=()=>[c.shotAt,c.carShotAt,c.jetShotAt];
 const deadlines=expected();
 Object.assign(c,{shotAt:0,carShotAt:0,jetShotAt:0});
 c.restoreRuntime(runtime);assert.deepEqual(expected(),deadlines);
 for(const mode of ['foot','car','jet']){
  const legacy={...runtime,mode,shotAt:5};delete legacy.carShotAt;delete legacy.jetShotAt;
  checkpoint.runtime=legacy;validate();c.restoreRuntime(legacy);
  assert.deepEqual(expected(),['foot','car','jet'].map(which=>which===mode?5:0));
 }
 for(const value of [false,true,NaN,Infinity,'5',-1,undefined]){
  checkpoint.runtime={...runtime,carShotAt:value};
  assert.throws(validate,/run values|vehicle gun cadence/);
 }
console.log('PASS actual shoot() CPU fixture: per-mode cadence, no fast-switch reset, reload, rays and ammunition');
})().catch(e=>{console.error(e);process.exitCode=1});
