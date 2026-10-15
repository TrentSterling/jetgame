import * as T from 'three/webgpu';

export const material=(color,metalness=0,roughness=.8)=>new T.MeshStandardMaterial({color,metalness,roughness});
const mat={steel:material('#344348',.6,.4),dark:material('#10191d',.25,.65),rubber:material('#192026'),sand:material('#a0916d'),orange:material('#e69c3a',.35,.5),glass:material('#76b5b7',.6,.22),light:new T.MeshBasicMaterial({color:'#ffdc85'})};
export function box(g,size,pos,m=mat.steel){const o=new T.Mesh(new T.BoxGeometry(...size),m);o.position.set(...pos);g.add(o);o.castShadow=true;o.receiveShadow=true;return o;}
export function cylinder(g,r1,r2,h,pos,m=mat.steel,n=10){const o=new T.Mesh(new T.CylinderGeometry(r1,r2,h,n),m);o.position.set(...pos);g.add(o);o.castShadow=true;return o;}
export function segment(g,a,b,r,m=mat.steel){const v=new T.Vector3(...a),w=new T.Vector3(...b),o=cylinder(g,r,r,v.distanceTo(w),v.clone().add(w).multiplyScalar(.5).toArray(),m,8);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),w.sub(v).normalize());return o;}

export function humanoid(){
 const pp=[],nn=[],cc=[],tags=[];function add(geo,p,s,c,tag=0,rot=0){if(geo.index)geo=geo.toNonIndexed();const matrix=new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),rot),new T.Vector3(...s));geo.applyMatrix4(matrix);const color=new T.Color(c),ps=geo.getAttribute('position'),ns=geo.getAttribute('normal');for(let i=0;i<ps.count;i++){pp.push(ps.getX(i),ps.getY(i),ps.getZ(i));nn.push(ns.getX(i),ns.getY(i),ns.getZ(i));cc.push(color.r,color.g,color.b);tags.push(tag);}geo.dispose();}
 const cyl=(rt,rb,h,p,s,c,tag,rot)=>add(new T.CylinderGeometry(rt,rb,h,5),p,s,c,tag,rot);
 cyl(.27,.19,.62,[0,1.18,0],[1,1,.72],'#92866a');
 add(new T.BoxGeometry(.37,.17,.31),[0,.84,0],[1,1,1],'#3d4a44');
 add(new T.IcosahedronGeometry(.24,0),[0,1.69,-.06],[.86,1.15,.95],'#b4b58b');
 add(new T.BoxGeometry(.24,.055,.03),[0,1.71,-.24],[1,1,1],'#f5ca73');
 for(let side=-1;side<=1;side+=2){const tag=side<0?1:2;cyl(.092,.065,.56,[side*.33,1.16,-.1],[1,1,1],'#899b80',tag,-.35);add(new T.BoxGeometry(.13,.18,.15),[side*.33,.84,-.22],[1,1,1],'#b6b494',tag);
 cyl(.12,.08,.7,[side*.14,.48,0],[1,1,1],'#475853',side<0?3:4);add(new T.BoxGeometry(.19,.15,.31),[side*.14,.08,-.075],[1,1,1],'#263936',side<0?3:4);}
 const g=new T.InstancedBufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pp,3));g.setAttribute('normal',new T.Float32BufferAttribute(nn,3));g.setAttribute('color',new T.Float32BufferAttribute(cc,3));g.setAttribute('part',new T.Float32BufferAttribute(tags,1));return g;
}

export function weapon(){const g=new T.Group();
 box(g,[.16,.2,.5],[0,0,-.1]);box(g,[.13,.13,.35],[0,.03,-.48]);box(g,[.11,.16,.09],[0,-.14,-.11],mat.dark).rotation.x=-.2;
 box(g,[.07,.25,.16],[0,-.22,-.04],mat.dark).rotation.x=.12;box(g,[.16,.12,.22],[0,.015,.22],mat.sand);
 const barrel=cylinder(g,.035,.035,.38,[0,.04,-.72],mat.dark,10);barrel.rotation.x=Math.PI/2;
 box(g,[.055,.09,.055],[0,.16,-.27],mat.dark);box(g,[.06,.013,.02],[0,.212,-.277],mat.light);
 for(let i=0;i<7;i++)box(g,[.17,.012,.016],[0,.124,-.38+i*.05],mat.dark);
 box(g,[.032,.02,.12],[.086,.035,-.05],mat.orange);
 segment(g,[.09,-.22,.18],[.16,-.27,.5],.073,mat.sand);segment(g,[-.06,-.13,-.4],[-.17,-.3,.3],.07,mat.sand);box(g,[.13,.095,.14],[-.01,-.12,-.38],mat.dark);
 const flash=new T.Mesh(new T.IcosahedronGeometry(.12,0),new T.MeshBasicMaterial({color:'#ffe6a0',transparent:true,opacity:.9}));flash.position.set(0,.04,-.95);flash.scale.set(.55,.55,2.6);g.add(flash);flash.visible=false;g.userData.flash=flash;
 g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});return g;}

