import * as T from 'three/webgpu';
import {buildJetHero} from './jet-hero-art.js';
import {compositeRigid} from './composite.js';

export const material=(color,metalness=0,roughness=.8)=>new T.MeshStandardMaterial({color,metalness,roughness});
const mat={steel:material('#344348',.6,.4),dark:material('#10191d',.25,.65),rubber:material('#192026'),sand:material('#a0916d'),orange:material('#e69c3a',.35,.5),glass:material('#76b5b7',.6,.22),light:new T.MeshBasicMaterial({color:'#ffdc85'})};
export function box(g,size,pos,m=mat.steel){const o=new T.Mesh(new T.BoxGeometry(...size),m);o.position.set(...pos);g.add(o);o.castShadow=true;o.receiveShadow=true;return o;}
export function cylinder(g,r1,r2,h,pos,m=mat.steel,n=10){const o=new T.Mesh(new T.CylinderGeometry(r1,r2,h,n),m);o.position.set(...pos);g.add(o);o.castShadow=true;return o;}
export function segment(g,a,b,r,m=mat.steel){const v=new T.Vector3(...a),w=new T.Vector3(...b),o=cylinder(g,r,r,v.distanceTo(w),v.clone().add(w).multiplyScalar(.5).toArray(),m,8);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),w.sub(v).normalize());return o;}

