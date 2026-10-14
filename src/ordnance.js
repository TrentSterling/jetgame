import * as T from 'three/webgpu';
import {height,terrainRayDistance} from './nav.js';

// Missiles remain in world space when their pilot exits. Bounded projectiles,
// swept wall/terrain tests, and a queued blast keep paired impacts independent.
export class Ordnance{
 constructor(scene,solids,fx,onImpact){
  this.scene=scene;this.solids=solids;this.fx=fx;this.onImpact=onImpact;this.active=[];this.launched=0;this.impacts=0;this.ray=new T.Raycaster();
  this.geometry=new T.CylinderGeometry(.105,.14,1.1,7);this.geometry.rotateX(Math.PI/2);
  this.material=new T.MeshStandardMaterial({color:'#d8c8a0',roughness:.6});this.finGeometry=new T.BoxGeometry(.6,.045,.32);this.flameGeometry=new T.ConeGeometry(.17,.8,7);this.flameGeometry.rotateX(Math.PI/2);this.flameMaterial=new T.MeshBasicMaterial({color:'#ffc374'});
  this.pool=Array.from({length:24},()=>{const m=new T.Mesh(this.geometry,this.material);const fin=new T.Mesh(this.finGeometry,this.material);fin.position.z=.35;m.add(fin);const cross=fin.clone();cross.rotation.z=Math.PI/2;m.add(cross);const fire=new T.Mesh(this.flameGeometry,this.flameMaterial);fire.position.z=.8;m.add(fire);m.visible=false;scene.add(m);return m;});
 }
 launch(origin,direction,target,mode,inherited){
  const mesh=this.pool.find(m=>!m.visible);if(!mesh)return false;mesh.visible=true;mesh.position.copy(origin);mesh.lookAt(origin.clone().sub(direction));
  this.active.push({mesh,dir:direction.clone(),target:target.clone(),speed:65+inherited*.25,age:0,mode});this.launched++;return true;
 }
 clear(){for(const m of this.pool)m.visible=false;this.active.length=0;this.launched=this.impacts=0;}
 update(dt){for(let i=this.active.length-1;i>=0;i--){const m=this.active[i],p=m.mesh.position,old=p.clone();m.age+=dt;
   const desired=m.target.clone().sub(p),distance=desired.length();m.dir.lerp(desired.normalize(),1-Math.exp(-dt*6)).normalize();m.speed=Math.min(135,m.speed+dt*75);
   const travel=m.speed*dt;let allowed=terrainRayDistance(p,m.dir,travel);this.ray.set(p,m.dir);this.ray.far=travel;const walls=this.ray.intersectObjects(this.solids,false);if(walls.length)allowed=Math.min(allowed,walls[0].distance);
   p.addScaledVector(m.dir,Math.min(travel,allowed));m.mesh.lookAt(p.clone().sub(m.dir));
   this.fx.tracer(old,p,'#fca443',.09,.065);
   if(allowed<travel||distance<travel+1||m.age>4||p.y<height(p.x,p.z)+.15){this.impacts++;const radius=m.mode==='jet'?12:9;this.fx.explosion(p,radius);this.onImpact(p.clone(),radius);m.mesh.visible=false;this.active.splice(i,1);}
  }}
}
