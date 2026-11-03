import * as T from 'three/webgpu';

// One articulated, vertex-coloured mesh for the whole GPU crowd. Rounded
// limb sections and a compact human head spend detail on the silhouette;
// clothing/face accents share its existing material and part attributes.
export function zombieGeometry(){
 const positions=[],normals=[],colors=[],parts=[];
 const skin='#a1a184',skinShadow='#72785f',shirt='#756c56',trousers='#40534e',boots='#263a35';
 const colorCache=new Map();
 const colorFor=color=>{if(!colorCache.has(color))colorCache.set(color,new T.Color(color));return colorCache.get(color);};
 function triangle(a,b,c,color,part=0){
  const ab=new T.Vector3(...b).sub(new T.Vector3(...a)),ac=new T.Vector3(...c).sub(new T.Vector3(...a)),n=ab.cross(ac).normalize(),rgb=colorFor(color);
  for(const p of [a,b,c]){positions.push(...p);normals.push(n.x,n.y,n.z);colors.push(rgb.r,rgb.g,rgb.b);parts.push(part);}
 }
 function quad(a,b,c,d,color,part=0){triangle(a,b,c,color,part);triangle(a,c,d,color,part);}
 function loft(rings,palette,part=0,segments=6,smooth=true){
  if(rings[0][1]>rings.at(-1)[1])rings=[...rings].reverse();
  const p=[],indices=[],faceColors=[];
  const ring=([x,y,z,w,d])=>{
   if(segments===8)return [[x-w*.68,y,z-d],[x+w*.68,y,z-d],[x+w,y,z-d*.58],[x+w,y,z+d*.58],[x+w*.68,y,z+d],[x-w*.68,y,z+d],[x-w,y,z+d*.58],[x-w,y,z-d*.58]];
   if(segments===4)return [[x-w,y,z-d],[x+w,y,z-d],[x+w,y,z+d],[x-w,y,z+d]];
   return Array.from({length:segments},(_,i)=>{const a=(i+.5)/segments*Math.PI*2;return [x+Math.sin(a)*w,y,z-Math.cos(a)*d];});
  };
  const rr=rings.map(ring);for(const r of rr)for(const q of r)p.push(...q);
  const add=(a,b,c,row,side)=>{indices.push(a,b,c);faceColors.push(typeof palette==='function'?palette(row,side):palette);};
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){
   const k=(i+1)%segments,a=row*segments+i,b=(row+1)*segments+i,c=(row+1)*segments+k,d=row*segments+k;
   add(a,b,c,row,i);add(a,c,d,row,i);
  }
  const sideFaceCount=faceColors.length;
  for(let i=1;i<segments-1;i++){add(0,i,i+1,0,segments);const t=(rings.length-1)*segments;add(t,t+i+1,t+i,rings.length-2,segments);}
  // Cap faces are hard boundaries. Their fan must not drag a tapered wrist
  // or boot's shared side normal through the surface at an extreme corner.
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(indices.slice(0,sideFaceCount*3));g.computeVertexNormals();
  const n=g.attributes.normal,vertex=g.attributes.position,pa=new T.Vector3(),pb=new T.Vector3(),pc=new T.Vector3(),flat=new T.Vector3();
  for(let face=0;face<faceColors.length;face++){
   const rgb=colorFor(faceColors[face]),ii=indices.slice(face*3,face*3+3),round=smooth&&face<sideFaceCount;
   if(!round){pa.fromBufferAttribute(vertex,ii[0]);pb.fromBufferAttribute(vertex,ii[1]);pc.fromBufferAttribute(vertex,ii[2]);flat.copy(pb).sub(pa).cross(pc.sub(pa)).normalize();}
   for(const i of ii){positions.push(vertex.getX(i),vertex.getY(i),vertex.getZ(i));normals.push(...(round?[n.getX(i),n.getY(i),n.getZ(i)]:flat.toArray()));colors.push(rgb.r,rgb.g,rgb.b);parts.push(part);}
  }
  g.dispose();
 }
 // Natural shoulder slope and waist; the neck no longer protrudes as a peg.
 loft([[0,.83,.025,.19,.13],[0,1.00,.005,.175,.125],[0,1.37,.025,.285,.16],[0,1.48,.015,.165,.105]],(row,side)=>side===0?(row===0?'#535044':shirt):side===4?'#505c4f':shirt,0,8);
 loft([[0,1.44,-.005,.075,.07],[0,1.61,-.025,.07,.07]],skinShadow,0,4);
 // Jaw, cheeks, temples, rounded cranium. Front faces remain wide enough for
 // paired eyes and a short nose instead of a projecting triangular muzzle.
 loft([[0,1.56,-.052,.085,.085],[0,1.65,-.032,.128,.12],[0,1.80,-.015,.145,.135],[0,1.88,-.005,.105,.105]],(row,side)=>row===2&&side>0?'#495747':side===4?skinShadow:skin,0,8);
 for(const side of [-1,1]){
  const x=side*.071;
  const tilt=side<0?.018:-.008;
  quad([x-.043,1.738+tilt,-.158],[x+.043,1.738-tilt,-.158],[x+.034,1.705-tilt*.3,-.161],[x-.034,1.705+tilt*.3,-.161],'#303b30');
  quad([x-.046,1.751+tilt,-.156],[x+.044,1.751-tilt,-.156],[x+.043,1.739-tilt,-.167],[x-.044,1.739+tilt,-.167],skinShadow);
  triangle([x-.012,1.719,-.164],[x+.011,1.720,-.164],[x+.003,1.709,-.164],'#b7bba3');
  // Ears are broad enough to read in profile without long exposed facets.
  triangle([side*.139,1.765,-.035],[side*.17,1.734,-.028],[side*.14,1.684,-.035],skinShadow);
  triangle([side*.139,1.765,-.035],[side*.14,1.684,-.035],[side*.17,1.734,-.028],skin);
 }
 triangle([-.021,1.738,-.154],[.021,1.738,-.154],[0,1.677,-.194],skin);
 triangle([-.021,1.738,-.154],[0,1.677,-.194],[-.026,1.675,-.153],skinShadow);
 triangle([.021,1.738,-.154],[.027,1.675,-.153],[0,1.677,-.194],'#b1ae8e');
 triangle([-.026,1.675,-.153],[0,1.677,-.194],[.027,1.675,-.153],'#56654e');
 quad([-.045,1.644,-.155],[.041,1.637,-.155],[.026,1.586,-.145],[-.035,1.605,-.149],'#38251f');
 triangle([-.034,1.64,-.157],[.028,1.635,-.157],[.015,1.627,-.158],'#b8b69c');
 triangle([-.021,1.605,-.151],[.023,1.591,-.148],[.011,1.606,-.152],'#8d7965');
 triangle([.066,1.689,-.162],[.094,1.661,-.157],[.079,1.618,-.150],'#6f493a');
 // Lapel and asymmetrical tears sit just above their actual jacket surface.
 triangle([-.108,1.426,-.116],[-.028,1.458,-.107],[-.034,1.277,-.137],'#96907a');
 triangle([.025,1.455,-.107],[.115,1.423,-.116],[.034,1.279,-.137],'#484d40');
 triangle([-.16,.924,-.127],[-.095,.847,-.13],[-.055,.962,-.13],skinShadow);
 triangle([.068,1.17,-.146],[.14,1.245,-.153],[.127,1.08,-.141],'#473c32');
 for(const side of [-1,1]){
  const arm=side<0?1:2,leg=side<0?3:4;
  // Six-sided limbs keep elbows/knees visible while smooth normals remove
  // the old four-sided tube appearance. Hands curl forward from the wrist.
  loft([[side*.292,1.41,.02,.102,.106],[side*.356,1.16,-.035,.08,.083],[side*.342,.88,-.17,.05,.054]],row=>row===1?shirt:skin,arm,6);
  loft([[side*.342,.90,-.17,.047,.045],[side*.332,.755,-.235,.061,.055]],skinShadow,arm,4);
  loft([[side*.122,.85,.025,.108,.12],[side*.145,.48,-.033,.085,.088],[side*.15,.135,.02,.063,.07]],(row,face)=>row===0&&face===0?'#61715e':trousers,leg,6);
  loft([[side*.15,.025,-.068,.086,.16],[side*.15,.17,-.024,.08,.12]],boots,leg,6);
 }
 const g=new T.InstancedBufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('part',new T.Float32BufferAttribute(parts,1));
 return g;
}
