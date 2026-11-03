import * as T from 'three/webgpu';
import {height,terrainRayDistance} from './nav.js';

export const MISSILE_TUNING=Object.freeze({capacity:24,launchSpeed:34,maxSpeed:155,acceleration:155,ignition:.1,turnRate:2.4,lifetime:5,trailInterval:.032});
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);

// Missiles remain in world space when their pilot exits. Bounded projectiles,
// swept wall/terrain tests, and a queued blast keep paired impacts independent.
export class Ordnance{
 constructor(scene,solids,fx,onImpact,{ground=height,terrainRay=terrainRayDistance}={}){
  this.scene=scene;this.solids=solids;this.fx=fx;this.onImpact=onImpact;this.ground=ground;this.terrainRay=terrainRay;this.active=[];this.launched=0;this.impacts=0;this.ray=new T.Raycaster();
  this.desired=new T.Vector3();this.old=new T.Vector3();this.tail=new T.Vector3();this.axis=new T.Vector3();this.look=new T.Vector3();
  this.geometry=new T.CylinderGeometry(.105,.14,1.1,7);this.geometry.rotateX(Math.PI/2);
  this.material=new T.MeshStandardMaterial({color:'#d8c8a0',roughness:.6});this.finGeometry=new T.BoxGeometry(.6,.045,.32);this.flameGeometry=new T.ConeGeometry(.17,.8,7);this.flameGeometry.rotateX(Math.PI/2);this.flameMaterial=new T.MeshBasicMaterial({color:'#ffc374'});
  this.pool=Array.from({length:MISSILE_TUNING.capacity},()=>{const m=new T.Mesh(this.geometry,this.material);const fin=new T.Mesh(this.finGeometry,this.material);fin.position.z=.35;m.add(fin);const cross=fin.clone();cross.rotation.z=Math.PI/2;m.add(cross);const fire=new T.Mesh(this.flameGeometry,this.flameMaterial);fire.position.z=.8;m.add(fire);m.userData.motor=fire;m.visible=false;scene.add(m);return m;});
 }
 launch(origin,direction,target,mode,inherited){
  if(!finitePoint(origin)||!finitePoint(direction)||!finitePoint(target)||direction.lengthSq()<1e-8)return false;
  const mesh=this.pool.find(m=>!m.visible);if(!mesh)return false;mesh.visible=true;mesh.position.copy(origin);mesh.lookAt(this.look.copy(origin).sub(direction));
  const speed=MISSILE_TUNING.launchSpeed+Math.min(100,Math.max(0,Number.isFinite(inherited)?inherited:0))*.55;
  mesh.userData.motor.scale.setScalar(.28);
  this.active.push({mesh,dir:direction.clone().normalize(),target:target.clone(),speed,age:0,trailAge:0,mode});this.launched++;
  this.fx.missileTrail?.(origin,direction,true);return true;
 }
 clear(){for(const m of this.pool)m.visible=false;this.active.length=0;this.launched=this.impacts=0;}
 update(dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  // A bounded small step keeps acceleration/steering and thin-wall hits stable
  // at different frame rates. Swept casts still cover every traveled segment.
  const elapsed=Math.min(dt,.25),steps=Math.ceil(elapsed*120),step=elapsed/steps;
  for(let i=this.active.length-1;i>=0;i--){
   const m=this.active[i],p=m.mesh.position;let hit=false;
   for(let tick=0;tick<steps&&!hit;tick++){
    this.old.copy(p);m.age+=step;m.trailAge+=step;
    this.desired.subVectors(m.target,p);const distance=this.desired.length();this.desired.divideScalar(Math.max(.0001,distance));
    const angle=Math.acos(Math.max(-1,Math.min(1,m.dir.dot(this.desired))));
    if(angle>.0001){
     this.axis.crossVectors(m.dir,this.desired);
     if(this.axis.lengthSq()<1e-8)this.axis.set(Math.abs(m.dir.y)<.9?0:1,Math.abs(m.dir.y)<.9?1:0,0).cross(m.dir);
     this.axis.normalize();m.dir.applyAxisAngle(this.axis,Math.min(angle,MISSILE_TUNING.turnRate*step)).normalize();
    }
    const previousSpeed=m.speed,motor=Math.max(0,Math.min(1,(m.age-MISSILE_TUNING.ignition)/.22));
    m.speed=Math.min(MISSILE_TUNING.maxSpeed,m.speed+MISSILE_TUNING.acceleration*motor*step);
    const travel=(previousSpeed+m.speed)*.5*step;let allowed=this.terrainRay(p,m.dir,travel);
    this.ray.set(p,m.dir);this.ray.far=travel;const walls=this.ray.intersectObjects(this.solids,false);if(walls.length)allowed=Math.min(allowed,walls[0].distance);
    p.addScaledVector(m.dir,Math.min(travel,allowed));m.mesh.lookAt(this.look.copy(p).sub(m.dir));
    m.mesh.userData.motor.scale.set(.65+motor*.35,.65+motor*.35,.28+motor*(1.2+Math.sin(m.age*91)*.1));
    if(m.trailAge>=MISSILE_TUNING.trailInterval){
     m.trailAge%=MISSILE_TUNING.trailInterval;this.tail.copy(p).addScaledVector(m.dir,-.85);this.fx.missileTrail?.(this.tail,m.dir);
    }
    hit=allowed<travel||distance<travel+.65||m.age>=MISSILE_TUNING.lifetime||p.y<this.ground(p.x,p.z)+.15;
    if(hit){this.impacts++;const radius=m.mode==='jet'?14:10.5;this.fx.explosion(p,radius);this.onImpact(p.clone(),radius);m.mesh.visible=false;this.active.splice(i,1);}
   }
   if(!hit){this.tail.copy(p).addScaledVector(m.dir,-1.8);this.fx.tracer(this.tail,p,'#ffd38b',.065,.038);}
  }
 }
}
