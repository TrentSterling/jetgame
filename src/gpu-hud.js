import * as T from 'three/webgpu';
import {attribute,uv,vec3,wgslFn,fwidth,smoothstep} from 'three/tsl';
import {HUD_FONT,HUD_FONT_HEIGHT,normalizeHudText,hudTextWidth} from './gpu-hud-font.js';

// One bounded instanced mesh for every visible UI element, including text.
// Glyph strokes and shapes use analytic signed distances; only GPU fragments
// rasterize them. No atlas, DOM text, Canvas2D, SVG or additional canvas exists.
export const GPU_HUD_CAPACITY=12288;
export const GPU_HUD_MAX_HITS=16;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),finite=(n,f=0)=>Number.isFinite(n)?n:f;
const distanceLabel=n=>n>=1000?(n/1000).toFixed(1)+' KM':Math.round(Math.max(0,n))+' M';
const linear=hex=>{const color=new T.Color(hex);return Object.freeze([color.r,color.g,color.b]);};
export const HUD_COLORS=Object.freeze({ink:linear('#f7f1dc'),muted:linear('#a8babd'),amber:linear('#ffc46b'),cyan:linear('#7fe3db'),red:linear('#ff7966'),dark:linear('#071419'),panel:linear('#10242b'),edge:linear('#38545a')});
const fields={screen:'game',mode:'foot',modeLabel:'',health:100,shielded:false,ammo:32,ammoMax:32,ammoSuffix:'/ ∞',weapon:'CARBINE',speed:0,altitude:0,missiles:0,bombs:0,boost:1,boosting:false,boostLocked:false,reload:0,mission:'FIND SURVIVORS',missionDetail:'',action:'',actionKey:'',interactionProgress:0,message:'',hit:0,damage:0,kills:0,rescued:0,relays:0,scrap:0,respawnMode:'foot',respawnSeconds:0,ready:false,deployAvailable:false,keyboardOnly:false,progress:0,phase:'BUILDING BATTLEFIELD',error:'',saveStatus:'LOCAL EXPEDITION CHECKPOINTS',saveAvailable:true,continuing:false,muted:false,version:'0.9.0'};
const reticleFields={x:0,y:0};
const waypointFields={x:0,y:0,label:'SURVIVORS',distance:0,behind:false};
const aimFields={x:0,y:0,strength:0,locked:false};
const jetFields={commandX:0,commandY:0,noseX:0,noseY:0,limited:false,limitLabel:'',recovery:false,throttle:0};
const upgradeFields={id:'',key:'',name:'',level:0,cost:0,detail:'',available:false};
const fieldKeys=Object.keys(fields),upgradeKeys=Object.keys(upgradeFields);
const groups=Object.entries({reticle:reticleFields,waypoint:waypointFields,aim:aimFields,jet:jetFields}).map(([name,defaults])=>({name,defaults,keys:Object.keys(defaults)}));
const emptyInput=Object.freeze({});
const shapeDistance=wgslFn(`fn hudShapeDistance(p:vec2f,size:vec2f,corner:f32,border:f32)->f32{
 let halfSize=size*0.5;
 let radius=clamp(corner,0.0,min(halfSize.x,halfSize.y));
 let q=abs(p)-halfSize+vec2f(radius);
 let d=length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-radius;
 return select(d,abs(d)-border*0.5,border>0.0);
}`);

/**
 * CSS-pixel viewport. update(state) accepts optional primitive fields in
 * `fields` above, plus waypoint/aim screen NDC (+Y up), jet command offsets
 * (-1..1,+Y up), and at most three upgrades. Reuse/mutate state safely.
 * hitTest returns an action string or null; it never triggers game actions.
 * The caller renders the world first, then render(renderer) on that canvas.
 */
