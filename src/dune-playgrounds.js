// Local terrain additions, away from the starting apron and regional shelters.
// Identical equations are embedded in CPU collision and GPU crowd/terrain code.
export const DUNE_FEATURES=Object.freeze([
 {x:-430,z:360,rx:190,rz:190,base:9,kind:0},
 {x:550,z:-360,rx:175,rz:170,base:16,kind:1},
 {x:210,z:650,rx:170,rz:240,base:8,kind:2},
 {x:-590,z:-360,rx:150,rz:200,base:-13,kind:3},
].map(Object.freeze));
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function playgroundHeight(x,z,base){
 let y=base;
 for(const f of DUNE_FEATURES){
  const qx=x-f.x,qz=z-f.z;if(Math.abs(qx)>=f.rx||Math.abs(qz)>=f.rz)continue;
  const r=Math.hypot(qx/f.rx,qz/f.rz);if(r>=1)continue;
  let shape;
  if(f.kind===0)shape=f.base-7+19*Math.min(1.5,(Math.hypot(qx,qz)/115)**2);
  else if(f.kind===1){const ridge=Math.max(0,1-Math.abs(qx-18*Math.sin(qz*.016))/100);shape=f.base+11*ridge*ridge+qz*.025;}
  else if(f.kind===2)shape=f.base+7.5*Math.sin(qz*.055)+2*Math.cos(qx*.025);
  else {const cut=(qx-22*Math.sin(qz*.02))/44;shape=f.base+15*(1-Math.exp(-cut*cut))+4*Math.sin(qz*.025);}
  if(f.kind===1||f.kind===2){const flat=1-smooth(17,40,Math.hypot(qx,qz));shape+=((f.kind===1?f.base+11:f.base)-shape)*flat;}
  const weight=1-smooth(.68,1,r);y+=(shape-y)*weight;
 }
 return y;
}
const n=v=>Number(v).toFixed(7);
export const playgroundWGSL=`fn dunePlayground(p:vec2f,base:f32)->f32{
 var y=base;
 ${DUNE_FEATURES.map((f,i)=>`{
 let q=p-vec2f(${n(f.x)},${n(f.z)});
 if(abs(q.x)<${n(f.rx)}&&abs(q.y)<${n(f.rz)}){
 let r=length(q/vec2f(${n(f.rx)},${n(f.rz)}));
 if(r<1.0){
 var shape=${f.kind===0?`${n(f.base-7)}+19.0*min(1.5,dot(q,q)/(115.0*115.0))`:f.kind===1?`${n(f.base)}+11.0*pow(max(0.0,1.0-abs(q.x-18.0*sin(q.y*.016))/100.0),2.0)+q.y*.025`:f.kind===2?`${n(f.base)}+7.5*sin(q.y*.055)+2.0*cos(q.x*.025)`:`${n(f.base)}+15.0*(1.0-exp(-pow((q.x-22.0*sin(q.y*.02))/44.0,2.0)))+4.0*sin(q.y*.025)`};
 ${f.kind===1||f.kind===2?`shape=mix(shape,${n(f.kind===1?f.base+11:f.base)},1.0-smoothstep(17.0,40.0,length(q)));`:''}
 y=mix(y,shape,1.0-smoothstep(.68,1.0,r));
 }
 }
 }`).join('\n')}
 return y;
}`;
