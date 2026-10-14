import * as T from 'three/webgpu';
const up=new T.Vector3(0,1,0),hub=new T.Vector3(),local=new T.Vector3(),direction=new T.Vector3();
function link(mesh,a,b){direction.copy(b).sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,direction.clone().normalize());mesh.scale.y=direction.length();}
export function poseSuspension(mesh,car,ground){
 mesh.updateMatrixWorld(true);
 for(const leg of mesh.userData.suspension){
  const pivot=leg.pivot;hub.set(pivot.position.x,.66,pivot.position.z).applyMatrix4(mesh.matrixWorld);
  const floor=ground(hub.x,hub.z);local.set(hub.x,floor+.66,hub.z);mesh.worldToLocal(local);
  const wheelY=car.grounded?T.MathUtils.clamp(local.y,.28,1.08):.25;
  pivot.position.y=wheelY;
  const foot=new T.Vector3(pivot.position.x,wheelY,pivot.position.z);
  link(leg.arm,leg.armRoot,foot);link(leg.shock,leg.shockRoot,foot);
  leg.spring.position.copy(leg.shock.position);leg.spring.quaternion.copy(leg.shock.quaternion);leg.spring.scale.y=leg.shock.scale.y;
  leg.compression=T.MathUtils.clamp(1-(wheelY-.28)/.8,0,1);
 }
}
