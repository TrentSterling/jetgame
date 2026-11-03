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
const fields={screen:'game',mode:'foot',modeLabel:'',health:100,shielded:false,ammo:32,ammoMax:32,ammoSuffix:'/ ∞',weapon:'CARBINE',speed:0,altitude:0,missiles:0,bombs:0,missileWarhead:'standard',boost:1,boosting:false,boostLocked:false,reload:0,mission:'FIND SURVIVORS',missionDetail:'',action:'',actionKey:'',seatAction:'',interactionProgress:0,message:'',hit:0,damage:0,kills:0,rescued:0,relays:0,scrap:0,respawnMode:'foot',respawnSeconds:0,ready:false,deployAvailable:false,keyboardOnly:false,progress:0,phase:'BUILDING BATTLEFIELD',phaseDetail:'Preparing the world, vehicles and survivors before you enter.',phaseIndex:0,phaseCount:0,sceneFade:0,error:'',saveStatus:'LOCAL EXPEDITION CHECKPOINTS',saveAvailable:true,continuing:false,muted:false,version:'0.9.0'};
const reticleFields={x:0,y:0};
const waypointFields={x:0,y:0,label:'SURVIVORS',distance:0,behind:false,inView:null,bearing:0,direction:'',turnDegrees:0};
const aimFields={x:0,y:0,strength:0,locked:false};
const jetFields={commandX:0,commandY:0,noseX:0,noseY:0,limited:false,limitLabel:'',recovery:false,throttle:0};
const upgradeFields={id:'',key:'',name:'',level:0,cost:0,detail:'',available:false,equipped:false};
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
  * (-1..1,+Y up), and at most four upgrades. Reuse/mutate state safely.
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
  this.state={...fields,reticle:{...reticleFields},waypoint:{...waypointFields},aim:{...aimFields},jet:{...jetFields},upgrades:Array.from({length:4},()=>({...upgradeFields})),reticleVisible:false,waypointVisible:false,aimVisible:false,jetVisible:false,upgradeCount:0};
  this.regions=Array.from({length:GPU_HUD_MAX_HITS},()=>({x:0,y:0,w:0,h:0,action:'',disabled:false}));
  this.texts=Array.from({length:64},()=>({text:'',x:0,y:0,width:0,height:0}));
  this.points={reticle:{x:0,y:0,visible:false},aim:{x:0,y:0,visible:false},command:{x:0,y:0,visible:false},nose:{x:0,y:0,visible:false},waypoint:{x:0,y:0,visible:false},objectiveCue:{x:0,y:0,visible:false}};
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
  const upgrades=input.upgrades,count=Math.min(4,upgrades?.length||0);if(count!==state.upgradeCount){state.upgradeCount=count;changed=true;}
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
  const left=x-(align==='center'?width/2:align==='right'?width:0),unit=size/HUD_FONT_HEIGHT,weight=Math.max(1.05,size*.10);
  if(this.textCount<this.texts.length){const t=this.texts[this.textCount++];t.text=text;t.x=this.cx+left*this.scale;t.y=this.cy+y*this.scale;t.width=width*this.scale;t.height=size*this.scale;}
  for(let pass=shadow?0:1;pass<2;pass++){
   let cursor=left;const c=pass?color:HUD_COLORS.dark,opacity=pass?alpha:.92*alpha,offset=0,thickness=pass?weight:weight+1.2;
   for(let i=0;i<text.length;i++){
    const glyph=HUD_FONT[text[i]]||HUD_FONT['?'],stroke=glyph.strokes;
    if(pass===1&&stroke.length)this.glyphCount++;
    for(let n=0;n<stroke.length;n+=4)this._line(cursor+stroke[n]*unit,y+stroke[n+1]*unit+offset,cursor+stroke[n+2]*unit,y+stroke[n+3]*unit+offset,thickness,c,opacity);
    cursor+=glyph.advance*unit;
   }
  }
  return width;
 }
 _paragraph(value,x,y,size,color,maxWidth,lineHeight=22,maxLines=3){
  const words=normalizeHudText(value).split(/\s+/),lines=[];let line='';
  for(const word of words){const next=line?line+' '+word:word;if(line&&hudTextWidth(next,size)>maxWidth){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  for(let i=0;i<Math.min(maxLines,lines.length);i++)this._text(lines[i]+(i===maxLines-1&&lines.length>maxLines?'...':''),x,y+i*lineHeight,size,color,'center',maxWidth);
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
  for(const point of Object.values(this.points))point.visible=false;
  this.scale=state.screen==='game'?Math.max(.2,Math.min(this.width/510,this.height/340,1.1)):Math.max(.2,Math.min(this.width/680,this.height/700,1.4));
  if(state.screen==='game')this._game();else this._menu();
  if((state.screen==='game'||state.screen==='death')&&state.sceneFade>0)this._shape(this.width/2,this.height/2,this.width,this.height,HUD_COLORS.dark,clamp(finite(state.sceneFade),0,1));
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
  if(!isFoot)this._text('RMB '+finite(s.missiles)+(s.missileWarhead==='cluster'?' CLUSTER':' MISSILES')+(isJet?' / SPACE '+finite(s.bombs):''),0,115,11,c.muted,'center',290);
  if(isJet)this._text(Math.round(finite(s.altitude))+' M',0,57,10,c.muted,'center',90);
  const edge=s.waypointVisible?this._waypointEdge():null,actionRows=[];
  if(s.aimVisible)this._aim();if(isJet&&s.jetVisible)this._jet();
  if(s.action)this._actionRow((s.actionKey?s.actionKey+'  ':'')+s.action,isFoot?119:141,13,c.cyan,390,edge,actionRows,s.interactionProgress);
  else if(!s.message){
   const hint='H CONTROLS  /  ESC PAUSE',y=isFoot?119:141,w=hudTextWidth(hint,9);
   // This optional reminder yields to a real objective at the compact edge.
   if(!edge||edge.right<-w/2-2||edge.left>w/2+2||edge.bottom<y-2||edge.top>y+11)this._text(hint,0,y,9,c.muted,'center',300,.7);
  }
  if(s.seatAction)this._actionRow('Q  '+s.seatAction,isFoot?145:167,11,c.amber,350,edge,actionRows);
  if(s.waypointVisible)this._waypoint(edge,actionRows);
 }
 _missionBand(rx,ry){
  const state=this.state,base=state.mode==='foot'?-107:-167,bottom=35,protectedY=Math.abs(rx)<230?[ry]:[];let ceiling=Math.abs(rx)<230?ry-40:Infinity;
  if(state.aimVisible&&(state.aim.locked||state.aim.strength>0)){
   const x=clamp(finite(state.aim.x),-.95,.95)*this.width/(2*this.scale),y=-clamp(finite(state.aim.y),-.95,.95)*this.height/(2*this.scale);
   if(Math.abs(x)<230){ceiling=Math.min(ceiling,y-40);protectedY.push(y);}
  }
  // 48-unit steps with a 14-unit return margin keep small camera movement
  // from making mission text follow or oscillate around the physical sight.
  let wanted=base-48*Math.max(0,Math.ceil((base+bottom-ceiling)/48));
  const top=-this.cy/this.scale+18,below=wanted<top;
  if(below){
   // A steep aircraft sight can occupy the top margin on compact screens.
   // Find the first clear band below it instead of clamping text onto the aim.
   wanted=top;for(const y of protectedY.sort((a,b)=>a-b))if(wanted+bottom>y-40&&wanted<y+40)wanted=y+40;
  }
  if(this.missionMode!==state.mode||below){this.missionMode=state.mode;this.missionY=wanted;}
  else if(wanted<this.missionY||wanted>this.missionY&&wanted+bottom<ceiling-14)this.missionY=wanted;
  this.missionY=Math.max(top,this.missionY);
 }
 _waypointEdge(){
  const p=this.state.waypoint,inView=p.inView==null?!p.behind&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1:p.inView;if(inView)return null;
  const halfW=this.cx/this.scale,halfH=this.cy/this.scale;
  let dx=p.behind?Math.sin(finite(p.bearing,Math.PI)):finite(p.x)*halfW,dy=p.behind?-Math.cos(finite(p.bearing,Math.PI)):-finite(p.y)*halfH;
  if(Math.hypot(dx,dy)<.01){dx=p.direction==='left'?-1:p.direction==='right'?1:0;dy=dx?0:p.behind||p.direction==='below'?1:-1;}
  const mx=Math.max(8,halfW-26),my=Math.max(8,halfH-30),k=1/Math.max(Math.abs(dx)/mx,Math.abs(dy)/my),x=dx*k,y=dy*k,n=Math.hypot(dx,dy),ux=dx/n,uy=dy/n;
  // Include the diamond outline and outward chevron, with their stroke fringe.
  return {halfW,halfH,x,y,ux,uy,left:Math.min(x-10,x+ux*11-Math.abs(uy)*4-2,x+ux*16-2),right:Math.max(x+10,x+ux*11+Math.abs(uy)*4+2,x+ux*16+2),top:Math.min(y-10,y+uy*11-Math.abs(ux)*4-2,y+uy*16-2),bottom:Math.max(y+10,y+uy*11+Math.abs(ux)*4+2,y+uy*16+2)};
 }
 _edgeBoxClear(cx,cy,w,h,edge,actionRows){
  const l=cx-w/2,r=cx+w/2,t=cy-h/2,b=cy+h/2,{halfW,halfH}=edge;
  if(l<-halfW+8||r>halfW-8||t<-halfH+8||b>halfH-8)return false;
  const hits=(left,top,right,bottom,pad=4)=>l<right+pad&&r>left-pad&&t<bottom+pad&&b>top-pad;
  if(hits(edge.left,edge.top,edge.right,edge.bottom))return false;
  for(let i=0;i<this.textCount;i++){const text=this.texts[i],x=(text.x-this.cx)/this.scale,y=(text.y-this.cy)/this.scale;if(hits(x,y,x+text.width/this.scale,y+text.height/this.scale,6))return false;}
  for(const row of actionRows)if(hits(row.x-row.w/2,row.y,row.x+row.w/2,row.y+row.h))return false;
  for(const [x,y,width] of [[-108,94,80],[108,94,80],[0,79,64]])if(hits(x-width/2,y-2,x+width/2,y+2))return false;
  for(const name of ['reticle','aim','command','nose']){const point=this.points[name];if(point.visible){const x=(point.x-this.cx)/this.scale,y=(point.y-this.cy)/this.scale,radius=name==='reticle'&&this.state.damage>0?36:name==='aim'?31:24;if(hits(x-radius,y-radius,x+radius,y+radius,0))return false;}}
  return true;
 }
 _actionRow(text,y,size,color,maxWidth,edge,rows,progress=0){
  const w=Math.max(Math.min(maxWidth,hudTextWidth(text,size)),progress>0?150:0),h=progress>0?24:size;let x=0,top=y;
  if(edge&&!this._edgeBoxClear(x,top+h/2,w,h,edge,rows)){
   // Protect the action, moving its row only when the exact edge pin or the
   // compact viewport occupies it. Prefer a small sideways move at this row.
   const left=edge.left-w/2-8,right=edge.right+w/2+8;
   search:for(let step=0;step<12;step++)for(const candidate of step===0?[left,right]:[0,left,right]){
    const rowY=Math.min(y-step*28,edge.halfH-h-8);
    if(this._edgeBoxClear(candidate,rowY+h/2,w,h,edge,rows)){x=candidate;top=rowY;break search;}
   }
  }
  this._text(text,x,top,size,color,'center',maxWidth);if(progress>0)this._bar(x,top+22,150,progress,color);rows.push({x,y:top,w,h});
 }
 _waypoint(edge=this._waypointEdge(),actionRows=[]){
  const p=this.state.waypoint,c=HUD_COLORS,label=p.label||'OBJECTIVE',distance=distanceLabel(finite(p.distance));
  if(edge){
   // Keep an offscreen objective at the view edge, clear of the central sight.
   // The diamond and distance replace the old ahead/behind instruction banner.
   const {halfW,halfH,x,y,ux,uy}=edge;
   this._point('objectiveCue',x,y);this._diamond(x,y,7,c.dark,1,4.2);this._diamond(x,y,7,c.amber,1,2);
   this._line(x+ux*11-uy*4,y+uy*11+ux*4,x+ux*16,y+uy*16,1.6,c.amber);this._line(x+ux*16,y+uy*16,x+ux*11+uy*4,y+uy*11-ux*4,1.6,c.amber);
   const horizontal=Math.abs(y)>=halfH-30-.01,edgeX=Math.sign(x)*(halfW-46),edgeY=Math.sign(y)*(halfH-18),inwardX=clamp(x-ux*47,-halfW+46,halfW-46),inwardY=clamp(y-uy*24+5,-halfH+18,halfH-18);
   const slots=[[inwardX,inwardY]];
   for(const offset of [54,-54,104,-104,154,-154])slots.push(...(horizontal?[[x+offset,edgeY],[inwardX+offset,inwardY]]:[[edgeX,y+offset],[inwardX,inwardY+offset]]));
   for(const [lx,ly] of slots)if(this._edgeBoxClear(lx,ly,76,20,edge,actionRows)){this._rect(lx,ly,76,20,c.dark,.72,3);this._text(distance,lx,ly-5,10,c.amber,'center',68);break;}
   // Keep the exact edge pin even when every nearby label slot is occupied.
   return;
  }
  // The world pin stays exactly at the projected destination. Only its label
  // may move to remain legible, with a leader preserving the correspondence.
  const x=finite(p.x)*this.width/(2*this.scale),y=-finite(p.y)*this.height/(2*this.scale),halfW=this.cx/this.scale,halfH=this.cy/this.scale;
  this._point('waypoint',x,y);this._diamond(x,y,7,c.dark,1,4.2);this._diamond(x,y,7,c.amber,1,2);
  const text=label+'  ·  '+distance,labelW=Math.min(250,hudTextWidth(normalizeHudText(text),11)+20),labelH=27;
  let lx=clamp(x,-halfW+labelW/2+12,halfW-labelW/2-12),ly=clamp(y-27,-halfH+labelH/2+12,halfH-labelH/2-12);
  const clashes=(cx,cy)=>{
   const l=cx-labelW/2,r=cx+labelW/2,t=cy-labelH/2,b=cy+labelH/2;
   for(let i=0;i<this.textCount;i++){const text=this.texts[i],tx=(text.x-this.cx)/this.scale,ty=(text.y-this.cy)/this.scale;if(l<tx+text.width/this.scale+6&&r>tx-6&&t<ty+text.height/this.scale+6&&b>ty-6)return true;}
   for(const name of ['reticle','aim','command']){const point=this.points[name];if(point.visible){const px=(point.x-this.cx)/this.scale,py=(point.y-this.cy)/this.scale,radius=name==='reticle'&&this.state.damage>0?36:name==='aim'?31:24;if(l<px+radius&&r>px-radius&&t<py+radius&&b>py-radius)return true;}}
   return false;
  };
  let labelSafe=!clashes(lx,ly);
  if(!labelSafe){
   const candidates=[[x,y+30],[x+labelW/2+26,y],[x-labelW/2-26,y],[x,y-60],[x,y+60]];
   for(const candidate of candidates){const cx=clamp(candidate[0],-halfW+labelW/2+12,halfW-labelW/2-12),cy=clamp(candidate[1],-halfH+labelH/2+12,halfH-labelH/2-12);if(!clashes(cx,cy)){lx=cx;ly=cy;labelSafe=true;break;}}
  }
  // If every nearby label slot is occupied, retain the exact world pin.
  if(!labelSafe)return;
  const ex=clamp(x,lx-labelW/2,lx+labelW/2),ey=clamp(y,ly-labelH/2,ly+labelH/2),dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy);
  if(len>9){this._line(x+dx*9/len,y+dy*9/len,ex,ey,2.6,c.dark,.8);this._line(x+dx*9/len,y+dy*9/len,ex,ey,1,c.amber,.85);}
  this._rect(lx,ly,labelW,labelH,c.dark,.82,4);this._text(text,lx,ly-6,11,c.amber,'center',labelW-18);
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
  this._shape(this.width/2,this.height/2,this.width,this.height,c.dark,screen==='loading'?1:.86);
  this._rect(0,0,600,610,c.panel,.77,12);this._rect(0,0,600,610,c.edge,.65,12,1);
  this._line(-260,-268,-232,-268,3,c.amber);this._text('JET GAME',-216,-278,18,c.ink,'left',250);this._text(screen==='game'?'EXPEDITION':screen,260,-275,11,c.muted,'right',160);
  if(screen==='help'){this._help();return;}if(screen==='upgrades'){this._upgrades();return;}if(screen==='death'){this._death();return;}
  if(screen==='loading'||screen==='error'){this._loading();return;}
  this._text(screen==='pause'?'TAKE A BREATH.':s.ready?'EXPEDITION READY':'PREPARING EXPEDITION',0,-185,29,c.ink,'center',510);
  this._text(screen==='pause'?'THE EXPEDITION IS PAUSED':s.continuing?'YOUR CHECKPOINT HAS BEEN RESTORED':'FIND SURVIVORS. CLEAR A WAY OUT.',0,-134,13,c.muted,'center',500);
  if(screen==='pause'){
   this._text(Math.floor(finite(s.kills))+' CLEARED  /  '+Math.floor(finite(s.rescued))+' RESCUED  /  '+Math.floor(finite(s.relays))+' RELAYS',0,-83,12,c.amber,'center',500);
   this._button('resume','RESUME',0,-24,330,50,{accent:c.cyan});
  }else{this._text(s.mission,0,-94,14,c.amber,'center',500);this._text(s.missionDetail,0,-70,11,c.muted,'center',500);this._button('play',s.ready?s.continuing?'CONTINUE EXPEDITION':'ENTER BATTLEFIELD':'PREPARING BATTLEFIELD',0,-24,330,50,{disabled:!s.ready,accent:c.cyan});}
  this._button('help','CONTROLS',-129,47,246,44);this._button('upgrades','UPGRADES',129,47,246,44);
  this._button('save','SAVE EXPEDITION',-129,108,246,44,{disabled:!s.ready||!s.saveAvailable});this._button('mute',s.muted?'SOUND OFF':'SOUND ON',129,108,246,44);
  this._text(s.saveStatus,0,155,11,c.muted,'center',500);
  this._line(-230,198,230,198,1,c.edge,.7);this._text('WASD MOVE  /  MOUSE AIM  /  E ENTER',0,221,12,c.muted,'center',490);
  this._text('H CONTROLS  ·  ESC PAUSE',0,249,10,c.muted,'center',450);
 }
 _loading(){
  const s=this.state,c=HUD_COLORS,failed=s.screen==='error';
  this._text(failed?'SYSTEM INTERRUPTED':s.continuing?'RESUMING EXPEDITION':'PREPARING EXPEDITION',0,-190,25,failed?c.amber:c.ink,'center',510);
  if(failed){this._text('RELOAD TO RETURN TO THE BATTLEFIELD',0,-125,13,c.muted,'center',510);this._paragraph(s.error||'GPU CONNECTION UNAVAILABLE',0,-78,12,c.amber,490);this._button('reload','RELOAD',0,70,300,50,{accent:c.amber});return;}
  this._text(s.phase,0,-111,18,c.ink,'center',500);
  this._paragraph(s.phaseDetail,0,-69,12,c.muted,475,24,3);
  this._bar(0,42,420,clamp(finite(s.progress),0,1),c.cyan);
  const total=Math.max(0,Math.floor(finite(s.phaseCount))),index=clamp(Math.floor(finite(s.phaseIndex)),0,total);
  this._text(total?'STEP '+index+' OF '+total:'STARTING UP',-210,61,11,c.muted,'left',300);this._text(Math.round(clamp(finite(s.progress),0,1)*100)+'%',210,58,16,c.cyan,'right',100);
  this._line(-230,126,230,126,1,c.edge,.7);
  this._text(s.continuing?'YOUR SAVED EXPEDITION IS BEING RESTORED':'PREPARING THE WORLD BEFORE YOU ENTER',0,151,11,c.muted,'center',500);
  this._text('FOLLOW THE GOLD MARKER TO YOUR NEXT OBJECTIVE',0,194,11,c.amber,'center',500);
  this._text('YOU CAN CONTINUE WHEN EVERYTHING IS READY',0,222,10,c.muted,'center',500);
 }
 _help(){
  const c=HUD_COLORS;this._text('FIELD CONTROLS',0,-225,24,c.ink,'center',500);
  const rows=[['WASD','MOVE / DRIVE / THROTTLE'],['MOUSE','AIM / STEER JET'],['LMB','FIRE'],['RMB','SHOVE / VEHICLE MISSILES'],['SHIFT','SPRINT / BOOST / CHUTE DIVE'],['SPACE','JUMP / HANDBRAKE / BOMB'],['C / CTRL','CROUCH / SLIDE'],['JET: C','CENTER FLIGHT COMMAND'],['E','ENTER / EXIT / EJECT'],['Q','SWAP SEATS WITH ALLIED DRIVER'],['F HOLD','REPAIR SURVIVOR RADIO'],['R','RELOAD / DEPLOY'],['Z / X / V','RIFLE / TORQUE / BOMB UPGRADE'],['B','UNLOCK / EQUIP CLUSTER MISSILES']];
  for(let i=0;i<rows.length;i++){const y=-172+i*23;this._text(rows[i][0],-249,y,11,c.cyan,'left',125);this._text(rows[i][1],-106,y,12,c.ink,'left',360);}
  this._text('IN AIR: SPACE OPENS OR CUTS THE PARACHUTE',0,168,11,c.muted,'center',500);this._text('AFTER DEFEAT: 1 / 2 / 3 CHOOSES YOUR INSERTION',0,192,10,c.muted,'center',510);
  this._button('back','BACK',0,251,220,42);
 }
 _upgrades(){
  const s=this.state,c=HUD_COLORS;this._text('BUILD YOUR EDGE',0,-224,25,c.ink,'center',500);this._text(Math.floor(finite(s.scrap))+' SCRAP',0,-180,14,c.amber,'center',400);
  if(!s.upgradeCount){this._text('SALVAGE THE HORDE TO EARN UPGRADES',0,-30,15,c.muted,'center',500);}
  for(let i=0;i<s.upgradeCount;i++){
   const u=s.upgrades[i],y=-126+i*88,equipment=u.id==='cluster',max=!equipment&&finite(u.level)>=3;
   const status=equipment?(u.level?(u.equipped?'CLUSTER EQUIPPED':'STANDARD EQUIPPED'):'KILLS + RESCUES EARN SCRAP'):'LEVEL '+Math.min(3,Math.max(0,finite(u.level)))+' / 3';
   this._rect(0,y+15,522,80,c.dark,.6,5);this._text(u.name,-242,y-14,15,c.ink,'left',310);this._text(status,-242,y+8,10,equipment&&u.equipped?c.cyan:c.amber,'left',265);this._text(u.detail,-242,y+28,10,c.muted,'left',315);
   this._button('upgrade:'+u.id,max?'MAX':equipment&&u.level?'B SWAP':u.key+'  '+u.cost,183,y+10,120,44,{disabled:max||!u.available,accent:equipment?c.cyan:c.amber});
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
