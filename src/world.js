import {TerrainStream} from './terrain-stream.js';
import * as T from 'three/webgpu';
import {mix,color,positionGeometry,positionWorld,clamp,normalWorld,wgslFn,texture,vec2,attribute} from 'three/tsl';
import {box,cylinder,segment,material} from './art.js';
import {height,obstacles,SIZE} from './nav.js';
import {terrainFinish,addSurfaces} from './surfaces.js';
import {noise} from './terrain.js';
import {trackPoints} from './track-layout.js';


export function makeWorld(scene){
 scene.background=new T.Color('#afa18d');scene.fog=new T.FogExp2('#afa18d',.0016);
 scene.add(new T.HemisphereLight('#adc7e3','#584132',.65));
 const skyMat=new T.MeshBasicNodeMaterial({side:T.BackSide,depthWrite:false,fog:false});skyMat.colorNode=wgslFn(`fn desertSky(p:vec3f)->vec3f{let n=normalize(p);let sun=dot(n,normalize(vec3f(-120,75,-200)));return mix(vec3f(.58,.39,.21),vec3f(.11,.22,.34),smoothstep(0.0,.7,n.y))+vec3f(1.0,.52,.13)*pow(max(0.0,sun),36.0)*.3+vec3f(10.0,7.0,3.0)*smoothstep(.99978,.99994,sun);}`)(positionGeometry);const sky=new T.Mesh(new T.SphereGeometry(1800,32,16),skyMat);scene.add(sky);
 const envData=new Float32Array(256*128*4),sunDir=new T.Vector3(-120,75,-200).normalize();for(let y=0;y<128;y++)for(let x=0;x<256;x++){const phi=y/127*Math.PI,theta=x/255*Math.PI*2,n=new T.Vector3(-Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)),t=Math.max(0,n.y),base=new T.Color('#c6a074').lerp(new T.Color('#668fab'),Math.sqrt(t));if(n.y<0)base.set('#655140').multiplyScalar(.4);const glow=Math.pow(Math.max(0,n.dot(sunDir)),180)*3;base.add(new T.Color(1,.64,.3).multiplyScalar(glow));envData.set([base.r,base.g,base.b,1],(y*256+x)*4);}const env=new T.DataTexture(envData,256,128,T.RGBAFormat,T.FloatType);env.mapping=T.EquirectangularReflectionMapping;env.needsUpdate=true;scene.environment=env;scene.environmentIntensity=.85;
 const sun=new T.DirectionalLight('#ffdfab',3.7);sun.position.set(-120,75,-200);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-115;sun.shadow.camera.right=115;sun.shadow.camera.top=140;sun.shadow.camera.bottom=-110;sun.shadow.camera.far=700;sun.shadow.normalBias=.06;sun.shadow.bias=-.00015;scene.add(sun);
 // Ground, gravel, asphalt and paint share one surface and one depth value.
 const maskCanvas=document.createElement('canvas');maskCanvas.width=maskCanvas.height=2048;const ctx=maskCanvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,2048,2048);ctx.strokeStyle='#fff';ctx.lineWidth=18/768*2048;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();
 const track=new T.CatmullRomCurve3(trackPoints.map(([x,z])=>new T.Vector3(x,0,z)),true,'catmullrom',.35);
 for(let i=0;i<=640;i++){const q=track.getPointAt(i/640),x=(q.x/768+.5)*2048,y=(q.z/768+.5)*2048;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
 const mask=new T.CanvasTexture(maskCanvas);mask.flipY=false;mask.minFilter=T.LinearMipmapLinearFilter;
 const paint=wgslFn(`fn surfacePaint(p:vec3f,n:vec3f,base:vec3f,gravel:f32)->vec3f{
  let runway=select(0.0,1.0,abs(p.x)<8.0&&abs(p.z)<160.0);
  let apron=select(0.0,1.0,abs(p.x-26.0)<18.5&&abs(p.z-63.0)<47.5);
  let grain=fract(sin(dot(floor(p.xz*4.0),vec2f(12.9898,78.233)))*43758.5453);
  let strata=.92+.08*sin(p.y*1.25+sin(p.x*.017+p.z*.013)*2.5);
  let slope=1.0-smoothstep(.55,.95,n.y);
  var c=mix(base,vec3f(.25,.135,.075)*strata,slope*.6)*( .91+grain*.15 );
  c=mix(c,vec3f(.21,.15,.085)*(.85+grain*.3),gravel*.88);
  c=mix(c,vec3f(.040,.057,.048),max(runway,apron));
  let dash=(p.z+161.0)-floor((p.z+161.0)/14.0)*14.0;
  let line=runway*select(0.0,1.0,(abs(p.x)<.13&&dash<5.5)||abs(abs(p.x)-7.3)<.085);
  let taxiDash=(p.z-29.0)-floor((p.z-29.0)/18.0)*18.0;
  let taxi=apron*select(0.0,1.0,p.x>24.0&&p.x<36.0&&p.z>25.0&&p.z<104.0&&taxiDash<.15);
  let ring=abs(length(p.xz-vec2f(23.0,85.0))-4.08)<.08;
  return mix(c,vec3f(.53,.46,.24),max(max(line,taxi),select(0.0,1.0,ring)));
 }`);
 const groundMat=new T.MeshStandardNodeMaterial({roughness:.97});groundMat.colorNode=paint({p:positionWorld,n:normalWorld,base:attribute('color','vec3'),gravel:texture(mask,vec2(positionWorld.x.div(768).add(.5),positionWorld.z.div(768).add(.5))).r});
 terrainFinish(groundMat);const surfaces=addSurfaces(scene);
 const terrain=new T.Group();terrain.name='Terrain';terrain.userData={heightfieldResolution:128,workers:4};scene.add(terrain);
 const stream=new TerrainStream(terrain,groundMat),ready=stream.ready;
 const solids=[];const line=material('#b4ac88'),hangar=material('#6c7b76'),roof=material('#435554'),dark=material('#293d3d'),orange=material('#d59b47');
 for(const o of obstacles){const base=height(o.x,o.z);const b=box(scene,[o.w,o.h,o.d],[o.x,base+o.h/2,o.z],hangar);solids.push(b);
  box(scene,[o.w+.6,.28,o.d+.6],[o.x,base+o.h+.15,o.z],roof);
  const front=o.z+o.d/2+.04;box(scene,[o.w*.72,o.h*.64,.1],[o.x,base+o.h*.33,front],dark);
  for(let y=1;y<o.h*.65;y+=1.1)box(scene,[o.w*.7,.06,.14],[o.x,base+y,front+.1],roof);
  for(let x=-o.w/2+1;x<o.w/2;x+=4)box(scene,[.12,o.h,.14],[o.x+x,base+o.h/2,front],roof);
  box(scene,[o.w,.4,.2],[o.x,base+o.h*.77,front+.1],orange);
 }
 const tower=new T.Group();tower.position.set(-20,0,99);scene.add(tower);box(tower,[8,.5,7],[0,7.2,0],roof);box(tower,[7,3,6],[0,8.9,0],dark);for(let s of [-1,1])box(tower,[.08,1.4,5.5],[s*3.51,9.2,0],material('#a2c6bf',.5,.23));box(tower,[8,.3,7],[0,10.6,0],roof);segment(tower,[0,10.5,0],[0,20,0],.09,roof);segment(tower,[-2,17,0],[2,17,0],.05,roof);
 // Airstrip lights and wind indicators give a reference for speed and altitude.
 const lamp=new T.MeshBasicMaterial({color:'#ffce6e'});for(let z=-155;z<157;z+=18)for(let x of [-10,10]){cylinder(scene,.09,.09,.6,[x,.3,z],dark,5);box(scene,[.25,.08,.25],[x,.62,z],lamp);}
 for(let s of [-1,1]){segment(scene,[s*22,0,68],[s*22,7,68],.085,roof);const sock=new T.Mesh(new T.ConeGeometry(.5,2.6,8,1,true),orange);sock.rotation.z=-1.4;sock.position.set(s*22+1.3,6.8,68);scene.add(sock);}
 let seed=37;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rockmat=material('#62685c');for(let i=0;i<45;i++){const a=rand()*Math.PI*2,r=360+rand()*280,x=Math.cos(a)*r,z=Math.sin(a)*r;const rock=new T.Mesh(new T.IcosahedronGeometry(1,1),rockmat);rock.position.set(x,height(x,z)-1,z);rock.scale.set(3+rand()*8,2+rand()*7,3+rand()*9);rock.rotation.y=rand()*6;scene.add(rock);}
 // Simple industrial details, all original geometry.
 for(let i=0;i<18;i++){const x=i<9?-57:58,z=-29+(i%9)*2.3;const barrel=cylinder(scene,.5,.5,1.3,[x,height(x,z)+.65,z],orange,10);}
 scene.add(sun.target);
 return {solids,terrain,sun,ready,surfaces,stream,pad:null,update(pos){stream.update(pos.x,pos.z);sky.position.copy(pos);sun.position.set(pos.x-120,pos.y+100,pos.z-200);sun.target.position.copy(pos);}};
}
