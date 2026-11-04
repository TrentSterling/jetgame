import * as T from 'three/webgpu';

// Original allied/survivor art. BUTTLOADS 2's miner study informed the continuous
// face relief and buried garment seams; these are new proportions, surfaces and
// a native Three/WebGPU skeleton, shared by rescued people and vehicle crews.
// No world, browser, input, audio or game-loop dependencies belong in this file.
export const SURVIVOR_VARIANTS=4;
const clamp=T.MathUtils.clamp,TAU=Math.PI*2,DOWN=new T.Vector3(0,-1,0);
const safe=(v,d=0)=>Number.isFinite(v)?v:d;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const spot=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
const palettes=[
 {skin:'#a96d50',shade:'#704737',hair:'#292c28',coat:'#b7854c',dark:'#6c553b',pants:'#394941',boot:'#262d28',trim:'#e1ceb1',accent:'#9d4534'},
 {skin:'#cb9b78',shade:'#8c6250',hair:'#40372d',coat:'#547b7b',dark:'#344d50',pants:'#3c464a',boot:'#29302e',trim:'#d8c9a5',accent:'#d59b50'},
 {skin:'#76513e',shade:'#4e382e',hair:'#242824',coat:'#68744e',dark:'#414d38',pants:'#444644',boot:'#2d302b',trim:'#c5bca0',accent:'#bb7043'},
 {skin:'#c38965',shade:'#81533e',hair:'#574a39',coat:'#8b6255',dark:'#563e38',pants:'#3c4c50',boot:'#282e2b',trim:'#d9c5a0',accent:'#75948b'}
];
const specifications=[
 ['hips',null,0,.94,0],['spine','hips',0,.17,0],['chest','spine',0,.22,0],['neck','chest',0,.15,0],['head','neck',0,.07,-.012],
 ...[-1,1].flatMap(side=>{const s=side<0?'left':'right';return [
  [s+'Clavicle','chest',side*.20,.06,0],[s+'UpperArm',s+'Clavicle',side*.06,0,0],
  [s+'ForeArm',s+'UpperArm',0,-.29,0],[s+'Hand',s+'ForeArm',0,-.26,0],
  [s+'Thigh','hips',side*.115,-.02,0],[s+'Shin',s+'Thigh',0,-.40,0],[s+'Foot',s+'Shin',0,-.40,0]
 ];})
];
const indices=Object.fromEntries(specifications.map(([name],i)=>[name,i]));
const one=name=>[[indices[name],1]];
const blend=(a,b,t)=>[[indices[a],1-t],[indices[b],t]];
const torsoWeights=p=>p.y<1.12?blend('hips','spine',smooth(.96,1.12,p.y)):blend('spine','chest',smooth(1.12,1.30,p.y));
const neckWeights=p=>blend('neck','head',smooth(1.50,1.56,p.y));
function limbWeights(side,arm){
 const s=side<0?'left':'right';
 return p=>{
  if(arm){
   if(p.y>1.30){const chestWeight=(1-smooth(.16,.255,Math.abs(p.x)))*smooth(1.30,1.42,p.y);return blend('chest',s+'UpperArm',1-chestWeight);}
   if(p.y<.89)return blend(s+'ForeArm',s+'Hand',1-smooth(.81,.89,p.y));
   return blend(s+'UpperArm',s+'ForeArm',1-smooth(1.035,1.165,p.y));
  }
  if(p.y>.84)return blend(s+'Thigh','hips',smooth(.84,.96,p.y)*.55);
  if(p.y<.22)return blend(s+'Shin',s+'Foot',1-smooth(.12,.22,p.y));
  return blend(s+'Thigh',s+'Shin',1-smooth(.445,.595,p.y));
 };
}