export function buggy(){const g=new T.Group();
 // Exposed tube frame, low nose and independent wheel pivots.
 box(g,[1.85,.24,3.35],[0,.87,0],mat.dark);
 box(g,[1.7,.28,1.15],[0,1.07,-1.25],mat.orange).rotation.x=.12;
 box(g,[1.5,.36,.8],[0,1.06,1.45],mat.steel);
 box(g,[1.6,.07,.9],[0,2.26,.55],mat.orange);
 for(const s of [-1,1]){
  segment(g,[s*.86,.9,-1.7],[s*.86,1.05,1.65],.085,mat.steel);
  segment(g,[s*.86,1,-.95],[s*.82,2.3,-.55],.065,mat.steel);
  segment(g,[s*.86,1,1.35],[s*.82,2.3,1],.065,mat.steel);
  segment(g,[s*.82,2.3,-.55],[s*.82,2.3,1],.065,mat.steel);
  segment(g,[s*.82,2.3,1],[s*.86,1.04,1.9],.065,mat.steel);
  segment(g,[s*.86,1.0,-.85],[s*.86,1.45,1.1],.055,mat.steel);
  box(g,[.18,.22,1.4],[s*.88,1.0,.1],mat.orange);
  box(g,[.36,.2,.12],[s*.58,1.13,-1.91],mat.light);
  box(g,[.55,.15,.55],[s*.45,1.07,.35],mat.dark);
  box(g,[.55,.68,.15],[s*.45,1.4,.64],mat.dark).rotation.x=-.12;
 }
 for(const z of [-.55,1])segment(g,[-.82,2.3,z],[.82,2.3,z],.065,mat.steel);
 segment(g,[-.82,1.08,1.4],[.82,2.3,1],.055,mat.steel);
 segment(g,[.82,1.08,1.4],[-.82,2.3,1],.055,mat.steel);
 segment(g,[-1.25,.58,-2.05],[1.25,.58,-2.05],.13,mat.dark);
 for(const s of [-1,1])segment(g,[s*1.0,.58,-2],[s*.4,.8,-2.7],.1,mat.steel);
 segment(g,[-.4,.8,-2.7],[.4,.8,-2.7],.12,mat.steel);
 const wheels=[],wheelPivots=[],suspension=[];
 for(const x of [-1.15,1.15])for(const z of [-1.3,1.35]){
  const pivot=new T.Group();pivot.position.set(x,.66,z);g.add(pivot);wheelPivots.push(pivot);
  const w=cylinder(pivot,.66,.66,.46,[0,0,0],mat.rubber,14);w.rotation.order='ZYX';w.rotation.z=Math.PI/2;wheels.push(w);
  cylinder(w,.29,.29,.49,[0,0,0],mat.steel,8);
  for(let i=0;i<7;i++){const spoke=box(w,[.06,.025,.49],[Math.cos(i*Math.PI/3.5)*.28,.255,Math.sin(i*Math.PI/3.5)*.28],mat.sand);spoke.rotation.y=-i*Math.PI/3.5;}
  const arm=cylinder(g,.055,.055,1,[0,0,0],mat.steel,6),shock=cylinder(g,.04,.04,1,[0,0,0],mat.steel,6);
  const coil=[];for(let i=0;i<=96;i++){const t=i/96,a=t*Math.PI*16;coil.push(new T.Vector3(Math.cos(a)*.08,t-.5,Math.sin(a)*.08));}
  const spring=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(coil),96,.018,4,false),mat.orange);g.add(spring);
  suspension.push({pivot,arm,shock,spring,armRoot:new T.Vector3(x*.6,.7,z),shockRoot:new T.Vector3(x*.63,1.2,z+.23),compression:0});
 }
 const driver=new T.Group();driver.position.set(-.45,1.08,.3);g.add(driver);
 const suit=material('#586c72'),helmet=material('#dca046'),visor=material('#17272d',.5,.2);
 box(driver,[.4,.55,.26],[0,.36,0],suit).rotation.x=-.1;
 const head=new T.Group();head.position.set(0,.85,-.025);driver.add(head);
 const shell=new T.Mesh(new T.SphereGeometry(.24,12,8),helmet);shell.scale.set(.9,1.07,1);head.add(shell);shell.castShadow=true;
 box(head,[.35,.13,.09],[0,.015,-.205],visor);
 for(const side of [-1,1]){
  segment(driver,[side*.14,.02,.03],[side*.15,-.06,-.38],.11,suit);
  segment(driver,[side*.15,-.06,-.38],[side*.15,-.36,-.65],.085,suit);
  box(driver,[.16,.12,.26],[side*.15,-.39,-.71],mat.dark);
  segment(driver,[side*.23,.57,0],[side*.28,.3,-.23],.078,suit);
  segment(driver,[side*.28,.3,-.23],[side*.17,.43,-.55],.065,suit);
  box(driver,[.105,.105,.12],[side*.17,.43,-.55],mat.dark);
  segment(driver,[side*.13,.6,-.15],[side*.08,.06,-.16],.025,mat.orange);
 }
 const steering=new T.Mesh(new T.TorusGeometry(.22,.025,6,12),mat.dark);steering.position.set(-.45,1.52,-.28);steering.rotation.x=-.35;g.add(steering);
 driver.visible=false;g.userData.driver=driver;g.userData.head=head;
 g.userData.suspension=suspension;g.userData.wheels=wheels;g.userData.wheelPivots=wheelPivots;g.userData.boost=[];
 for(const s of [-1,1]){const flame=new T.Mesh(new T.ConeGeometry(.19,1.6,8),new T.MeshBasicMaterial({color:'#72dfff'}));flame.rotation.x=Math.PI/2;flame.position.set(s*.63,.9,2.4);g.add(flame);g.userData.boost.push(flame);}
 return g;
}

