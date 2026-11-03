import * as T from 'three/webgpu';
const up=new T.Vector3(0,1,0),hub=new T.Vector3(),local=new T.Vector3(),direction=new T.Vector3(),foot=new T.Vector3();
function link(mesh,a,b){direction.copy(b).sub(a);const length=direction.length();mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,direction.normalize());mesh.scale.y=length;}
export function poseSuspension(mesh,car,ground,dt=0){
 mesh.updateMatrixWorld(true);
 for(const leg of mesh.userData.suspension){
  const pivot=leg.pivot;hub.set(pivot.position.x,.66,pivot.position.z).applyMatrix4(mesh.matrixWorld);
  const floor=ground(hub.x,hub.z);local.set(hub.x,floor+.66,hub.z);mesh.worldToLocal(local);
  const target=car.grounded?T.MathUtils.clamp(local.y,.28,1.08):.25;
  // Compression follows real terrain immediately. Extension is finite and
  // cannot pull an airborne chassis down. dt=0 is an explicit restore pose.
  const wheelY=dt>0?Math.max(target,pivot.position.y-Math.min(dt,.05)*3.2):target;
  pivot.position.y=wheelY;
  foot.set(pivot.position.x,wheelY,pivot.position.z);
  link(leg.arm,leg.armRoot,foot);link(leg.shock,leg.shockRoot,foot);
  leg.spring.position.copy(leg.shock.position);leg.spring.quaternion.copy(leg.shock.quaternion);leg.spring.scale.y=leg.shock.scale.y;
  leg.compression=T.MathUtils.clamp(1-(wheelY-.28)/.8,0,1);
 }
}
