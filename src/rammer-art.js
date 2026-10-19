import * as T from 'three/webgpu';

// Original procedural RAM/01 coachwork. The dimensions are shared by adjoining
// panels. This module changes render geometry only; the released rig owns motion.
const C={paint:'#9a6648',edge:'#b58259',deep:'#684a38',steel:'#515d55',dark:'#303a36',rubber:'#202823',cloth:'#424a3d',bone:'#baae86',red:'#9e4b32'};
const TAU=Math.PI*2;
function triangles(vertices,faces){
 const p=[];for(const face of faces)for(const i of face)p.push(...vertices[i]);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
function loft(sections){
 const v=[],f=[];
 for(const [z,w,lo,hi,bevel=.045] of sections){const b=Math.min(bevel,w*.45,(hi-lo)*.45);v.push([-w,lo+b,z],[-w+b,lo,z],[w-b,lo,z],[w,lo+b,z],[w,hi-b,z],[w-b,hi,z],[-w+b,hi,z],[-w,hi-b,z]);}
 for(let j=0;j<sections.length-1;j++)for(let k=0;k<8;k++){const a=j*8+k,b=j*8+(k+1)%8,c=b+8,d=a+8;f.push([a,b,c],[a,c,d]);}
 for(let k=1;k<7;k++){f.push([0,k+1,k]);const n=v.length-8;f.push([n,n+k,n+k+1]);}
 return triangles(v,f);
}
function arch(){
 const v=[],f=[],steps=12;
 for(let i=0;i<=steps;i++){
  // Short cycle wings clear the frame at full droop and do not sweep into the
  // cabin posts. Wheel/pivot transforms and the tire envelope stay unchanged.
  const a=.90+(Math.PI-1.80)*i/steps;
  for(const [x,r] of [[-.29,.725],[.29,.725],[.29,.785],[-.29,.785]])v.push([x,Math.sin(a)*r,Math.cos(a)*r]);
 }
 for(let j=0;j<steps;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=b+4,d=a+4;f.push([a,b,c],[a,c,d]);}
 f.push([0,2,1],[0,3,2]);const e=steps*4;f.push([e,e+1,e+2],[e,e+2,e+3]);
 // This ring order faces into the strip; reverse once for outward solid normals.
 return triangles(v,f.map(([a,b,c])=>[a,c,b]));
}
function chamfer(size,b=.025){return loft([[-size[2]/2,size[0]/2,-size[1]/2,size[1]/2,b],[size[2]/2,size[0]/2,-size[1]/2,size[1]/2,b]]);}

export function buildRammerCoachwork(root,material,Part){
 const u=root.userData,parts=[],steering=root.children.find(o=>o.geometry?.type==='TorusGeometry');
 const keep=new Set([u.driver,steering,...u.wheelPivots,...u.boost]);
 for(const leg of u.suspension)for(const key of ['arm','shock','spring'])keep.add(leg[key]);
 // Old stock panels remain instance-owned for disposal, but are not crash parts.
 for(const child of root.children)if(!keep.has(child))child.visible=false;
 const add=(id,name,build,parent=root)=>{
  const p=new Part();build(p);const mesh=p.mesh(parent,material,`${id} ${name}`);
  const g=mesh.geometry;g.computeBoundingBox();const center=g.boundingBox.getCenter(new T.Vector3());g.translate(-center.x,-center.y,-center.z);mesh.position.copy(center);g.computeBoundingBox();g.computeBoundingSphere();
  mesh.userData.rammerPart=id;parts.push({id,name,triangles:g.attributes.position.count/3,parent:parent===root?'chassis':'wheel pivot'});return mesh;
 };
 const slab=(p,size,at,color,b=.025,rotation)=>p.add(chamfer(size,b),at,color,rotation);
 add('RAM-01','Pressed floor, rails and skid plates',p=>{
  p.add(loft([[-1.87,.66,.58,.65],[-.85,.87,.50,.58],[-.20,.87,.50,.58],[.03,.87,.66,.79],[.85,.87,.66,.79],[1.85,.69,.72,.85]]),[0,0,0],C.dark);
  for(const x of [-.80,.80])slab(p,[.13,.19,3.35],[x,.70,0],C.steel);
  for(const z of [-1.1,-.15,.83,1.49])slab(p,[1.44,.08,.11],[0,.79,z],C.steel,.02);
  slab(p,[.20,.23,1.66],[0,.89,-.13],C.dark);
  for(const s of [-1,1]){slab(p,[.13,.19,1.41],[s*.88,.91,.075],C.deep);slab(p,[.24,.055,.86],[s*1.0,.79,.12],C.steel,.02);}
 });
 add('RAM-02','Joined nose, hood and service panels',p=>{
  p.add(loft([[-1.96,.50,.86,1.24],[-1.7,.55,.86,1.33],[-.69,.59,.89,1.43],[-.56,.59,1.12,1.43]]),[0,0,0],C.paint);
  // Separate hood skin follows the same section heights, with a visible hem.
  p.add(loft([[-1.86,.45,1.253,1.28,.01],[-1.68,.49,1.34,1.365,.01],[-.68,.53,1.436,1.461,.01]]),[0,0,0],C.edge);
  for(const s of [-1,1]){
   p.rod([s*.53,1.42,-.68],[s*.45,1.28,-1.86],.009,C.dark);
   slab(p,[.11,.025,.16],[s*.38,1.454,-.76],C.steel,.008,[.09,0,0]);
   slab(p,[.055,.04,.10],[s*.43,1.32,-1.67],C.dark,.009);
   slab(p,[.31,.19,.10],[s*.43,1.29,-1.95],C.dark,.025);
   slab(p,[.25,.125,.025],[s*.43,1.30,-2.011],C.bone,.015);
   p.box([.015,.13,.03],[s*.43,1.30,-2.03],C.steel);
  }
  slab(p,[.74,.22,.06],[0,1.09,-1.981],C.dark,.02);
  for(let i=0;i<6;i++)p.box([.65,.016,.03],[0,1.005+i*.033,-2.025],C.steel);
  for(let i=0;i<5;i++)slab(p,[.34,.018,.036],[0,1.44-i*.009,-.92-i*.10],C.dark,.005,[.09,0,0]);
 });
 add('RAM-03','Open cockpit side skins and rear quarters',p=>{
  for(const s of [-1,1]){
   // A single beveled sill/side profile, open above the elbow for entry and aim.
   p.add(loft([[-.53,.065,.96,1.31,.025],[.58,.065,.97,1.39,.025],[.78,.065,1.0,1.42,.025]]),[s*.91,0,0],C.paint);
   slab(p,[.025,.065,.93],[s*.985,1.25,.12],C.bone,.01);
   slab(p,[.034,.035,.19],[s*.987,1.34,.40],C.dark,.007);
   slab(p,[.022,.16,.038],[s*.985,1.13,-.36],C.steel,.007);
   slab(p,[.022,.16,.038],[s*.985,1.18,.66],C.steel,.007);
  }
  p.add(loft([[.94,.84,.89,1.34],[1.55,.79,.91,1.27],[1.91,.67,.92,1.16]]),[0,0,0],C.paint);
  p.add(loft([[1.03,.67,1.345,1.38,.012],[1.54,.65,1.275,1.31,.012],[1.82,.55,1.19,1.225,.012]]),[0,0,0],C.deep);
  for(const x of [-.38,0,.38])slab(p,[.023,.022,.58],[x,1.31,1.48],C.steel,.005,[-.20,0,0]);
  slab(p,[1.50,.14,.18],[0,.86,1.94],C.steel,.03);
  for(const s of [-1,1]){slab(p,[.20,.13,.035],[s*.56,1.10,1.925],C.dark,.02);slab(p,[.15,.075,.02],[s*.56,1.11,1.949],C.red,.01);}
 });
 add('RAM-04','Roll cage and crowned roof shell',p=>{
  for(const s of [-1,1]){
   p.rod([s*.87,1.04,-.57],[s*.79,2.29,-.42],.052,C.steel);
   p.rod([s*.77,.97,1.03],[s*.79,2.29,.95],.058,C.steel);
   p.rod([s*.79,2.29,-.42],[s*.79,2.29,.95],.055,C.steel);
   p.rod([s*.79,2.28,.95],[s*.74,1.12,1.70],.045,C.steel);
   slab(p,[.16,.08,.18],[s*.85,1.03,-.57],C.dark,.02);
  }
  for(const z of [-.42,.95])p.rod([-.79,2.29,z],[.79,2.29,z],.052,C.steel);
  p.rod([-.75,1.18,1.04],[.75,2.24,.96],.033,C.steel);
  p.rod([.75,1.18,1.04],[-.75,2.24,.96],.033,C.steel);
  p.add(loft([[-.53,.79,2.31,2.355,.018],[-.39,.88,2.31,2.405,.033],[.88,.88,2.31,2.405,.033],[1.05,.77,2.31,2.35,.018]]),[0,0,0],C.steel);
  for(const s of [-1,1])p.rod([s*.86,2.345,-.39],[s*.86,2.345,.88],.012,C.dark);
 });
 add('RAM-05','Paired bucket seats and cockpit floor',p=>{
  for(const x of [-.45,.45]){
   slab(p,[.57,.15,.58],[x,.985,.28],C.dark,.045);
   slab(p,[.43,.055,.43],[x,1.065,.26],C.cloth,.022);
   slab(p,[.55,.65,.14],[x,1.40,.65],C.dark,.045,[-.12,0,0]);
   slab(p,[.39,.47,.065],[x,1.41,.553],C.cloth,.027,[-.12,0,0]);
   for(const s of [-1,1])slab(p,[.065,.43,.13],[x+s*.235,1.36,.565],C.deep,.02,[-.12,0,0]);
   slab(p,[.29,.19,.12],[x,1.78,.70],C.dark,.035);
   for(const s of [-1,1])p.rod([x+s*.09,1.65,.68],[x+s*.09,1.75,.70],.015,C.steel);
   slab(p,[.55,.012,.34],[x,.584,-.43],C.steel,.004);
   for(let i=0;i<3;i++)p.box([.51,.004,.012],[x,.592,-.53+i*.09],C.dark);
  }
  p.rod([.18,1.04,.40],[.18,1.22,.29],.016,C.steel);slab(p,[.055,.05,.07],[.18,1.23,.28],C.dark,.014);
 });
 add('RAM-06','Dashboard, binnacle and grab handle',p=>{
  p.add(loft([[-.61,.78,1.26,1.57,.045],[-.46,.77,1.28,1.56,.035]]),[0,0,0],C.dark);
  slab(p,[.51,.23,.08],[-.45,1.45,-.42],C.steel,.025,[.12,0,0]);
  for(const x of [-.57,-.34]){
   p.add(new T.CylinderGeometry(.078,.078,.018,12),[x,1.47,-.369],C.bone,[Math.PI/2,0,0]);
   p.add(new T.CylinderGeometry(.061,.061,.022,12),[x,1.47,-.354],C.dark,[Math.PI/2,0,0]);
   p.rod([x,1.47,-.339],[x+.027,1.51,-.339],.004,C.edge);
  }
  for(const x of [-.10,.0,.10])slab(p,[.035,.05,.03],[x,1.43,-.425],C.bone,.006);
  p.rod([.24,1.43,-.42],[.24,1.43,-.31],.022,C.steel);p.rod([.67,1.43,-.42],[.67,1.43,-.31],.022,C.steel);p.rod([.24,1.43,-.31],[.67,1.43,-.31],.026,C.dark);
  p.rod([-.45,1.32,-.48],[-.45,1.52,-.28],.028,C.steel);
 });
 add('RAM-07','Folded ram plate, replaceable edge and brackets',p=>{
  // Retain the released plow envelope and the warm stripe/readable five ribs.
  p.add(loft([[-.09,1.48,-.54,.52,.06],[.03,1.59,-.54,.52,.06],[.09,1.48,-.54,.52,.06]]),[0,.83,-2.58],C.steel,[.54,0,0]);
  slab(p,[3.26,.16,.23],[0,.34,-2.91],C.paint,.025,[.54,0,0]);
  for(const x of [-1.35,-.68,0,.68,1.35]){
   slab(p,[.067,.89,.036],[x,.84,-2.685],C.bone,.012,[.54,0,0]);
   for(const y of [.48,1.18])p.add(new T.CylinderGeometry(.028,.028,.025,6),[x,y,-2.70+(y-.84)*.55],C.dark,[Math.PI/2-.54,0,0]);
  }
  for(const s of [-1,1]){
   p.rod([s*.64,.71,-1.56],[s*1.02,.64,-2.52],.073,C.dark);
   slab(p,[.18,.33,.11],[s*1.02,.67,-2.43],C.deep,.025,[.30,0,0]);
   p.add(new T.CylinderGeometry(.068,.068,.20,8),[s*1.02,.68,-2.43],C.steel,[0,0,Math.PI/2]);
  }
 });
 for(let i=0;i<u.wheels.length;i++){
  const wheel=u.wheels[i],pivot=u.wheelPivots[i],p=new Part();
  for(const child of wheel.children)child.visible=false;
  const profile=[[.32,-.23],[.52,-.23],[.62,-.19],[.66,-.13],[.66,.13],[.62,.19],[.52,.23],[.32,.23],[.32,-.23]].map(([r,y])=>new T.Vector2(r,y));
  p.add(new T.LatheGeometry(profile,16),[0,0,0],C.rubber);
  const outward=-Math.sign(pivot.position.x);
  for(const s of [-1,1]){
   p.add(new T.CylinderGeometry(.32,.32,.035,12),[0,s*.216,0],C.dark);
   p.add(new T.CylinderGeometry(.105,.105,.08,8),[0,s*.235,0],C.steel);
   if(s!==outward)continue;
   p.add(new T.TorusGeometry(.304,.022,3,12),[0,s*.241,0],C.steel,[Math.PI/2,0,0]);
   for(let j=0;j<6;j++){
    const a=j*TAU/6;p.box([.22,.025,.055],[Math.cos(a)*.19,s*.244,Math.sin(a)*.19],C.deep,[0,-a,0]);
    p.add(new T.CylinderGeometry(.017,.017,.026,6),[Math.cos(a)*.14,s*.266,Math.sin(a)*.14],C.bone);
   }
  }
  // A few broad tread blocks, inset under the unchanged .66 m outer radius.
  for(let j=0;j<16;j++){const a=j*TAU/16;p.box([.105,.32,.014],[Math.sin(a)*.651,0,Math.cos(a)*.651],C.dark,[0,a,0]);}
  const temp=p.mesh(new T.Group(),material,'temporary wheel builder');wheel.geometry.dispose();wheel.geometry=temp.geometry;wheel.material=material;wheel.name=`RAM-W${i+1} tire, recessed rim and six bolts`;wheel.castShadow=wheel.receiveShadow=true;
  wheel.userData.rammerPart=`RAM-W${i+1}`;parts.push({id:wheel.userData.rammerPart,name:'Shaped tire and recessed wheel',triangles:wheel.geometry.attributes.position.count/3,parent:'spinning wheel'});
  add(`RAM-F${i+1}`,'Steering/suspension-mounted mudguard',p=>{p.add(arch(),[0,0,0],C.paint);const s=Math.sign(pivot.position.x);p.rod([-s*.24,.02,0],[-s*.24,.70,0],.025,C.steel);},pivot);
 }
 u.rammerHero={design:'RAM / 01',revision:'A',parts,seatEye:[.45,1.93,.30],driverHip:[-.45,1.08,.30],wheelRadius:.66,contract:'Art only. Released body, steering, wheel and suspension transforms remain authoritative.'};
}