export function jet(){const g=new T.Group();
 const body=cylinder(g,.15,.55,6.7,[0,.1,-.6],mat.steel,10);body.rotation.x=Math.PI/2;
 const nose=new T.Mesh(new T.ConeGeometry(.48,2,10),mat.orange);nose.rotation.x=-Math.PI/2;nose.position.set(0,.1,-4.1);g.add(nose);
 const cabin=new T.Mesh(new T.SphereGeometry(.7,10,6),mat.glass);cabin.scale.set(.72,.6,1.6);cabin.position.set(0,.48,-1.4);g.add(cabin);
 function wing(side,z,span,depth){const shape=new T.Shape();shape.moveTo(0,z-depth/2);shape.lineTo(side*span,z+.6);shape.lineTo(side*(span-.4),z+1.25);shape.lineTo(0,z+depth/2);const m=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:false}),mat.sand);m.rotation.x=Math.PI/2;g.add(m);return m;}wing(1,0,4.5,2.8);wing(-1,0,4.5,2.8);wing(1,2.3,1.9,1.2);wing(-1,2.3,1.9,1.2);
 box(g,[.12,1.55,1.5],[0,.85,2.1],mat.orange).rotation.x=-.3;
 g.userData.boost=[];
 for(let s of [-1,1]){const engine=cylinder(g,.32,.4,2.3,[s*.68,0,1.4],mat.dark,10);engine.rotation.x=Math.PI/2;const glow=new T.Mesh(new T.ConeGeometry(.3,1.8,10),new T.MeshBasicMaterial({color:'#ffa749'}));glow.rotation.x=Math.PI/2;glow.position.set(s*.68,0,3.1);g.add(glow);g.userData.boost.push(glow);}
 g.userData.guns=[];g.userData.flashes=[];
 for(const side of [-1,1]){const mount=new T.Group();mount.position.set(side*1.35,-.15,-2);g.add(mount);g.userData.guns.push(mount);
  const housing=cylinder(mount,.22,.25,.8,[0,0,.5],mat.dark,8);housing.rotation.x=Math.PI/2;
  for(let j=0;j<6;j++){const a=j*Math.PI/3;const barrel=cylinder(mount,.044,.044,1.2,[Math.cos(a)*.13,Math.sin(a)*.13,-.2],mat.steel,6);barrel.rotation.x=Math.PI/2;}
  const flash=new T.Mesh(new T.ConeGeometry(.3,1.4,7),new T.MeshBasicMaterial({color:'#ffe991'}));flash.rotation.x=-Math.PI/2;flash.position.z=-1.5;flash.visible=false;mount.add(flash);g.userData.flashes.push(flash);
 }
 g.traverse(o=>{if(o.isMesh)o.castShadow=true;});return g;}

export function parachute(){
 const g=new T.Group(),canopy=new T.Group();g.add(canopy);
 const cloth=[material('#dc8d37'),material('#ded6b0')];cloth.forEach(m=>m.side=T.DoubleSide);
 for(let i=0;i<12;i++){
  const x0=-3.8+i*7.6/12,x1=x0+7.6/12,y0=4.8-x0*x0*.09,y1=4.8-x1*x1*.09;
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([x0,y0,-1.65,x1,y1,-1.65,x0,y0+.25,1.25,x1,y1,-1.65,x1,y1+.25,1.25,x0,y0+.25,1.25],3));geo.computeVertexNormals();
  const panel=new T.Mesh(geo,cloth[i%3===0?1:0]);panel.castShadow=true;canopy.add(panel);
 }
 for(const side of [-1,1])for(const z of [-1.65,1.25])for(const x of [2.2,3.6])segment(g,[side*.55,1.2,-.6],[side*x,4.8-x*x*.09,z],.011,mat.sand);
 g.visible=false;return g;
}

// Static palette materials are shared across models; everything else belongs
// to the vehicle instance, including driver clothing and exhaust materials.
export function disposeVehicle(mesh){const shared=new Set(Object.values(mat)),geometries=new Set(),materials=new Set();mesh.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!shared.has(m))materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
