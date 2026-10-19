// Adapted from Trent Sterling's BUTTLOADS 2 miner-art.js at a28fa210.
// https://github.com/TrentSterling/buttloads2/blob/a28fa21085ddcf30e9d7f77cec74fd99e3657b2b/src/miner-art.js
// Copyright (c) 2026 Trent Sterling. MIT; see LICENSE and docs/CHARACTER-ART.md.
// Only procedural construction is reused; no WebGL joint shaders or textures.
import * as T from 'three/webgpu';
const clamp=T.MathUtils.clamp;
export function characterLoft(rings,segments=16,closedSeam=false){
  if(rings[0][0]>rings[rings.length-1][0])rings=[...rings].reverse();
  const positions=[],uv=[],indices=[];
  rings.forEach(([y,rx,rz,z=0,x=0],row)=>{for(let j=0;j<=segments;j++){const a=closedSeam&&j===segments?0:j/segments*Math.PI*2;positions.push(x+Math.sin(a)*rx,y,z+Math.cos(a)*rz);uv.push(j/segments,row/(rings.length-1));}});
  for(let row=0;row<rings.length-1;row++)for(let j=0;j<segments;j++){const a=row*(segments+1)+j,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
  for(const row of [0,rings.length-1]){const [y,,,z=0,x=0]=rings[row],center=positions.length/3;positions.push(x,y,z);uv.push(.5,.5);for(let j=0;j<segments;j++){const a=row*(segments+1)+j;indices.push(center,...(row?[a,a+1]:[a+1,a]));}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
 }

const faceHeights=[-.151,-.146,-.137,-.125,-.111,-.101,-.097,-.094,-.090,-.087,-.084,-.081,-.076,-.068,-.060,-.052,-.044,-.034,-.024,-.012,.002,.018,.036,.058,.083,.111,.137,.154];
 const faceSpot=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
 function faceSection(y){
  const r=Math.sqrt(Math.max(0,1-((y-.012)/.163)**2)),jaw=Math.exp(-(((y+.065)/.046)**2));
  return{rx:.004+.162*r+.008*jaw,rz:.007+.136*r,z:-.014*Math.exp(-(((y+.142)/.035)**2))};
 }
 function faceRelief(x,y){
  const noseWidth=.015+.013*faceSpot(x,y,0,-.039,.1,.021);
  const bridge=.030*faceSpot(x,y,0,-.021,noseWidth,.033),tip=.025*faceSpot(x,y,0,-.038,.023,.014);
  const wings=.010*(faceSpot(x,y,-.025,-.044,.009,.011)+faceSpot(x,y,.025,-.044,.009,.011));
  const nostrils=.0015*(faceSpot(x,y,-.020,-.050,.005,.004)+faceSpot(x,y,.020,-.050,.005,.004));
  const cheek=.005*(faceSpot(x,y,-.104,-.045,.039,.041)+faceSpot(x,y,.104,-.045,.039,.041));
  const mouthY=-.090+.004*(x/.055)**2,lip=.004*faceSpot(x,y,0,mouthY-.007,.043,.006)+.002*faceSpot(x,y,0,mouthY+.006,.040,.007);
  const crease=.003*faceSpot(x,y,0,mouthY,.044,.0028),chin=.003*faceSpot(x,y,0,-.120,.060,.025);
  return bridge+tip+wings-nostrils+cheek+lip-crease+chin;
 }
 export function faceFront(x,y){
  const s=faceSection(y),c=Math.sqrt(Math.max(0,1-(x/s.rx)**2)),t=clamp((c-.15)/.75,0,1);
  return s.z-s.rz*c-faceRelief(x,y)*t*t*(3-2*t);
 }
 function faceSeamNormals(geometry,segments,rows){
  geometry.computeVertexNormals();const n=geometry.attributes.normal,a=new T.Vector3(),b=new T.Vector3();
  for(let row=0;row<rows;row++){const i=row*(segments+1),j=i+segments;a.fromBufferAttribute(n,i);b.fromBufferAttribute(n,j);a.add(b).normalize();n.setXYZ(i,...a.toArray());n.setXYZ(j,...a.toArray());}
 }
 export function characterFace(){
  const rings=faceHeights.map(y=>{const s=faceSection(y);return[y,s.rx,s.rz,s.z];}),segments=24,geometry=characterLoft(rings,segments,true),p=geometry.attributes.position,colors=[],angles=[];
  for(let row=0;row<rings.length;row++)for(let j=0;j<=segments;j++){
   const phi=(j/segments*2-1)*Math.PI,a=Math.PI+phi*.32+Math.sign(phi)*.68*(Math.abs(phi)/Math.PI)**2*Math.PI;
   const i=row*(segments+1)+j,y=rings[row][0],{rx,rz,z}=faceSection(y),x=Math.sin(a)*rx,c=Math.cos(a),front=clamp((-c-.15)/.75,0,1);
   p.setXYZ(i,x,y,z+c*rz-faceRelief(x,y)*front*front*(3-2*front));angles.push(a);
   const side=clamp(Math.abs(x)/rx,0,1),beardLine=-.106+.067*side**3,bt=clamp((beardLine-y)/.024,0,1),beard=bt*bt*(3-2*bt)*clamp((-c+.6)/.5,0,1);
   const mouth=.48*faceSpot(x,y,0,-.090+.004*(x/.055)**2,.043,.003),nostril=.22*(faceSpot(x,y,-.020,-.050,.006,.005)+faceSpot(x,y,.020,-.050,.006,.005))*front;
   const warm=.055*(faceSpot(x,y,-.105,-.037,.042,.030)+faceSpot(x,y,.105,-.037,.042,.030));
   const hairLine=-.103+.209*((1-c)*.5)**2,hair=clamp((y-hairLine)/.009,0,1);
   colors.push((1-.25*beard-mouth-nostril)*(1-.89*hair),(1-.23*beard-mouth-nostril-warm)*(1-.82*hair),(1-.21*beard-mouth-nostril-warm)*(1-.72*hair));
  }
  colors.push(.85,.87,.89,.11,.18,.28);
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));faceSeamNormals(geometry,segments,rings.length);
  const normal=geometry.attributes.normal,a=new T.Vector3(),b=new T.Vector3(),around=new T.Vector3(),vertical=new T.Vector3();
  const surface=(y,angle,target)=>{y=clamp(y,faceHeights[0],faceHeights.at(-1));const s=faceSection(y),x=Math.sin(angle)*s.rx,c=Math.cos(angle),front=clamp((-c-.15)/.75,0,1);return target.set(x,y,s.z+c*s.rz-faceRelief(x,y)*front*front*(3-2*front));};
  for(let i=0;i<angles.length;i++){const y=p.getY(i),angle=angles[i];surface(y,angle+.0001,a);surface(y,angle-.0001,b);around.copy(a).sub(b);surface(y+.0001,angle,a);surface(y-.0001,angle,b);vertical.copy(a).sub(b);around.cross(vertical).normalize();normal.setXYZ(i,...around.toArray());}
  return geometry;
 }