export function humanoid(){
 // One shared, flat-shaded mesh. All detail uses the existing color/part streams.
 const pp=[],nn=[],cc=[],tags=[];
 const skin='#929879',shadow='#656e59',shirt='#716a53',cloth='#404c47',boot='#25332f';
 function tri(a,b,c,color,part=0){
  const u=new T.Vector3(...b).sub(new T.Vector3(...a)),v=new T.Vector3(...c).sub(new T.Vector3(...a)),n=u.cross(v).normalize(),col=new T.Color(color);
  for(const q of [a,b,c]){pp.push(...q);nn.push(n.x,n.y,n.z);cc.push(col.r,col.g,col.b);tags.push(part);}
 }
 function quad(a,b,c,d,color,part=0){tri(a,b,c,color,part);tri(a,c,d,color,part);}
 // Rings run clockwise viewed from above; bevels are spent on the face, not hidden joints.
 function loft(rings,color,part=0,bevel=false){
  const ring=([x,y,z,w,d])=>bevel?[[x-w*.68,y,z-d],[x+w*.68,y,z-d],[x+w,y,z-d*.58],[x+w,y,z+d*.58],[x+w*.68,y,z+d],[x-w*.68,y,z+d],[x-w,y,z+d*.58],[x-w,y,z-d*.58]]:[[x-w,y,z-d],[x+w,y,z-d],[x+w,y,z+d],[x-w,y,z+d]];
  const rr=rings.map(ring),n=rr[0].length,descending=rings.at(-1)[1]<rings[0][1];
  const face=(a,b,c)=>descending?tri(a,c,b,faceColor,part):tri(a,b,c,faceColor,part);let faceColor;
  for(let j=0;j<rr.length-1;j++)for(let i=0;i<n;i++){const k=(i+1)%n;faceColor=typeof color==='function'?color(j,i):color;face(rr[j][i],rr[j+1][i],rr[j+1][k]);face(rr[j][i],rr[j+1][k],rr[j][k]);}
  for(let i=1;i<n-1;i++){faceColor=typeof color==='function'?color(0,2):color;face(rr[0][0],rr[0][i],rr[0][i+1]);const r=rr.at(-1);faceColor=typeof color==='function'?color(rr.length-2,2):color;face(r[0],r[i+1],r[i]);}
 }
 // Ragged jacket hem, narrow waist, broad sloping shoulders and a forward neck.
 loft([[0,.82,.025,.19,.135],[.015,1.03,.015,.17,.12],[-.018,1.37,.055,.29,.16],[0,1.48,.045,.17,.13]],(j,i)=>j===0&&i===0?'#514c3e':i===4?'#605f4e':shirt,0,true);
 // Fitted collar, broken lower hem, pocket flap and belt remain in one mesh.
 quad([-.14,1.44,-.102],[-.045,1.47,-.11],[-.025,1.32,-.14],[-.08,1.37,-.14],'#8b8060');
 quad([.04,1.46,-.11],[.14,1.43,-.102],[.08,1.34,-.14],[.025,1.32,-.14],'#504f40');
 quad([.085,1.31,-.126],[.207,1.30,-.113],[.20,1.265,-.118],[.09,1.27,-.131],'#4e4d3e');
 quad([-.17,.97,-.116],[.16,.97,-.116],[.16,.943,-.125],[-.17,.943,-.125],'#353a31');
 tri([-.18,.86,-.12],[-.10,.82,-.13],[-.15,.77,-.13],'#605a45');
 loft([[0,1.43,-.025,.085,.08],[0,1.59,-.09,.075,.075]],shadow);
 // Cheekbones and jaw give a human profile; the lower face projects toward the player.
 loft([[.035,1.53,-.15,.09,.11],[.014,1.60,-.125,.125,.13],[0,1.72,-.105,.174,.145],[-.009,1.81,-.075,.162,.133],[-.012,1.89,-.065,.105,.105]],(j,i)=>j===3?(i===0?'#61664e':'#454e3d'):i===0?skin:i===4?shadow:'#838d70',0,true);
 for(const side of [-1,1]){
  const x=side*.166;
  tri([x,1.75,-.06],[x+side*.035,1.71,-.075],[x,1.65,-.08],shadow);
  tri([x,1.75,-.06],[x,1.65,-.08],[x+side*.035,1.71,-.075],skin);
  const brow=[[side*.035,1.752,-.25],[side*.125,1.76,-.244],[side*.132,1.741,-.252],[side*.036,1.735,-.26]];
  quad(...(side<0?brow.reverse():brow),'#535b47');
 }
 // Dark orbital cavities, small cloudy eyes, nose ridge and an uneven open mouth.
 for(const side of [-1,1]){
  const x=side*.083;
  quad([x-.054,1.728-side*.018,-.258],[x+.05,1.728+side*.018,-.258],[x+.041,1.69,-.259],[x-.042,1.69,-.259],'#343d32');
  tri([x-.012,1.704,-.261],[x+.011,1.708,-.261],[x+.009,1.696,-.261],'#909678');
 }
 tri([-.026,1.73,-.253],[.027,1.723,-.253],[0,1.648,-.29],skin);
 tri([-.026,1.73,-.253],[0,1.648,-.29],[-.027,1.646,-.249],shadow);
 tri([.027,1.723,-.253],[.027,1.646,-.249],[0,1.648,-.29],'#a5aa88');
 quad([-.053,1.626,-.266],[.05,1.616,-.266],[.034,1.575,-.253],[-.035,1.597,-.253],'#332820');
 tri([.07,1.65,-.26],[.115,1.69,-.245],[.108,1.582,-.23],'#624333');
 tri([.116,1.67,-.238],[.13,1.7,-.25],[.146,1.64,-.22],'#514b39');
 // Torn shirt openings expose a dull skin tone without another material or draw.
 tri([-.145,1.24,-.13],[-.106,1.28,-.13],[-.09,1.1,-.126],shadow);
 tri([.10,.94,-.13],[.15,.84,-.136],[.08,.85,-.136],shadow);
 // Open jacket seam and lapels use two thin triangles rather than extra objects.
 tri([-.07,1.39,-.127],[.026,1.4,-.127],[.005,1.15,-.133],'#353d34');
 for(const side of [-1,1]){
  const arm=side<0?1:2,leg=side<0?3:4,x=side*.32;
  // Bent elbows and mismatched torn sleeves, still driven by the same shoulder tags.
  loft([[x*.9,1.40,.015,.095,.10],[x*1.10,1.20,-.025,.082,.084],[x*1.13,1.12,-.045,.075,.075],[x*1.08,.89,-.18,.052,.055]],(j)=>j<2?(side<0?shirt:'#595f4c'):skin,arm);
  loft([[x*1.08,.92,-.18,.038,.04],[x*1.07,.81,-.235,.061,.048],[x*1.03,.735,-.275,.044,.035]],(j,i)=>i===0?skin:shadow,arm);
  // Knees and offset ankles break the straight-tube silhouette without extra joints.
  loft([[side*.13,.86,.025,.115,.12],[side*.14,.57,-.027,.098,.099],[side*.145,.45,-.035,.08,.085],[side*.15,.13,.025,.065,.07]],(j,i)=>j===0&&i===0?'#535e52':j===1&&i===0?'#6f6e55':cloth,leg);
  loft([[side*.15,.025,-.07,.095,.16],[side*.15,.16,-.035,.085,.13]],boot,leg,true);
 }
 const g=new T.InstancedBufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pp,3));g.setAttribute('normal',new T.Float32BufferAttribute(nn,3));g.setAttribute('color',new T.Float32BufferAttribute(cc,3));g.setAttribute('part',new T.Float32BufferAttribute(tags,1));return g;
}

