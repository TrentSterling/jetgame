import * as T from 'three/webgpu';

// Original, repeatable hand-authored material recipe, shared by the entire horde.
// Four 128px tiles: mottled skin, torn canvas, worn denim, scuffed leather.
// The fifth tile is neutral for the modelled eyes, teeth and wound accents.
// No canvas, network request, image decoder, transparency or per-agent texture.
export function zombieTexture(){
 const width=512,height=256,data=new Uint8Array(width*height*4);
 const clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
 const hash=(x,y)=>{let n=Math.imul(x+41,374761393)^Math.imul(y+67,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const oval=(u,v,x,y,rx,ry)=>Math.max(0,1-((u-x)/rx)**2-((v-y)/ry)**2);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const tile=Math.floor(x/128)+Math.floor(y/128)*4;
  // Two-pixel edge extrusion protects atlas borders through the first mip levels.
  const u=Math.max(0,Math.min(1,((x%128)-2)/124)),v=Math.max(0,Math.min(1,((y%128)-2)/124));
  const fine=hash(Math.floor(u*124),Math.floor(v*124))-.5;
  const broad=hash(Math.floor(u*16),Math.floor(v*12))-.5;
  let rgb=[255,255,255];
  if(tile===0){
   const blotch=oval(u,v,.29,.56,.15,.26)+oval(u,v,.73,.2,.18,.16);
   const vein=Math.max(0,1-Math.abs(u-(.36+.035*Math.sin(v*19)))*180)*Math.max(0,1-Math.abs(v-.52)*2.4);
   const value=242+fine*15+broad*8;
   rgb=[value-blotch*24-vein*18,value-blotch*12-vein*11,value-blotch*4-vein*7];
  }else if(tile===1){
   const weave=((Math.floor(u*124)+Math.floor(v*124))%2)*4;
   const seam=Math.max(0,1-Math.abs(u-.0625)*180);
   const stitches=seam*(Math.floor(v*42)%2?26:-18);
   const grime=oval(u,v,.1,.08,.22,.22)*43+oval(u,v,.6,.24,.18,.2)*23;
   const fold=Math.sin(v*53+Math.sin(u*15)*2)*Math.max(0,1-v)*7;
   const tear=oval(u,v,.145,.37,.03,.10)+oval(u,v,.66,.6,.035,.06);
   const button=Math.abs(u-.0625)<.012&&[.44,.65,.85].some(t=>Math.abs(v-t)<.014)?48:0;
   const value=242+fine*13+broad*5+weave+fold-grime-stitches-tear*82-button;
   rgb=[value,value-2,value-5];
  }else if(tile===2){
   const seam=Math.max(0,1-Math.min(Math.abs(u-.28),Math.abs(u-.78))*110)*23;
   const knee=oval(u,v,.08,.5,.15,.16)*19;
   const crease=Math.sin(v*64+Math.sin(u*20))*7*(1-v);
   const value=234+fine*17+broad*7+((Math.floor((u+v)*100)%3)?0:7)+knee+crease-seam;
   rgb=[value-4,value,value+3];
  }else if(tile===3){
   const scuff=oval(u,v,.07,.3,.18,.2)*35+oval(u,v,.59,.52,.12,.12)*23;
   const sole=v<.16?-40:0;
   const value=216+fine*12+broad*7+scuff+sole;
   rgb=[value+3,value,value-5];
  }
  const i=(y*width+x)*4;data[i]=clamp(rgb[0]);data[i+1]=clamp(rgb[1]);data[i+2]=clamp(rgb[2]);data[i+3]=255;
 }
 const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.UnsignedByteType);
 texture.name='zombie-authored-material-atlas';texture.colorSpace=T.SRGBColorSpace;
 texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