export class GpuHUD{
 constructor(){
  this.scene=new T.Scene();this.scene.name='GPU HUD';
  this.camera=new T.OrthographicCamera(0,1,0,1,-1,1);this.camera.position.z=.5;
  this.geometry=new T.InstancedBufferGeometry();
  this.geometry.setAttribute('position',new T.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));
  this.geometry.setAttribute('normal',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],3));
  this.geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));this.geometry.setIndex([0,1,2,0,2,3]);
  this.rect=new T.InstancedBufferAttribute(new Float32Array(GPU_HUD_CAPACITY*4),4).setUsage(T.DynamicDrawUsage);
  this.rotation=new T.InstancedBufferAttribute(new Float32Array(GPU_HUD_CAPACITY*2),2).setUsage(T.DynamicDrawUsage);
  this.shape=new T.InstancedBufferAttribute(new Float32Array(GPU_HUD_CAPACITY*2),2).setUsage(T.DynamicDrawUsage);
  this.ink=new T.InstancedBufferAttribute(new Float32Array(GPU_HUD_CAPACITY*4),4).setUsage(T.DynamicDrawUsage);
  this.geometry.setAttribute('hudRect',this.rect);this.geometry.setAttribute('hudRotation',this.rotation);this.geometry.setAttribute('hudShape',this.shape);this.geometry.setAttribute('hudInk',this.ink);
  const rect=attribute('hudRect','vec4'),rotation=attribute('hudRotation','vec2'),shape=attribute('hudShape','vec2'),ink=attribute('hudInk','vec4');
  const local=uv().sub(.5).mul(rect.zw.add(shape.y).add(5));
  const distance=shapeDistance(local,rect.zw,shape.x,shape.y),aa=fwidth(distance).max(.5);
  this.material=new T.MeshBasicNodeMaterial({transparent:true,depthTest:false,depthWrite:false,fog:false,toneMapped:false,side:T.DoubleSide,forceSinglePass:true});
  this.material.positionNode=vec3(rect.x.add(local.x.mul(rotation.x).sub(local.y.mul(rotation.y))),rect.y.add(local.x.mul(rotation.y).add(local.y.mul(rotation.x))),0);
  this.material.colorNode=ink.rgb;this.material.opacityNode=smoothstep(aa.negate(),aa,distance).oneMinus().mul(ink.a);
  this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.name='GPU glyphs and HUD shapes';this.mesh.frustumCulled=false;this.mesh.renderOrder=10000;this.scene.add(this.mesh);
  this.state={...fields,reticle:{...reticleFields},waypoint:{...waypointFields},aim:{...aimFields},jet:{...jetFields},upgrades:Array.from({length:3},()=>({...upgradeFields})),reticleVisible:false,waypointVisible:false,aimVisible:false,jetVisible:false,upgradeCount:0};
  this.regions=Array.from({length:GPU_HUD_MAX_HITS},()=>({x:0,y:0,w:0,h:0,action:'',disabled:false}));
  this.texts=Array.from({length:64},()=>({text:'',x:0,y:0,width:0,height:0}));
  this.points={reticle:{x:0,y:0,visible:false},aim:{x:0,y:0,visible:false},command:{x:0,y:0,visible:false},nose:{x:0,y:0,visible:false},waypoint:{x:0,y:0,visible:false}};
  this.width=1;this.height=1;this.scale=1;this.count=0;this.hitCount=0;this.textCount=0;this.glyphCount=0;this.hover=null;this.focus=null;this.rebuilds=0;this.dropped=0;this.dirty=true;this.disposed=false;
  this.missionMode='';this.missionY=-107;
  this.resize(1280,720);
 }
 resize(width,height){
  if(this.disposed)return false;
  const w=Math.max(1,finite(width,1)),h=Math.max(1,finite(height,1));if(w===this.width&&h===this.height)return false;
  this.width=w;this.height=h;
  this.cx=w/2;this.cy=h/2;this.camera.right=w;this.camera.bottom=h;this.camera.updateProjectionMatrix();this.dirty=true;this._build();return true;
 }
 update(input=emptyInput){
  if(this.disposed)return false;let changed=false;const state=this.state;
  for(const key of fieldKeys){const value=input[key]??fields[key];if(!Object.is(value,state[key])){state[key]=value;changed=true;}}
  for(const {name,defaults,keys} of groups){
   const source=input[name],visible=source!=null&&source!==false,key=name+'Visible';if(state[key]!==visible){state[key]=visible;changed=true;}
   for(const field of keys){const value=source?.[field]??defaults[field];if(!Object.is(state[name][field],value)){state[name][field]=value;changed=true;}}
  }
  const upgrades=input.upgrades,count=Math.min(3,upgrades?.length||0);if(count!==state.upgradeCount){state.upgradeCount=count;changed=true;}
  for(let i=0;i<count;i++)for(const key of upgradeKeys){const value=upgrades[i][key]??upgradeFields[key];if(!Object.is(state.upgrades[i][key],value)){state.upgrades[i][key]=value;changed=true;}}
  if(changed)this.dirty=true;if(this.dirty)this._build();return changed;
 }
 setPointer(x,y){if(this.disposed)return false;const hover=this.hitTest(x,y);if(hover===this.hover)return false;this.hover=hover;this.dirty=true;this._build();return true;}
 setFocus(action){
  if(this.disposed||this.focus===action&&this.hover===null)return false;
  if(action!=null){let found=false;for(let i=0;i<this.hitCount;i++)if(this.regions[i].action===action&&!this.regions[i].disabled){found=true;break;}if(!found)return false;}
  this.focus=action;this.hover=null;this.dirty=true;this._build();return true;
 }
 hitTest(x,y){
  if(this.disposed||!Number.isFinite(x)||!Number.isFinite(y))return null;
  for(let i=this.hitCount-1;i>=0;i--){const r=this.regions[i];if(!r.disabled&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return r.action;}
  return null;
 }
 render(renderer){
  if(this.disposed)return;if(this.dirty)this._build();const autoClear=renderer.autoClear;
  try{renderer.autoClear=false;renderer.render(this.scene,this.camera);}finally{renderer.autoClear=autoClear;}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.hitCount=0;this.geometry.dispose();this.material.dispose();this.scene.remove(this.mesh);}
 report(){return {drawCalls:1,instances:this.count,glyphs:this.glyphCount,capacity:GPU_HUD_CAPACITY,dropped:this.dropped,rebuilds:this.rebuilds,hitRegionCount:this.hitCount,hitRegions:this.regions.slice(0,this.hitCount).map(r=>({...r})),text:this.texts.slice(0,this.textCount).map(t=>({...t})),points:Object.fromEntries(Object.entries(this.points).map(([key,p])=>[key,{...p}])),hover:this.hover,focus:this.focus,width:this.width,height:this.height,screen:this.state.screen,state:{...this.state,reticle:{...this.state.reticle},waypoint:{...this.state.waypoint},aim:{...this.state.aim},jet:{...this.state.jet},upgrades:this.state.upgrades.slice(0,this.state.upgradeCount).map(u=>({...u}))}};}
 _point(name,x,y){const p=this.points[name];p.x=this.cx+x*this.scale;p.y=this.cy+y*this.scale;p.visible=true;}
 _shape(x,y,w,h,color=HUD_COLORS.ink,alpha=1,radius=0,border=0,cos=1,sin=0){
  if(alpha<=0||w<=0||h<=0)return;if(this.count>=GPU_HUD_CAPACITY){this.dropped++;return;}
  const i=this.count++,j=i*4,k=i*2,r=this.rect.array,a=this.ink.array,s=this.shape.array,rotation=this.rotation.array;
  r[j]=x;r[j+1]=y;r[j+2]=w;r[j+3]=h;a[j]=color[0];a[j+1]=color[1];a[j+2]=color[2];a[j+3]=clamp(alpha,0,1);s[k]=radius;s[k+1]=border;rotation[k]=cos;rotation[k+1]=sin;
 }
 _rect(x,y,w,h,color,alpha=1,radius=0,border=0){const s=this.scale;this._shape(this.cx+x*s,this.cy+y*s,w*s,h*s,color,alpha,radius*s,border*s);}
 _line(x1,y1,x2,y2,width,color,alpha=1){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),s=this.scale;this._shape(this.cx+(x1+x2)*s/2,this.cy+(y1+y2)*s/2,(len+width)*s,width*s,color,alpha,width*s/2,0,len?dx/len:1,len?dy/len:0);}
 _ring(x,y,r,color,alpha=1,width=1.2){this._rect(x,y,r*2,r*2,color,alpha,r,width);}
 _diamond(x,y,r,color,alpha=1,width=1.4){this._line(x,y-r,x+r,y,width,color,alpha);this._line(x+r,y,x,y+r,width,color,alpha);this._line(x,y+r,x-r,y,width,color,alpha);this._line(x-r,y,x,y-r,width,color,alpha);}
 _brackets(x,y,size,color,alpha=1){const a=size/2,t=5;for(const side of [-1,1]){this._line(x+side*a,y-a,x+side*(a-t),y-a,1.5,color,alpha);this._line(x+side*a,y-a,x+side*a,y-a+t,1.5,color,alpha);this._line(x+side*a,y+a,x+side*(a-t),y+a,1.5,color,alpha);this._line(x+side*a,y+a,x+side*a,y+a-t,1.5,color,alpha);}}
 _text(value,x,y,size=16,color=HUD_COLORS.ink,align='center',maxWidth=600,alpha=1,shadow=this.state.screen==='game'){
  let text=normalizeHudText(value),width=hudTextWidth(text,size);if(width>maxWidth){const budget=(maxWidth-hudTextWidth('...',size))*HUD_FONT_HEIGHT/size;let used=0,end=0;while(end<text.length&&used+(HUD_FONT[text[end]]||HUD_FONT['?']).advance<=budget){used+=(HUD_FONT[text[end]]||HUD_FONT['?']).advance;end++;}text=text.slice(0,end)+'...';width=hudTextWidth(text,size);}
  const left=x-(align==='center'?width/2:align==='right'?width:0),unit=size/HUD_FONT_HEIGHT,weight=Math.max(.8,size*.078);
  if(this.textCount<this.texts.length){const t=this.texts[this.textCount++];t.text=text;t.x=this.cx+left*this.scale;t.y=this.cy+y*this.scale;t.width=width*this.scale;t.height=size*this.scale;}
  for(let pass=shadow?0:1;pass<2;pass++){
   let cursor=left;const c=pass?color:HUD_COLORS.dark,opacity=pass?alpha:.9*alpha,offset=pass?0:1,thickness=pass?weight:weight+1.3;
   for(let i=0;i<text.length;i++){
    const glyph=HUD_FONT[text[i]]||HUD_FONT['?'],stroke=glyph.strokes;
    if(pass===1&&stroke.length)this.glyphCount++;
    for(let n=0;n<stroke.length;n+=4)this._line(cursor+stroke[n]*unit,y+stroke[n+1]*unit+offset,cursor+stroke[n+2]*unit,y+stroke[n+3]*unit+offset,thickness,c,opacity);
    cursor+=glyph.advance*unit;
   }
  }
  return width;
 }
 _bar(x,y,width,value,color,alpha=1){this._rect(x,y,width,3,HUD_COLORS.edge,alpha*.8,1.5);const fill=clamp(finite(value),0,1)*width;if(fill>0)this._rect(x-(width-fill)/2,y,fill,3,color,alpha,1.5);}
 _button(action,label,x,y,w=230,h=46,options={}){
  const disabled=!!options.disabled,active=(!options.passive&&action===(this.hover||this.focus))||options.active,accent=options.accent||HUD_COLORS.cyan;
  this._rect(x,y,w,h,active?accent:HUD_COLORS.panel,active?.15:.8,5);this._rect(x,y,w,h,disabled?HUD_COLORS.edge:active?accent:HUD_COLORS.edge,disabled?.5:1,5,active?1.5:1);
  if(active)this._rect(x-w/2+2,y,3,h-16,accent,1,1.5);
  this._text(label,x,y-8,16,disabled?HUD_COLORS.muted:active?accent:HUD_COLORS.ink,'center',w-28,disabled?.5:1,false);
  if(!options.passive&&this.hitCount<GPU_HUD_MAX_HITS){const r=this.regions[this.hitCount++],s=this.scale;r.x=this.cx+(x-w/2)*s;r.y=this.cy+(y-h/2)*s;r.w=w*s;r.h=h*s;r.action=action;r.disabled=disabled;}
 }
 _build(){
  this.count=0;this.hitCount=0;this.textCount=0;this.glyphCount=0;this.dropped=0;this.dirty=false;this.rebuilds++;const state=this.state;
  this.points.reticle.visible=this.points.aim.visible=this.points.command.visible=this.points.nose.visible=this.points.waypoint.visible=false;
  this.scale=state.screen==='game'?Math.max(.2,Math.min(this.width/510,this.height/340,1.1)):Math.max(.2,Math.min(this.width/680,this.height/700,1.4));
  if(state.screen==='game')this._game();else this._menu();
  this.geometry.instanceCount=this.count;
  for(const a of [this.rect,this.rotation,this.shape,this.ink]){a.clearUpdateRanges();a.addUpdateRange(0,this.count*a.itemSize);a.needsUpdate=true;}
 }
 _game(){
  const s=this.state,c=HUD_COLORS,isJet=s.mode==='jet',isFoot=s.mode==='foot',health=clamp(finite(s.health,100),0,100),hpColor=s.shielded?c.cyan:health<30?c.red:c.amber;
  // Keep the sight picture open. Vitals sit just below it, mission above it.
  const rx=clamp(finite(s.reticle.x),-.95,.95)*this.width/(2*this.scale),ry=-clamp(finite(s.reticle.y),-.95,.95)*this.height/(2*this.scale);
  this._point('reticle',rx,ry);
  this._ring(rx,ry,10,c.dark,.8,3);this._ring(rx,ry,10,c.ink,.36,1);this._rect(rx,ry,2.4,2.4,c.ink,1,1.2);
  for(const sign of [-1,1])this._line(rx+sign*16,ry,rx+sign*21,ry,1.2,c.ink,.8);
  if(s.hit>0){const a=clamp(finite(s.hit),0,1);for(const x of [-1,1])for(const y of [-1,1])this._line(rx+x*13,ry+y*13,rx+x*20,ry+y*20,2,c.amber,a);}
  if(s.damage>0){const a=clamp(finite(s.damage),0,1);this._brackets(rx,ry,65,c.red,a*.85);}
  const warning=isJet&&s.jetVisible?(s.jet.recovery?'LOW AIRSPEED  ·  RELEASE BRAKE':s.jet.limited?(s.jet.limitLabel||'PITCH LIMIT')+'  ·  C TO CENTER':''):'';
  this._missionBand(rx,ry);
  this._text(s.mission,0,this.missionY,15,c.ink,'center',390);if(warning||s.message||s.missionDetail)this._text(warning||s.message||s.missionDetail,0,this.missionY+24,11,warning||s.message?c.amber:c.muted,'center',365);
  this._text(s.shielded?'ARMORED':isFoot?'HEALTH':'HULL',-108,38,11,hpColor,'center',100);this._text(Math.ceil(health),-108,58,26,c.ink,'center',100);this._bar(-108,94,80,health/100,hpColor);
  const reloading=finite(s.reload)>0,weapon=s.weapon||(isFoot?'CARBINE':isJet?'VIPER':'TRANSPORT');
  this._text(reloading?'RELOADING':weapon,108,38,11,reloading?c.cyan:c.muted,'center',135);
  this._text(reloading?'--':isFoot?Math.max(0,Math.floor(finite(s.ammo))):Math.round(Math.abs(finite(s.speed))),108,58,26,c.ink,'center',100);
  if(reloading)this._bar(108,94,80,s.reload,c.cyan);else if(isFoot)this._text(s.ammoSuffix||'/ '+s.ammoMax,108,93,10,c.muted,'center',85);else this._text('KM/H',108,93,10,c.muted,'center',85);
  const resource=clamp(finite(s.boost,1),0,1),resourceColor=s.boostLocked?c.amber:s.boosting?c.cyan:c.muted;
  this._bar(0,79,64,resource,resourceColor);this._text(isFoot?'STAMINA':s.boostLocked?'RELEASE SHIFT':s.boosting?'BOOST':'SHIFT',0,93,9,resourceColor,'center',105);
  if(!isFoot)this._text('RMB '+finite(s.missiles)+(isJet?' / SPACE '+finite(s.bombs):' MISSILES'),0,115,11,c.muted,'center',270);
  if(isJet)this._text(Math.round(finite(s.altitude))+' M',0,57,10,c.muted,'center',90);
  if(s.action){const y=isFoot?119:141;this._text((s.actionKey?s.actionKey+'  ':'')+s.action,0,y,13,c.cyan,'center',390);if(s.interactionProgress>0)this._bar(0,y+22,150,s.interactionProgress,c.cyan);}else if(!s.message)this._text('H CONTROLS  /  ESC PAUSE',0,isFoot?119:141,9,c.muted,'center',300,.7);
  if(s.waypointVisible)this._waypoint();if(s.aimVisible)this._aim();if(isJet&&s.jetVisible)this._jet();
 }
 _missionBand(rx,ry){
  const state=this.state,base=state.mode==='foot'?-107:-167;let ceiling=Math.abs(rx)<230?ry-40:Infinity;
  if(state.aimVisible&&(state.aim.locked||state.aim.strength>0)){
   const x=clamp(finite(state.aim.x),-.95,.95)*this.width/(2*this.scale),y=-clamp(finite(state.aim.y),-.95,.95)*this.height/(2*this.scale);
   if(Math.abs(x)<230)ceiling=Math.min(ceiling,y-40);
  }
  // 48-unit steps with a 14-unit return margin keep small camera movement
  // from making mission text follow or oscillate around the physical sight.
  const wanted=base-48*Math.max(0,Math.ceil((base+35-ceiling)/48));
  if(this.missionMode!==state.mode){this.missionMode=state.mode;this.missionY=wanted;}
  else if(wanted<this.missionY||wanted>this.missionY&&wanted+35<ceiling-14)this.missionY=wanted;
  this.missionY=Math.max(-this.cy/this.scale+18,this.missionY);
 }
 _waypoint(){
  const p=this.state.waypoint,c=HUD_COLORS;let x=finite(p.x)*this.width/(2*this.scale),y=-finite(p.y)*this.height/(2*this.scale);if(p.behind){x=-x;y=-y;if(Math.hypot(x,y)<1)x=1;}
  const length=Math.hypot(x,y),limit=60;if(length>limit){x*=limit/length;y*=limit/length;}if(Math.hypot(x,y)<34){x=-55;y=-22;}y=Math.min(20,y);
  this._point('waypoint',x,y);
  this._diamond(x,y,4,c.amber,.95,1.3);this._text(distanceLabel(finite(p.distance)),x+(x>=0?12:-12),y-5,9,c.amber,x>=0?'left':'right',80);
 }
 _aim(){
  const a=this.state.aim,c=HUD_COLORS,strength=clamp(finite(a.strength),0,1);if(strength<=0&&!a.locked)return;
  const x=clamp(finite(a.x),-.95,.95)*this.width/(2*this.scale),y=-clamp(finite(a.y),-.95,.95)*this.height/(2*this.scale);this._point('aim',x,y);
  this._brackets(x,y,a.locked?28:34,c.cyan,a.locked?.95:.3+strength*.45);
  if(a.locked)this._text('LOCK',x,y-28,9,c.cyan,'center',55,.95);
 }
 _jet(){
  const p=this.state.jet,c=HUD_COLORS,x=clamp(finite(p.commandX),-1,1)*44,y=-clamp(finite(p.commandY),-1,1)*44;
  this._point('command',x,y);
  const color=p.limited?c.amber:c.cyan;this._line(0,0,x,y,1,color,.38);this._diamond(x,y,6,color,.95,1.4);
  const nx=clamp(finite(p.noseX),-.95,.95)*this.width/(2*this.scale),ny=-clamp(finite(p.noseY),-.95,.95)*this.height/(2*this.scale);this._point('nose',nx,ny);
  this._line(nx-9,ny,nx-4,ny,1.5,c.ink,.92);this._line(nx+4,ny,nx+9,ny,1.5,c.ink,.92);this._line(nx,ny-4,nx,ny-8,1.5,c.ink,.92);
 }
 _menu(){
  const s=this.state,c=HUD_COLORS,screen=s.screen;
  this._shape(this.width/2,this.height/2,this.width,this.height,c.dark,.86);
  this._rect(0,0,600,610,c.panel,.77,12);this._rect(0,0,600,610,c.edge,.65,12,1);
  this._line(-260,-268,-232,-268,3,c.amber);this._text('JET GAME',-216,-278,18,c.ink,'left',250);this._text(screen==='game'?'EXPEDITION':screen,260,-275,11,c.muted,'right',160);
  if(screen==='help'){this._help();return;}if(screen==='upgrades'){this._upgrades();return;}if(screen==='death'){this._death();return;}
  if(screen==='loading'||screen==='error'){this._loading();return;}
  this._text(screen==='pause'?'TAKE A BREATH.':'BRING THEM HOME.',0,-185,29,c.ink,'center',510);
  this._text(screen==='pause'?'THE EXPEDITION IS PAUSED':'FIND SURVIVORS. CLEAR A WAY OUT.',0,-134,13,c.muted,'center',500);
  if(screen==='pause'){
   this._text(Math.floor(finite(s.kills))+' CLEARED  /  '+Math.floor(finite(s.rescued))+' RESCUED  /  '+Math.floor(finite(s.relays))+' RELAYS',0,-83,12,c.amber,'center',500);
   this._button('resume','RESUME',0,-24,330,50,{accent:c.cyan});
  }else this._button('play',s.ready?s.continuing?'CONTINUE EXPEDITION':'ENTER BATTLEFIELD':'PREPARING BATTLEFIELD',0,-24,330,50,{disabled:!s.ready,accent:c.cyan});
  this._button('help','CONTROLS',-129,47,246,44);this._button('upgrades','UPGRADES',129,47,246,44);
  this._button('save','SAVE EXPEDITION',-129,108,246,44,{disabled:!s.ready||!s.saveAvailable});this._button('mute',s.muted?'SOUND OFF':'SOUND ON',129,108,246,44);
  this._text(s.saveStatus,0,155,11,c.muted,'center',500);
  this._line(-230,198,230,198,1,c.edge,.7);this._text('WASD MOVE  /  MOUSE AIM  /  E ENTER',0,221,12,c.muted,'center',490);
  this._text('H CONTROLS  ·  ESC PAUSE',0,249,10,c.muted,'center',450);
 }
 _loading(){
  const s=this.state,c=HUD_COLORS,failed=s.screen==='error';
  this._text(failed?'SYSTEM INTERRUPTED':'PREPARING EXPEDITION',0,-104,25,failed?c.amber:c.ink,'center',510);
  this._text(failed?'RELOAD TO RETURN TO THE BATTLEFIELD':s.phase,0,-50,13,c.muted,'center',510);
  if(failed){this._text(s.error||'GPU CONNECTION UNAVAILABLE',0,-12,12,c.amber,'center',490);this._button('reload','RELOAD',0,70,300,50,{accent:c.amber});}
  else{this._bar(0,9,360,clamp(finite(s.progress),0,1),c.cyan);this._text(Math.round(clamp(finite(s.progress),0,1)*100)+'%',0,33,14,c.cyan,'center',100);}
  this._text('JET GAME  /  EXPEDITIONS',0,224,11,c.muted,'center',500);
 }
 _help(){
  const c=HUD_COLORS;this._text('FIELD CONTROLS',0,-225,24,c.ink,'center',500);
  const rows=[['WASD','MOVE / DRIVE / THROTTLE'],['MOUSE','AIM / STEER JET'],['LMB','FIRE'],['RMB','SHOVE / VEHICLE MISSILES'],['SHIFT','SPRINT / BOOST / CHUTE DIVE'],['SPACE','JUMP / HANDBRAKE / BOMB'],['C / CTRL','CROUCH / SLIDE'],['JET: C','CENTER FLIGHT COMMAND'],['E','ENTER / EXIT / EJECT'],['F HOLD','REPAIR SURVIVOR RADIO'],['R','RELOAD / DEPLOY'],['Z / X / V','RIFLE / TORQUE / BOMB UPGRADE']];
  for(let i=0;i<rows.length;i++){const y=-172+i*27;this._text(rows[i][0],-249,y,11,c.cyan,'left',125);this._text(rows[i][1],-106,y,12,c.ink,'left',360);}
  this._text('IN AIR: SPACE OPENS OR CUTS THE PARACHUTE',0,168,11,c.muted,'center',500);this._text('AFTER DEFEAT: 1 / 2 / 3 CHOOSES YOUR INSERTION',0,192,10,c.muted,'center',510);
  this._button('back','BACK',0,251,220,42);
 }
 _upgrades(){
  const s=this.state,c=HUD_COLORS;this._text('BUILD YOUR EDGE',0,-224,25,c.ink,'center',500);this._text(Math.floor(finite(s.scrap))+' SCRAP',0,-180,14,c.amber,'center',400);
  if(!s.upgradeCount){this._text('SALVAGE THE HORDE TO EARN UPGRADES',0,-30,15,c.muted,'center',500);}
  for(let i=0;i<s.upgradeCount;i++){
   const u=s.upgrades[i],y=-112+i*108,max=finite(u.level)>=3;
   this._rect(0,y+15,522,94,c.dark,.6,5);this._text(u.name,-242,y-18,17,c.ink,'left',310);this._text('LEVEL '+Math.min(3,Math.max(0,finite(u.level)))+' / 3',-242,y+8,10,c.amber,'left',265);this._text(u.detail,-242,y+31,11,c.muted,'left',315);
   this._button('upgrade:'+u.id,max?'MAX':u.key+'  '+u.cost,183,y+10,120,46,{disabled:max||!u.available,accent:c.amber});
  }
  this._button('back','BACK',0,251,220,42);
 }
 _death(){
  const s=this.state,c=HUD_COLORS;this._text('BACK INTO THE FIGHT.',0,-196,27,c.ink,'center',510);this._text(s.keyboardOnly?'NUMBER KEYS CHOOSE  /  R DEPLOY':'CHOOSE YOUR INSERTION',0,-147,13,c.muted,'center',500);
  this._button('respawn:foot','1  AIRDROP',-174,-62,164,68,{active:s.respawnMode==='foot',accent:c.amber,passive:s.keyboardOnly});this._button('respawn:car','2  BUGGY',0,-62,164,68,{active:s.respawnMode==='car',accent:c.amber,passive:s.keyboardOnly});this._button('respawn:jet','3  VIPER',174,-62,164,68,{active:s.respawnMode==='jet',accent:c.amber,passive:s.keyboardOnly});
  this._text('REINFORCEMENTS IN '+Math.max(0,finite(s.respawnSeconds)).toFixed(1),0,9,14,c.muted,'center',480);
  this._button('deploy','R  DEPLOY',0,80,330,52,{disabled:!s.ready||!s.deployAvailable,accent:c.cyan,passive:s.keyboardOnly});this._text('YOUR EXPEDITION CONTINUES.',0,159,13,c.ink,'center',500);
  this._text(Math.floor(finite(s.rescued))+' RESCUED  /  '+Math.floor(finite(s.relays))+' RELAYS',0,190,12,c.amber,'center',500);
 }
}