// Indexed geometry is kept indexed when pieces are combined. Smooth cloth and
// face normals remain intact, with one color stream and four GPU skin weights.
class SkinBuilder{
 constructor(){this.p=[];this.n=[];this.c=[];this.si=[];this.sw=[];this.ix=[];this.point=new T.Vector3();this.normal=new T.Vector3();this.color=new T.Color();this.matrix=new T.Matrix4();this.normalMatrix=new T.Matrix3();}
 add(g,color,weights,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){
  const offset=this.p.length/3,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
  this.matrix.compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));this.normalMatrix.getNormalMatrix(this.matrix);this.color.set(color);
  for(let i=0;i<p.count;i++){
   this.point.fromBufferAttribute(p,i).applyMatrix4(this.matrix);this.normal.fromBufferAttribute(n,i).applyMatrix3(this.normalMatrix).normalize();
   this.p.push(...this.point);this.n.push(...this.normal);this.c.push(this.color.r*(c?c.getX(i):1),this.color.g*(c?c.getY(i):1),this.color.b*(c?c.getZ(i):1));
   const skin=typeof weights==='function'?weights(this.point):weights;
   for(let j=0;j<4;j++){this.si.push(skin[j]?.[0]||0);this.sw.push(skin[j]?.[1]||0);}
  }
  const count=g.index?.count||p.count;for(let i=0;i<count;i++)this.ix.push(offset+(g.index?g.index.getX(i):i));g.dispose();return this;
 }
 box(size,pos,color,w,rotation){return this.add(new T.BoxGeometry(...size),color,w,pos,rotation);}
 ellipsoid(size,pos,color,w,segments=10,rings=7){return this.add(new T.SphereGeometry(1,segments,rings),color,w,pos,undefined,size);}
 rod(a,b,r,color,w,r2=r){
  const delta=new T.Vector3(...b).sub(new T.Vector3(...a)),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize()),e=new T.Euler().setFromQuaternion(q);
  return this.add(new T.CylinderGeometry(r2,r,delta.length(),6),color,w,a.map((v,i)=>(v+b[i])*.5),e.toArray().slice(0,3));
 }
 finish(){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.n,3));g.setAttribute('color',new T.Float32BufferAttribute(this.c,3));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(this.si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(this.sw,4));g.setIndex(this.ix);g.computeBoundingBox();g.computeBoundingSphere();return g;
 }
}
function loft(rings,segments=16){
 const p=[],ix=[];
 for(const [y,rx,rz,z=0,x=0] of rings)for(let j=0;j<segments;j++){const a=j/segments*TAU;p.push(x+Math.sin(a)*rx,y,z-Math.cos(a)*rz);}
 for(let r=0;r<rings.length-1;r++)for(let j=0;j<segments;j++){const a=r*segments+j,b=r*segments+(j+1)%segments,c=b+segments,d=a+segments;ix.push(a,d,b,b,d,c);}
 for(const [r,top] of [[0,false],[rings.length-1,true]]){const ring=rings[r],center=p.length/3;p.push(ring[4]||0,ring[0],ring[3]||0);for(let j=0;j<segments;j++){const a=r*segments+j,b=r*segments+(j+1)%segments;ix.push(center,top?b:a,top?a:b);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
function faceSection(y,variant){
 const height=.165,r=Math.sqrt(Math.max(.001,1-((y-.008)/height)**2)),jaw=1-.18*smooth(-.055,-.138,y);
 return {rx:(.004+(.139+(variant===2?.006:variant===3?-.004:0))*r)*jaw,rz:.006+.118*r,z:.004-.009*spot(0,y,0,-.13,1,.03)};
}
function faceRelief(x,y){
 const bridge=.024*spot(x,y,0,-.014,.017,.047),tip=.022*spot(x,y,0,-.040,.023,.016),alar=.009*(spot(x,y,-.020,-.045,.010,.012)+spot(x,y,.020,-.045,.010,.012));
 const cheeks=.008*(spot(x,y,-.082,-.039,.034,.028)+spot(x,y,.082,-.039,.034,.028)),eyes=.005*(spot(x,y,-.055,.016,.036,.020)+spot(x,y,.055,.016,.036,.020));
 const mouthY=-.086+.003*(x/.05)**2,lips=.004*spot(x,y,0,mouthY-.007,.042,.007)+.002*spot(x,y,0,mouthY+.004,.04,.006),crease=.003*spot(x,y,0,mouthY,.043,.0025);
 return bridge+tip+alar+cheeks-eyes+lips-crease;
}
function facePoint(y,angle,variant,target){
 const s=faceSection(y,variant),x=Math.sin(angle)*s.rx,c=Math.cos(angle),front=smooth(.12,.83,c);
 return target.set(x,1.68+y,s.z-c*s.rz-faceRelief(x,y)*front);
}
function faceFront(x,y,variant){const s=faceSection(y,variant),c=Math.sqrt(Math.max(0,1-(x/s.rx)**2));return s.z-c*s.rz-faceRelief(x,y)*smooth(.12,.83,c);}
// Eye details follow the curved skin at every vertex. Thin lids cover the eye
// perimeter; a tapered surface brow avoids a separate cylindrical bar.
function faceDisk(variant,x,y,rx,ry,depth,segments=16){
 const p=[x,1.68+y,faceFront(x,y,variant)-depth],ix=[];
 for(const radius of [.55,1])for(let j=0;j<segments;j++){const angle=j/segments*TAU,px=x+Math.cos(angle)*rx*radius,py=y+Math.sin(angle)*ry*radius;p.push(px,1.68+py,faceFront(px,py,variant)-depth*(1-.25*radius*radius));}
 for(let j=0;j<segments;j++){const a=1+j,b=1+(j+1)%segments,c=a+segments,d=b+segments;ix.push(0,b,a,a,b,c,b,d,c);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
function faceStrip(variant,x,y,width,lower,upper,depthLow,depthHigh,segments=12){
 const p=[],ix=[];
 for(let j=0;j<=segments;j++){const u=j/segments*2-1,px=x+u*width;for(const [curve,depth] of [[lower,depthLow],[upper,depthHigh]]){const py=y+curve(u);p.push(px,1.68+py,faceFront(px,py,variant)-depth);}}
 for(let j=0;j<segments;j++){const a=j*2,c=a+2;ix.push(a,a+1,c,a+1,c+1,c);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
function faceGeometry(variant,palette){
 const heights=[-.154,-.146,-.135,-.122,-.108,-.099,-.091,-.086,-.081,-.074,-.062,-.050,-.043,-.035,-.025,-.012,.001,.014,.026,.043,.065,.091,.119,.141,.158,.168],segments=36,p=[],n=[],c=[],ix=[];
 const v=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),around=new T.Vector3(),vertical=new T.Vector3(),skin=new T.Color(palette.skin),hair=new T.Color(palette.hair),shade=new T.Color(palette.shade),color=new T.Color();
 for(let row=0;row<heights.length;row++)for(let j=0;j<segments;j++){
  const phi=(j/segments*2-1)*Math.PI,angle=phi*.42+Math.sign(phi)*.58*(Math.abs(phi)/Math.PI)**2*Math.PI,y=heights[row];
  facePoint(y,angle,variant,v);p.push(...v);facePoint(y,angle+.0001,variant,a);facePoint(y,angle-.0001,variant,b);around.subVectors(a,b);facePoint(y+.0001,angle,variant,a);facePoint(y-.0001,angle,variant,b);vertical.subVectors(a,b);vertical.cross(around).normalize();n.push(...vertical);
  const front=smooth(.15,.9,Math.cos(angle)),mouth=.42*spot(v.x,y,0,-.086+.003*(v.x/.05)**2,.041,.0035)*front,nostrils=.24*(spot(v.x,y,-.016,-.050,.006,.005)+spot(v.x,y,.016,-.050,.006,.005))*front;
  const hairLine=.105-.16*((1-Math.cos(angle))*.5)**1.6+(variant===3?.014*Math.sin(angle*2):0),scalp=smooth(hairLine,hairLine+.012,y),stubble=(variant===0||variant===2)?.13*(1-smooth(-.08,-.035,y))*front:0;
  color.copy(skin).lerp(shade,clamp(mouth+nostrils+stubble,0,.65)).lerp(hair,scalp);c.push(color.r/skin.r,color.g/skin.g,color.b/skin.b);
 }
 for(let row=0;row<heights.length-1;row++)for(let j=0;j<segments;j++){const a=row*segments+j,b=row*segments+(j+1)%segments,d=a+segments,e=b+segments;ix.push(a,d,b,b,d,e);}
 // Caps are hidden within the neck and scalp, but keep the skin a closed solid.
 for(const [row,top] of [[0,false],[heights.length-1,true]]){const center=p.length/3;p.push(0,1.68+heights[row],.004);n.push(0,top?1:-1,0);c.push(1,1,1);for(let j=0;j<segments;j++){const a=row*segments+j,b=row*segments+(j+1)%segments;ix.push(center,top?b:a,top?a:b);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setIndex(ix);return g;
}
function buildBody(variant,role,helmet){
 const p=palettes[variant],b=new SkinBuilder(),head=one('head'),hips=one('hips');
 // Waist, ribcage and sloping trapezius form one jacket surface. Sleeves start
 // inside it and blend to chest bone before their distinct elbow influence.
 b.add(loft([[.87,.165,.115],[.91,.18,.125],[1.00,.178,.131],[1.10,.194,.145],[1.23,.223,.151],[1.33,.244,.141],[1.39,.232,.115],[1.435,.169,.092],[1.465,.075,.068]],20),p.coat,torsoWeights);
 b.add(loft([[.835,.156,.108],[.89,.174,.12],[.945,.17,.118]],16),p.pants,hips);
 b.add(loft([[1.445,.057,.055],[1.49,.055,.054],[1.55,.060,.055]],14),p.skin,neckWeights);
 b.add(loft([[1.43,.089,.078],[1.453,.080,.074],[1.478,.068,.066]],16),p.dark,one('chest'));
 b.box([.023,.48,.013],[0,1.18,-.150],p.dark,torsoWeights);b.box([.012,.39,.016],[0,1.20,-.157],p.trim,torsoWeights);
 b.add(loft([[.884,.181,.132],[.921,.181,.132]],18),p.dark,hips);b.box([.048,.032,.018],[0,.903,-.143],p.trim,hips);
 for(const side of [-1,1]){
  const s=side<0?'left':'right',arm=limbWeights(side,true),leg=limbWeights(side,false),hand=one(s+'Hand'),foot=one(s+'Foot');
  b.add(loft([[.835,.047,.047,-.006,side*.26],[.87,.052,.051,0,side*.26],[.96,.061,.063,0,side*.26],[1.04,.068,.071,0,side*.26],[1.08,.073,.076,0,side*.26],[1.12,.074,.077,0,side*.26],[1.17,.074,.075,0,side*.26],[1.25,.083,.082,0,side*.26],[1.33,.092,.09,0,side*.26],[1.39,.092,.088,0,side*.255],[1.42,.074,.074,0,side*.224],[1.435,.048,.053,0,side*.181],[1.425,.012,.025,0,side*.139]],14),p.coat,arm);
  b.add(loft([[.837,.051,.05,0,side*.26],[.867,.054,.053,0,side*.26]],12),p.dark,arm);
  b.add(loft([[.735,.022,.022,-.014,side*.26],[.748,.038,.025,-.010,side*.26],[.790,.043,.027,-.006,side*.26],[.825,.037,.034,0,side*.26],[.846,.032,.032,0,side*.26]],12),role==='survivor'?p.skin:p.dark,hand);
  b.ellipsoid([.018,.038,.020],[side*.217,.79,-.005],role==='survivor'?p.skin:p.dark,hand,8,5);
  for(let f=0;f<3;f++)b.rod([side*.26-.022+f*.022,.754,-.033],[side*.26-.022+f*.022,.777,-.034],.0025,role==='survivor'?p.shade:p.trim,hand);
  b.add(loft([[.12,.065,.069,0,side*.115],[.20,.069,.074,0,side*.115],[.32,.078,.082,0,side*.115],[.44,.083,.088,0,side*.115],[.49,.085,.091,0,side*.115],[.54,.087,.094,0,side*.115],[.59,.091,.098,0,side*.115],[.70,.099,.108,0,side*.115],[.81,.105,.115,0,side*.115],[.89,.108,.119,0,side*.115],[.94,.090,.104,0,side*.115]],16),p.pants,leg);
  // Knee reinforcement shares exactly the trousers' weights and cannot float
  // away from the shin when a person takes a seat or lifts a running foot.
  b.add(loft([[.455,.053,.009,-.084,side*.115],[.48,.066,.012,-.089,side*.115],[.535,.066,.013,-.093,side*.115],[.57,.052,.009,-.091,side*.115]],10),p.dark,leg);
  b.add(loft([[.018,.081,.141,-.043,side*.115],[.043,.084,.145,-.046,side*.115],[.083,.080,.140,-.042,side*.115],[.126,.070,.106,-.020,side*.115],[.18,.065,.072,0,side*.115],[.225,.067,.070,0,side*.115]],14),p.boot,foot);
  b.add(loft([[0,.084,.145,-.045,side*.115],[.025,.085,.147,-.045,side*.115]],14),'#202725',foot);
  for(let l=0;l<3;l++)b.rod([side*.115-.031,.104+l*.027,-.10+l*.014],[side*.115+.031,.104+l*.027,-.10+l*.014],.0035,p.trim,foot);
  b.box([.115,.111,.022],[side*.124,1.265,-.144],p.dark,torsoWeights);b.box([.119,.027,.028],[side*.124,1.323,-.151],p.coat,torsoWeights);
  b.box([.084,.025,.013],[side*.124,1.28,-.162],p.trim,torsoWeights);
  b.rod([side*.13,1.414,-.095],[side*.176,1.02,-.13],.012,p.dark,torsoWeights);
 }
 b.box([.20,.27,.10],[0,1.19,.172],p.dark,torsoWeights);b.box([.21,.047,.114],[0,1.32,.176],p.coat,torsoWeights);
 for(const x of [-.065,.065])b.box([.025,.25,.016],[x,1.19,.228],p.trim,torsoWeights);
 b.box([.060,.086,.025],[-.13,1.26,-.175],p.accent,torsoWeights);
 if(role==='survivor'){b.box([.043,.013,.008],[-.13,1.264,-.192],p.trim,torsoWeights);b.box([.013,.043,.008],[-.13,1.264,-.192],p.trim,torsoWeights);}
 b.add(faceGeometry(variant,p),p.skin,head);
 for(const side of [-1,1]){
  b.ellipsoid([.020,.035,.021],[side*.141,1.675,.005],p.skin,head,8,5);b.ellipsoid([.006,.021,.013],[side*.157,1.675,-.003],p.shade,head,8,5);
  const x=side*.054,y=.016;
  b.add(faceDisk(variant,x,y,.022,.006,.003),'#c6baa2',head);
  b.add(faceDisk(variant,x,y+.0003,.0055,.0051,.0038,12),variant%2?'#485047':'#514b39',head);
  b.add(faceDisk(variant,x,y+.0003,.0023,.0038,.0042,10),'#202622',head);
  b.add(faceStrip(variant,x,y,.023,u=>.0045*(1-u*u)+.0004,u=>.0065*(1-u*u)+.0075,.0047,.0004),p.skin,head);
  b.add(faceStrip(variant,x,y,.023,u=>-.0065*(1-u*u)-.004,u=>-.004*(1-u*u)-.0003,.0004,.0047),p.skin,head);
  const brow=u=>.039+.004*(1-u*u)-.002*side*u,thickness=u=>.00035+.0015*(1-u*u);
  b.add(faceStrip(variant,x,0,.024,u=>brow(u)-thickness(u),u=>brow(u)+thickness(u),.0013,.0013,10),p.hair,head);
 }
 // Hair changes the silhouette as well as surface color; compact crowns avoid
 // the old helmet-sphere skull. The seam sits inside the head surface.
 if(!helmet){
  b.add(loft([[1.762,.132,.122,.005],[1.805,.123,.115,.010],[1.84,.093,.087,.012],[1.862,.043,.049,.010],[1.865,.009,.010,.007]],20),p.hair,head);
  if(variant===1||variant===3)b.ellipsoid([.065,.055,.066],[variant===1?.035:-.035,1.82,.11],p.hair,head,12,7);
 }else{
  b.add(loft([[1.751,.145,.136,.006],[1.775,.149,.141,.006],[1.82,.138,.131,.009],[1.865,.107,.109,.013],[1.895,.052,.060,.013],[1.901,.012,.016,.012]],20),variant%2?p.dark:'#a99d70',head);
  b.add(loft([[1.751,.152,.144,.004],[1.769,.153,.146,.004]],20),p.dark,head);
  b.box([.25,.017,.105],[0,1.765,-.135],variant%2?p.coat:'#a99d70',head,[.08,0,0]);
  for(const side of [-1,1])b.rod([side*.137,1.756,.012],[side*.105,1.557,-.032],.006,p.dark,head);
 }
 return b.finish();
}
function buildRifle(material){
 const group=new T.Group();group.name='Two-handed field carbine';const b=new SkinBuilder(),w=one('hips');
 b.box([.09,.11,.39],[.065,0,-.38],'#333c37',w);b.box([.082,.065,.22],[.065,-.015,-.10],'#726b4e',w);
 b.box([.067,.13,.09],[.065,-.10,-.29],'#242b27',w,[.18,0,0]);b.box([.067,.16,.10],[.065,-.12,-.44],'#555d4e',w,[-.16,0,0]);
 b.box([.076,.08,.22],[.065,.004,-.64],'#6c7259',w);b.rod([.065,.015,-.72],[.065,.015,-.96],.018,'#242c29',w);
 b.box([.025,.035,.026],[.065,.071,-.83],'#282f2b',w);b.box([.038,.042,.042],[.065,.080,-.32],'#202a27',w);
 const g=b.finish();g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');const mesh=new T.Mesh(g,material);mesh.castShadow=true;group.add(mesh);
 const muzzle=new T.Object3D();muzzle.position.set(.065,.015,-.98);group.add(muzzle);
 const flash=new T.Mesh(new T.ConeGeometry(.035,.16,6),new T.MeshBasicMaterial({color:'#fff2b8'}));flash.rotation.x=-Math.PI/2;flash.position.z=-.065;flash.visible=false;muzzle.add(flash);
 return {group,muzzle,flash};
}
const templates=new Map();
export function createSurvivorRig({variant=0,role='survivor',helmet=false}={}){
 if(!['survivor','rifle','driver'].includes(role))throw new RangeError(`Unknown survivor role: ${role}`);
 variant=((Math.trunc(safe(variant))%SURVIVOR_VARIANTS)+SURVIVOR_VARIANTS)%SURVIVOR_VARIANTS;
 const root=new T.Group();root.name=`Articulated ${role} ${variant+1}`;const key=`${variant}:${role}:${!!helmet}`;
 if(!templates.has(key))templates.set(key,buildBody(variant,role,helmet));
 const geometry=templates.get(key).clone(),material=new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.88,metalness:0}),mesh=new T.SkinnedMesh(geometry,material),bones={};
 mesh.name='Continuous survivor skin and clothing';mesh.castShadow=mesh.receiveShadow=true;
 // Conservative object-space bounds cover standing, running and seated skins.
 // Keep ordinary frustum culling without CPU skinning to rebuild bounds each frame.
 mesh.boundingSphere=new T.Sphere(new T.Vector3(0,.65,-.12),1.55);
 mesh.boundingBox=new T.Box3(new T.Vector3(-.85,-.70,-1.15),new T.Vector3(.85,2.0,.55));root.add(mesh);
 for(const [name,parent,x,y,z] of specifications){const bone=new T.Bone();bone.name=name;bone.position.set(x,y,z);bones[name]=bone;(parent?bones[parent]:mesh).add(bone);}
 root.updateMatrixWorld(true);const skeleton=new T.Skeleton(specifications.map(([name])=>bones[name]));mesh.bind(skeleton);
 const weapon=role==='rifle'?buildRifle(material):null;if(weapon)root.add(weapon.group);
 const metrics=Object.freeze({bodyTriangles:geometry.index.count/3,bodyVertices:geometry.attributes.position.count,bones:skeleton.bones.length,opaqueDraws:weapon?2:1,bindHeight:geometry.boundingBox.max.y,hipHeight:.94,eyeHeight:1.696,skinBytes:Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0)+geometry.index.array.byteLength});
 root.userData={variant,role,head:bones.head,upper:bones.chest,arms:weapon?.group||bones.chest,legs:[bones.leftThigh,bones.rightThigh],muzzle:weapon?.muzzle,flash:weapon?.flash,
  rig:{mesh,bones,skeleton,metrics,weapon,state:{clock:0,recoil:0},disposed:false},artContract:{opaqueDraws:metrics.opaqueDraws,triangleCeiling:7500}};
 poseSurvivorRig(root,{time:0});return root;
}
const scratch={shoulder:new T.Vector3(),target:new T.Vector3(),direction:new T.Vector3(),pole:new T.Vector3(),elbow:new T.Vector3(),axis:new T.Vector3(),parent:new T.Quaternion(),rotation:new T.Quaternion()};
function solveArm(root,s,x,y,z,seated){
 const b=root.userData.rig.bones,upper=b[s+'UpperArm'],fore=b[s+'ForeArm'],side=s==='left'?-1:1,v=scratch;
 root.updateWorldMatrix(true,true);upper.getWorldPosition(v.shoulder);v.target.set(x,y,z).applyMatrix4(root.matrixWorld);v.direction.subVectors(v.target,v.shoulder);const distance=clamp(v.direction.length(),.035,.548);v.direction.normalize();
 v.pole.set(side*.62,seated?.12:1.06,.05).applyMatrix4(root.matrixWorld).sub(v.shoulder);v.pole.addScaledVector(v.direction,-v.pole.dot(v.direction)).normalize();
 const along=(.29*.29-.26*.26+distance*distance)/(2*distance),bend=Math.sqrt(Math.max(0,.29*.29-along*along));v.elbow.copy(v.shoulder).addScaledVector(v.direction,along).addScaledVector(v.pole,bend);
 v.axis.subVectors(v.elbow,v.shoulder).normalize();v.rotation.setFromUnitVectors(DOWN,v.axis);upper.parent.getWorldQuaternion(v.parent).invert();upper.quaternion.copy(v.parent.multiply(v.rotation));upper.updateWorldMatrix(false,true);
 // Clamp unreachable wrists to the actual two-link reach, preserving lengths.
 v.target.copy(v.shoulder).addScaledVector(v.direction,distance);v.axis.subVectors(v.target,v.elbow).normalize();v.rotation.setFromUnitVectors(DOWN,v.axis);fore.parent.getWorldQuaternion(v.parent).invert();fore.quaternion.copy(v.parent.multiply(v.rotation));
}
function solveLeg(b,s,hipY,targetY,targetZ,toe=0){
 const dy=targetY-(hipY-.02),distance=clamp(Math.hypot(dy,targetZ),.08,.7998),bend=Math.acos(clamp((distance*distance-.32)/.32,-1,1)),aim=Math.atan2(-targetZ,-dy),upper=aim+bend*.5;
 b[s+'Thigh'].rotation.x=upper;b[s+'Shin'].rotation.x=-bend;b[s+'Foot'].rotation.x=bend-upper+toe;
}
export function poseSurvivorRig(root,{walking=0,dt=0,time,aimPitch=0,firing=false,seated=false,steer=0,lookYaw=0,seat='driver'}={}){
 const rig=root?.userData?.rig;if(!rig||rig.disposed)return root;
 const b=rig.bones,state=rig.state,speed=clamp(walking===true?1:safe(walking),0,1),delta=clamp(safe(dt),0,.1),fixed=Number.isFinite(time);
 state.clock=fixed?time:state.clock+delta;state.recoil=fixed?(firing?.045:0):firing?.045:state.recoil*Math.exp(-delta*17);
 const phase=state.clock*(5.4+3.6*speed)+root.userData.variant*.55,breath=Math.sin(state.clock*2.0)*.003,aim=clamp(safe(aimPitch),-.8,1.0),turn=clamp(safe(steer),-1,1);
 for(const bone of rig.skeleton.bones)bone.rotation.set(0,0,0);
 b.hips.position.set(0,seated?0:.94-.075*speed-.012*speed*Math.abs(Math.cos(phase*2)),0);
 b.spine.rotation.x=seated?.07:speed*.065;b.chest.rotation.x=breath;b.chest.rotation.y=seated?0:Math.sin(phase)*speed*.035;
 b.hips.rotation.z=seated?0:Math.sin(phase)*speed*.018;b.head.rotation.set(-aim*.22,clamp(safe(lookYaw),-.65,.65)+(seated&&seat==='driver'?turn*.16:0),0);
 if(seated){
  // Bucket seats raise the knees slightly. These angles retain the buggy's
  // existing 0.6025 m sole clearance above its actual solid footwell.
  for(const s of ['left','right']){b[s+'Thigh'].rotation.x=1.73;b[s+'Thigh'].rotation.z=s==='left'?-.06:.06;b[s+'Shin'].rotation.x=-1.65;b[s+'Foot'].rotation.x=-.08;}
  for(const s of ['left','right']){const side=s==='left'?-1:1;if(seat==='driver')solveArm(root,s,side*.145-turn*.035,.425+side*turn*.055,-.493,true);else solveArm(root,s,side*.145,.10,-.28,true);}
 }else{
  for(const [s,offset] of [['left',0],['right',Math.PI]]){
   const cycle=phase+offset,lift=Math.max(0,Math.cos(cycle)),stride=speed*(.20+.12*speed);
   solveLeg(b,s,b.hips.position.y,.12+Math.pow(lift,1.5)*speed*(.11+.07*speed),-Math.sin(cycle)*stride,-Math.max(0,-Math.cos(cycle))*speed*.08);
   const side=s==='left'?-1:1;b[s+'UpperArm'].rotation.set(-Math.sin(cycle)*speed*.36+.035,0,side*.055);b[s+'ForeArm'].rotation.x=.10+speed*.22;b[s+'Hand'].rotation.x=-.06;
  }
 }
 if(rig.weapon){
  const w=rig.weapon;w.group.position.set(0,(seated?.345:1.285)+speed*Math.abs(Math.cos(phase))*.012,-.02+state.recoil);w.group.rotation.set(aim,0,0);w.group.visible=!seated||seat==='gunner';w.flash.visible=!!firing&&(!seated||seat==='gunner');
  if(!seated||seat==='gunner'){
   // Weapon is an independent aim anchor so the actual muzzle direction stays
   // exact; both wrists solve toward its two grips, including pitch/recoil.
   const c=Math.cos(aim),s=Math.sin(aim),y=w.group.position.y,z=w.group.position.z;
   solveArm(root,'right',.095,y-.07*c+.28*s,z-.07*s-.28*c,seated);
   solveArm(root,'left',-.005,y-.035*c+.61*s,z-.035*s-.61*c,seated);
  }
 }
 root.updateMatrixWorld(true);rig.skeleton.update();return root;
}
export function disposeSurvivorRig(root){
 const rig=root?.userData?.rig;if(!rig||rig.disposed)return;rig.disposed=true;root.removeFromParent();
 const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();rig.skeleton.dispose();
}

