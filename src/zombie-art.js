import * as T from 'three/webgpu';

// One articulated, vertex-coloured mesh for the whole GPU crowd. Rounded
// limb sections and a compact human head spend detail on the silhouette;
// clothing/face accents share its existing material and part attributes.
export function zombieGeometry({indexed=true}={}){
 const positions=[],normals=[],colors=[],parts=[],uvs=[];
 const atlasUV=(u,v,region)=>[(region%4+(2+u*124)/128)/4,(Math.floor(region/4)+(2+v*124)/128)/2];
 const skin='#b4b39b',skinShadow='#737a64',shirt='#a29b88',trousers='#586064',boots='#393835';
 const colorCache=new Map();
 const colorFor=color=>{if(!colorCache.has(color))colorCache.set(color,new T.Color(color));return colorCache.get(color);};
 function triangle(a,b,c,color,part=0){
  const ab=new T.Vector3(...b).sub(new T.Vector3(...a)),ac=new T.Vector3(...c).sub(new T.Vector3(...a)),n=ab.cross(ac).normalize(),rgb=colorFor(color);
  for(const p of [a,b,c]){positions.push(...p);normals.push(n.x,n.y,n.z);colors.push(rgb.r,rgb.g,rgb.b);parts.push(part);uvs.push(...atlasUV(.5,.5,4));}
 }
 function quad(a,b,c,d,color,part=0){triangle(a,b,c,color,part);triangle(a,c,d,color,part);}
 function loft(rings,palette,part=0,segments=6,smooth=true,region=0,caps=true){
  if(rings[0][1]>rings.at(-1)[1])rings=[...rings].reverse();
  const p=[],indices=[],faceColors=[];
  const ring=([x,y,z,w,d,slope=0])=>{
   if(segments===8)return [[x-w*.68,y,z-d],[x+w*.68,y,z-d],[x+w,y,z-d*.58],[x+w,y,z+d*.58],[x+w*.68,y,z+d],[x-w*.68,y,z+d],[x-w,y,z+d*.58],[x-w,y,z-d*.58]];
   if(segments===4)return [[x-w,y,z-d],[x+w,y,z-d],[x+w,y,z+d],[x-w,y,z+d]];
   return Array.from({length:segments},(_,i)=>{const a=(i+.5)/segments*Math.PI*2;return [x+Math.sin(a)*w,y+Math.sin(a)*w*slope,z-Math.cos(a)*d];});
  };
  const rr=rings.map(ring);for(const r of rr)for(const q of r)p.push(...q);
  const add=(a,b,c,row,side)=>{indices.push(a,b,c);faceColors.push(typeof palette==='function'?palette(row,side):palette);};
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){
   const k=(i+1)%segments,a=row*segments+i,b=(row+1)*segments+i,c=(row+1)*segments+k,d=row*segments+k;
   add(a,b,c,row,i);add(a,c,d,row,i);
  }
  const sideFaceCount=faceColors.length;
  for(let i=1;i<segments-1;i++){if(caps===true||caps==='bottom')add(0,i,i+1,0,segments);const t=(rings.length-1)*segments;if(caps===true||caps==='top')add(t,t+i+1,t+i,rings.length-2,segments);}
  // Cap faces are hard boundaries. Their fan must not drag a tapered wrist
  // or boot's shared side normal through the surface at an extreme corner.
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(indices.slice(0,sideFaceCount*3));g.computeVertexNormals();
  const n=g.attributes.normal,vertex=g.attributes.position,pa=new T.Vector3(),pb=new T.Vector3(),pc=new T.Vector3(),flat=new T.Vector3();
  for(let face=0;face<faceColors.length;face++){
   const rgb=colorFor(faceColors[face]),ii=indices.slice(face*3,face*3+3),round=smooth&&face<sideFaceCount;
   if(!round){pa.fromBufferAttribute(vertex,ii[0]);pb.fromBufferAttribute(vertex,ii[1]);pc.fromBufferAttribute(vertex,ii[2]);flat.copy(pb).sub(pa).cross(pc.sub(pa)).normalize();}
   for(const i of ii){positions.push(vertex.getX(i),vertex.getY(i),vertex.getZ(i));normals.push(...(round?[n.getX(i),n.getY(i),n.getZ(i)]:flat.toArray()));colors.push(rgb.r,rgb.g,rgb.b);parts.push(part);
    // Each loft owns a continuous cylindrical strip. Duplicate the wrap seam
    // rather than interpolating across unrelated atlas tiles. Caps sample their edge.
    let u=(i%segments)/segments;if(face<sideFaceCount&&Math.floor((face%(segments*2))/2)===segments-1&&i%segments===0)u=1;
    let v=Math.floor(i/segments)/(rings.length-1);if(face>=sideFaceCount){u=.5;v=.5;}uvs.push(...atlasUV(u,v,typeof region==='function'?region(Math.min(rings.length-2,Math.floor(face/(segments*2)))):region));}
  }
  g.dispose();
 }
 // Hidden neck, wrist, ankle and finger-root caps are omitted only where forms overlap.
 // Detail stays in one shared opaque mesh; no per-zombie meshes or textures.
 // Natural shoulder slope and waist; the neck no longer protrudes as a peg.
 loft([[0,.83,.025,.20,.14],[0,1.00,.005,.163,.112],[.012,1.23,.025,.235,.148],[0,1.37,.025,.285,.16],[0,1.48,.015,.165,.105]],(row,side)=>side===0?(row===0?'#535044':shirt):side===4?'#8d897b':shirt,0,8,true,1);
 loft([[0,1.43,.012,.079,.071],[0,1.565,-.025,.064,.067]],skinShadow,0,8,true,0,false);
 // Jaw, cheeks, temples, rounded cranium. Front faces remain wide enough for
 // paired eyes and a short nose instead of a projecting triangular muzzle.
 loft([[.006,1.56,-.053,.068,.079],[0,1.68,-.029,.132,.12],[-.008,1.79,-.006,.139,.139],[-.011,1.865,.004,.112,.112],[-.012,1.905,.005,.057,.065]],(row,side)=>row===2&&side>3?'#606b53':side===4?skinShadow:skin,0,8,true,5);
 // Keep socket/brow edges inside the flat front facial strip. Old wide plates
 // crossed onto the receding temple bevel and appeared to float like glasses.
 for(const side of [-1,1]){
  const x=side*.052;
  const tilt=side<0?.012:-.004;
  quad([x-.033,1.748+tilt,-.151],[x+.033,1.748-tilt,-.151],[x+.027,1.698-tilt*.3,-.153],[x-.029,1.698+tilt*.3,-.153],'#30352c');
  quad([x-.035,1.751+tilt,-.149],[x+.034,1.751-tilt,-.149],[x+.033,1.739-tilt,-.155],[x-.034,1.739+tilt,-.155],skinShadow);
  triangle([x-.009,1.723,-.156],[x+.009,1.724,-.156],[x+.002,1.710,-.156],'#d0c394');
  // Ears are broad enough to read in profile without long exposed facets.
  triangle([side*.139,1.765,-.035],[side*.17,1.734,-.028],[side*.14,1.684,-.035],skinShadow);
  triangle([side*.139,1.765,-.035],[side*.14,1.684,-.035],[side*.17,1.734,-.028],skin);
 }
 triangle([-.021,1.738,-.154],[.021,1.738,-.154],[0,1.677,-.194],skin);
 triangle([-.021,1.738,-.154],[0,1.677,-.194],[-.026,1.675,-.153],skinShadow);
 triangle([.021,1.738,-.154],[.027,1.675,-.153],[0,1.677,-.194],'#b1ae8e');
 triangle([-.026,1.675,-.153],[0,1.677,-.194],[.027,1.675,-.153],'#56654e');
 quad([-.049,1.648,-.157],[.044,1.641,-.157],[.033,1.583,-.143],[-.036,1.598,-.150],'#38251f');
 triangle([-.034,1.64,-.157],[.028,1.635,-.157],[.015,1.627,-.158],'#b8b69c');
 triangle([-.021,1.605,-.151],[.023,1.591,-.148],[.011,1.606,-.152],'#8d7965');
 triangle([.059,1.694,-.152],[.083,1.674,-.152],[.065,1.622,-.144],'#765547');
 // Lapel and asymmetrical tears sit just above their actual jacket surface.
 triangle([-.108,1.426,-.132],[-.028,1.458,-.118],[-.034,1.277,-.154],'#96907a');
 triangle([.025,1.455,-.118],[.115,1.423,-.133],[.034,1.279,-.154],'#484d40');
 triangle([-.16,.924,-.127],[-.095,.847,-.13],[-.055,.962,-.13],skinShadow);
 triangle([.068,1.17,-.146],[.14,1.245,-.153],[.127,1.08,-.141],'#473c32');
 // Open jacket exposes an undershirt. Tailored lapels, pockets and a belt
 // break the old uninterrupted tube silhouette using the existing draw call.
 quad([-.041,1.43,-.137],[.042,1.43,-.137],[.043,1.03,-.121],[-.044,1.03,-.121],'#b0aa91');
 quad([-.045,1.10,-.127],[.044,1.10,-.127],[.045,.92,-.142],[-.046,.92,-.142],'#534a40');
 quad([-.108,.938,-.13],[.108,.938,-.13],[.112,.899,-.139],[-.112,.899,-.139],'#3b332d');
 quad([-.024,.94,-.141],[.026,.94,-.141],[.026,.901,-.15],[-.024,.901,-.15],'#858474');
 for(const side of [-1,1]){
  const x=side*.14;
  quad([x-.045,1.30,-.154],[x+.045,1.30,-.154],[x+.040,1.20,-.15],[x-.04,1.20,-.15],'#787569');
  triangle([x-.045,1.30,-.158],[x+.045,1.30,-.158],[x,1.274,-.16],'#b6ae97');
  triangle([side*.19,.86,-.12],[side*.105,.84,-.132],[side*.16,.79,-.12],shirt);
 }
 for(const side of [-1,1]){
  const arm=side<0?1:2,leg=side<0?3:4;
  // Six-sided limbs keep elbows/knees visible while smooth normals remove
  // the old four-sided tube appearance. Hands curl forward from the wrist.
  loft([[side*.282,1.41,.02,.112,.111,-side*.45],[side*.356,1.16,-.035,.076,.080],[side*.361,1.10,-.058,.073,.072]],shirt,arm,6,true,1,'top');
  // Exposed bony forearms below a ragged elbow-length sleeve.
  loft([[side*.361,1.12,-.05,.059,.061],[side*.363,1.01,-.103,.052,.049],[side*.342,.88,-.176,.032,.024]],skin,arm,6,true,0,false);
  // Crossed wrist/palm overlap closes both ends without a cuff-like hard cap.
  loft([[side*.345,.94,-.1458,.040,.030],[side*.332,.785,-.235,.060,.042]],skin,arm,6,true,0,'bottom');
  // Split, bent mitten fingers and an opposing thumb read at driving distance
  // without giving every crowd member an expensive articulated hand rig.
  for(const offset of [-.026,.026])loft([[side*.332+offset,.792,-.235,.019,.030],[side*.329+offset,.735,-.258,.017,.028]],skin,arm,3,false,0,'bottom');
  triangle([side*.291,.845,-.20],[side*.268,.787,-.235],[side*.31,.791,-.259],skin,arm);
  triangle([side*.291,.845,-.20],[side*.31,.791,-.259],[side*.268,.787,-.235],skinShadow,arm);
  loft([[side*.122,.85,.025,.108,.12],[side*.139,.58,-.016,.088,.091],[side*.15,.43,-.051,.069,.072],[side*.15,.135,-.016,.052,.048]],(row,face)=>row===0&&face===0?'#61715e':trousers,leg,6,true,2,'top');
  loft([[side*.15,.025,-.068,.086,.16],[side*.149,.24,-.021,.056,.055]],boots,leg,6,true,3,'bottom');
 }
 // Human proportions and a permanently stooped upper spine. The head is
 // smaller than the old toy-like cranium; the neck remains buried in the collar.
 for(let i=0;i<positions.length;i+=3){
  let x=positions[i],y=positions[i+1],z=positions[i+2];
  if(y>1.55){x*=.86;y=1.49+(y-1.55)*.90;z=-.025+(z+.025)*.88;
   normals[i]/=.86;normals[i+1]/=.90;normals[i+2]/=.88;}
  if(y>1.15){z-=(y-1.15)*.20;normals[i+1]+=.20*normals[i+2];}
  positions[i]=x;positions[i+1]=y;positions[i+2]=z;
  const n=Math.hypot(normals[i],normals[i+1],normals[i+2]);for(let j=0;j<3;j++)normals[i+j]/=n||1;
 }
 const g=new T.InstancedBufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('part',new T.Float32BufferAttribute(parts,1));
 // Index only bit-identical full attribute tuples. UV seams, hard edges,
 // material boundaries and limb tags stay split; triangle order is untouched.
 // The test-only expanded form proves this is a lossless representation change.
 if(indexed){
  const names=Object.keys(g.attributes),unique=new Map(),indices=[],buffers=Object.fromEntries(names.map(name=>[name,[]]));
  for(let i=0;i<g.attributes.position.count;i++){
   const values=names.map(name=>{const a=g.attributes[name];return Array.from(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize));});
   const key=values.map(v=>v.map(n=>Object.is(n,-0)?'-0':String(n)).join(',')).join('|');let id=unique.get(key);
   if(id===undefined){id=unique.size;unique.set(key,id);names.forEach((name,n)=>buffers[name].push(...values[n]));}indices.push(id);
  }
  for(const name of names)g.setAttribute(name,new T.Float32BufferAttribute(buffers[name],g.attributes[name].itemSize));
  g.setIndex(indices);
 }
 return g;
}

