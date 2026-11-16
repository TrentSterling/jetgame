import * as T from 'three/webgpu';
// Additive removable salvage shroud: original carbine mesh/materials stay intact.
export function attachBreacherShroud(gun){
 const group=new T.Group(),steel=new T.MeshStandardMaterial({color:'#98582c',roughness:.8}),dark=new T.MeshStandardMaterial({color:'#242c2a',roughness:.6});
 const tube=new T.Mesh(new T.CylinderGeometry(.065,.065,.57,8),dark);tube.rotation.x=Math.PI/2;tube.position.set(0,-.065,-.60);group.add(tube);
 const pump=new T.Mesh(new T.BoxGeometry(.21,.16,.27),steel);pump.position.set(0,0,-.48);group.add(pump);group.visible=false;gun.add(group);
 return active=>{group.visible=active;gun.userData.magazine.visible=!active;};
}