export function weapon(){
 const g=new T.Group(),body=new T.Group();g.add(body);
 const graphite=material('#263137',.72,.32),edge=material('#66716f',.65,.37),polymer=material('#414b3d',.05,.8),grip=material('#192321',.1,.85),skin=material('#8c8466',0,.9),sleeve=material('#626651',0,.95);
 // Chamfered receiver and perforated floating handguard keep the front profile narrow.
 const upper=cylinder(body,.105,.105,.40,[0,.025,-.15],graphite,8);upper.rotation.x=Math.PI/2;upper.scale.x=.83;
 box(body,[.14,.07,.33],[0,-.055,-.1],polymer);
 const handguard=cylinder(body,.082,.082,.29,[0,.035,-.49],polymer,8);handguard.rotation.x=Math.PI/2;
 for(const side of [-1,1]){
  for(let i=0;i<4;i++)box(body,[.006,.027,.035],[side*.077,.045,-.59+i*.06],grip);
  box(body,[.009,.022,.30],[side*.071,-.008,-.46],edge);
  box(body,[.008,.016,.11],[side*.076,.015,-.11],grip);
  const pin=cylinder(body,.012,.012,.009,[side*.075,-.025,.002],edge,8);pin.rotation.z=Math.PI/2;
 }
 const barrel=cylinder(body,.024,.028,.28,[0,.04,-.755],graphite,12);barrel.rotation.x=Math.PI/2;
 const brake=cylinder(body,.037,.032,.09,[0,.04,-.9],edge,8);brake.rotation.x=Math.PI/2;
 const bore=cylinder(body,.019,.019,.002,[0,.04,-.946],grip,10);bore.rotation.x=Math.PI/2;
 for(const side of [-1,1])for(let i=0;i<2;i++)box(body,[.005,.018,.012],[side*.033,.04,-.88-i*.025],grip);
 // Continuous rail, small mechanical sights, and brass-toned extractor detail.
 box(body,[.067,.018,.62],[0,.123,-.32],graphite);
 for(let i=0;i<11;i++)box(body,[.079,.009,.014],[0,.136,-.60+i*.05],edge);
 const rear=new T.Mesh(new T.TorusGeometry(.025,.007,5,12),graphite);rear.position.set(0,.19,-.055);body.add(rear);
 for(const side of [-1,1])box(body,[.012,.046,.035],[side*.031,.16,-.055],graphite);
 box(body,[.012,.067,.02],[0,.17,-.59],graphite);box(body,[.008,.008,.008],[0,.205,-.59],mat.light);
 box(body,[.024,.036,.13],[.086,.048,-.13],grip);
 for(const side of [-1,1]){box(body,[.004,.007,.07],[side*.083,.076,-.26],edge);box(body,[.004,.006,.04],[side*.076,-.013,-.37],edge);}
 const bolt=new T.Group();g.add(bolt);box(bolt,[.012,.029,.085],[.098,.049,-.12],edge);box(bolt,[.037,.017,.02],[.11,.049,-.077],graphite);g.userData.bolt=bolt;
 // Slim buffer tube and shaped shoulder stock rather than a solid rectangular block.
 const tube=cylinder(body,.032,.032,.25,[0,.025,.16],graphite,10);tube.rotation.x=Math.PI/2;
 const stockShape=new T.Shape();stockShape.moveTo(-.14,.063);stockShape.lineTo(-.32,.063);stockShape.lineTo(-.35,.027);stockShape.lineTo(-.34,-.038);stockShape.lineTo(-.27,-.038);stockShape.lineTo(-.16,.008);stockShape.closePath();
 const stock=new T.Mesh(new T.ExtrudeGeometry(stockShape,{depth:.085,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:1,steps:1}),polymer);stock.rotation.y=Math.PI/2;stock.position.x=-.0425;body.add(stock);box(body,[.09,.11,.025],[0,-.008,.345],grip);
 segment(body,[0,-.04,.16],[0,-.06,.33],.021,polymer);
 box(body,[.065,.16,.078],[0,-.15,.075],grip).rotation.x=-.28;
 segment(body,[-.045,-.075,.08],[-.045,-.125,-.065],.009,graphite);segment(body,[-.045,-.125,-.065],[-.045,-.065,-.09],.009,graphite);
 const magazine=new T.Group();g.add(magazine);g.userData.magazine=magazine;
 box(magazine,[.075,.13,.11],[0,-.15,-.065],polymer).rotation.x=.10;
 box(magazine,[.074,.095,.10],[0,-.255,-.043],polymer).rotation.x=.26;
 box(magazine,[.084,.023,.114],[0,-.30,-.029],grip).rotation.x=.26;
 for(let i=0;i<3;i++)for(const side of [-1,1])box(magazine,[.004,.14,.009],[side*.039,-.206,-.087+i*.033],graphite).rotation.x=.17;
 // Cuffed arms and gloves sit around the grip and handguard; support hand animates separately.
 segment(body,[.11,-.27,.42],[.095,-.20,.17],.058,sleeve);segment(body,[.095,-.20,.17],[.04,-.13,.074],.039,grip);
 const palm=new T.Mesh(new T.SphereGeometry(.048,8,6),grip);palm.position.set(.036,-.145,.074);palm.scale.set(.75,1.05,1);body.add(palm);
 segment(body,[.032,-.12,.10],[.005,-.086,.042],.018,grip);segment(body,[.005,-.086,.042],[-.018,-.09,.012],.016,grip);
 for(let i=0;i<3;i++)box(body,[.019,.023,.038],[.058,-.13-i*.021,.053],polymer).rotation.x=-.25;
 segment(body,[.091,-.197,.175],[.076,-.18,.153],.052,polymer);
 const supportHand=new T.Group();g.add(supportHand);g.userData.supportHand=supportHand;
 segment(supportHand,[-.16,-.28,.26],[-.09,-.17,-.31],.052,sleeve);segment(supportHand,[-.09,-.17,-.31],[-.035,-.07,-.43],.035,grip);
 segment(supportHand,[-.09,-.17,-.31],[-.08,-.15,-.335],.048,polymer);
 const supportPalm=new T.Mesh(new T.SphereGeometry(.046,8,6),grip);supportPalm.position.set(-.025,-.06,-.43);supportPalm.scale.set(1.12,.72,1.35);supportHand.add(supportPalm);
 segment(supportHand,[-.062,-.064,-.401],[-.079,-.018,-.417],.017,grip);segment(supportHand,[-.079,-.018,-.417],[-.066,.006,-.447],.015,grip);
 for(let i=0;i<3;i++)box(supportHand,[.027,.037,.016],[.025,-.055,-.466+i*.028],polymer).rotation.z=-.25;
 const flash=new T.Mesh(new T.IcosahedronGeometry(.12,0),new T.MeshBasicMaterial({color:'#ffe6a0',transparent:true,opacity:.9}));flash.position.set(0,.04,-.95);flash.scale.set(.55,.55,2.6);g.add(flash);flash.visible=false;g.userData.flash=flash;
 g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
 compositeRigid(body);compositeRigid(magazine);compositeRigid(supportHand);compositeRigid(bolt);
 return g;
}

export function buggy({batch=true}={}){const g=new T.Group();
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
 if(batch)batchVehicle(g);return g;
}

// The playable JET/015 keeps the original root, weapon/exhaust anchors and
// rigid-part metadata. Flight, collision, damage and respawn remain unchanged.
export function jet({batch=true}={}){
 return buildJetHero({batcher:batch?batchVehicle:null});
}

export function batchVehicle(root){
 const u=root.userData,exclude=new Set([...(u.boost||[]),...(u.wheelPivots||[]),...(u.guns||[])]);
 if(u.driver)exclude.add(u.driver);
 for(const leg of u.suspension||[])for(const key of ['arm','shock','spring'])exclude.add(leg[key]);
 for(const wheel of u.wheels||[])compositeRigid(wheel);
 for(const gun of u.guns||[])compositeRigid(gun,new Set(u.flashes));
 root.userData.rigidBatch=compositeRigid(root,exclude);return root;
}

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
