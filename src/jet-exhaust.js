import * as T from 'three/webgpu';

// Original profiles fitted to JET/015's existing nozzle, in runtime metres.
// The old boost anchors remain stable; local +Y becomes aircraft +Z.
function profileGeometry(stations,colour,alpha){
 const geometry=new T.LatheGeometry(stations.map(([r,y])=>new T.Vector2(r,y)),24);
 const p=geometry.attributes.position,colors=[],c=new T.Color(colour);
 for(let i=0;i<p.count;i++){
  const y=p.getY(i),r=Math.hypot(p.getX(i),p.getZ(i));
  const light=alpha?1:.18+.82*Math.min(1,r/.28);
  let a=1;
  if(alpha){const u=Math.max(0,Math.min(1,(y+.08)/.7));a=.4*Math.sin(Math.PI*u)*(1-u);}
  colors.push(c.r*light,c.g*light,c.b*light,a);
 }
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,4));
 geometry.scale(9/11,1,.65);
 return geometry;
}

export function makeJetExhaust(side){
 const offset=side*(1.12*9/11-.68);
 // Recessed bowl ends 19 cm inside the existing nozzle lip (z=3.6488).
 const glowGeometry=profileGeometry([[.17,.20],[.20,.23],[.28,.29],[.34,.35]],'#ee4c16',false);
 glowGeometry.translate(offset,0,.08*.65);
 const glow=new T.Mesh(glowGeometry,new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:T.DoubleSide}));
 glow.name=side<0?'Port nozzle heat':'Starboard nozzle heat';
 glow.position.set(side*.68,0,3.1);glow.rotation.x=Math.PI/2;glow.visible=false;
 const plumeGeometry=profileGeometry([[.15,-.08],[.32,0],[.25,.16],[.13,.40],[0,.62]],'#e85220',true);
 const material=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,transparent:true,opacity:1,depthWrite:false,side:T.DoubleSide});
 material.forceSinglePass=true;
 const plume=new T.Mesh(plumeGeometry,material);
 plume.name='Short exhaust plume';plume.position.set(offset,.54,.08*.65);plume.visible=false;
 glow.add(plume);
 return glow;
}

// Stateless presentation: checkpoint restore, fleet swaps and respawn derive
// the same appearance immediately, without adding any simulation/save fields.
export function updateJetExhaust(root,body,time){
 const running=body.health>0&&(body.boosting||body.speed>1);
 const boosted=running&&body.boosting;
 for(let i=0;i<root.userData.boost.length;i++){
  const glow=root.userData.boost[i],plume=glow.children[0];
  glow.visible=running;
  glow.material.color.setScalar(boosted?.86+.035*Math.sin(time*31+i):.018);
  plume.visible=!!boosted;
  plume.scale.y=.92+.07*Math.sin(time*37+i);
  plume.material.opacity=.86+.07*Math.sin(time*29+i);
 }
}
