// Visual-only coarse apron. The dense streamed square and collision heightfield stay unchanged.
export function farTerrainPlan(x,z,{tile=256,radius=4,far=2400}={}){
 const cx=Math.floor(x/tile),cz=Math.floor(z/tile),size=(radius*2+1)*tile;
 return {key:`${cx},${cz}`,x0:(cx-radius)*tile,z0:(cz-radius)*tile,size,outer:Math.max(size/2+tile,far+tile),segments:size/16,rows:Math.max(2,Math.ceil((far+tile-size/2)/96))};
}
export function buildFarTerrain(plan,height){
 const {x0,z0,size,outer,segments,rows}=plan,cx=x0+size/2,cz=z0+size/2,inner=size/2,positions=[],indices=[];
 const point=(side,t,r)=>{const p=side===0?[cx+t*r,cz-r]:side===1?[cx+r,cz+t*r]:side===2?[cx-t*r,cz+r]:[cx-r,cz-t*r];return r===inner?p.map(v=>Math.round(v/2)*2):p;};
 const add=(x,z,y=height(x,z))=>{const i=positions.length/3;positions.push(x,y,z);return i;};
 for(let side=0;side<4;side++){
  const start=positions.length/3;
  for(let row=0;row<=rows;row++){const r=inner+(outer-inner)*row/rows;for(let i=0;i<=segments;i++){const [x,z]=point(side,i/segments*2-1,r);add(x,z);}}
  for(let row=0;row<rows;row++)for(let i=0;i<segments;i++){const a=start+row*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
  // Stitch the exact 2m resident boundary to the 16m coarse edge. No open cracks.
  for(let i=0;i<segments;i++){
   const a=start+i,b=a+1,ha=positions[a*3+1],hb=positions[b*3+1];
   for(let j=0;j<8;j++){
    const t0=(i+j/8)/segments*2-1,t1=(i+(j+1)/8)/segments*2-1,[x,z]=point(side,t0,inner),[xx,zz]=point(side,t1,inner);
    const p=add(x,z),q=add(xx,zz),r=add(x,z,ha+(hb-ha)*j/8),s=add(xx,zz,ha+(hb-ha)*(j+1)/8);
    indices.push(p,q,r,q,s,r,p,r,q,q,r,s);
   }
  }
 }
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}
