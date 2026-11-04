import * as T from 'three/webgpu';

// A deterministic, original painted atlas. Vertex colours provide the costume
// palette; these tiles supply material, weathering and local colour variation.
// 0: exposed skin, 1: canvas jacket, 2: denim, 3: leather, 4: neutral accents,
// 5: cylindrical head (front at u=.0625, v runs from jaw to crown).
// Generated once, shared by the horde. No image/network/canvas dependencies.
export function zombieTexture(){
 const width=512,height=256,data=new Uint8Array(width*height*4);
 const clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
 const hash=(x,y)=>{let n=Math.imul(x+41,374761393)^Math.imul(y+67,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const noise=(u,v)=>{const x=Math.floor(u),y=Math.floor(v),fx=u-x,fy=v-y,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return (hash(x,y)*(1-sx)+hash(x+1,y)*sx)*(1-sy)+(hash(x,y+1)*(1-sx)+hash(x+1,y+1)*sx)*sy;};
 const oval=(u,v,x,y,rx,ry)=>Math.max(0,1-((u-x)/rx)**2-((v-y)/ry)**2);
 const line=(d,w)=>Math.max(0,1-Math.abs(d)/w);
 const mix=(a,b,t)=>a.map((c,i)=>c+(b[i]-c)*Math.max(0,Math.min(1,t)));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const tile=Math.floor(x/128)+Math.floor(y/128)*4;
  // Extruded borders match atlasUV's two-pixel inset, including corner pixels.
  const u=Math.max(0,Math.min(1,((x%128)-2)/124)),v=Math.max(0,Math.min(1,((y%128)-2)/124));
  const px=Math.floor(u*124),py=Math.floor(v*124),fine=hash(px,py)-.5;
  const broad=noise(u*8,v*7)-.5,grain=noise(u*29,v*31)-.5;
  let rgb=[255,255,255];
  const stain=(cx,cy,rx,ry)=>Math.min(1,oval(u,v,cx,cy,rx,ry)*2.3)*(.64+noise(u*42,v*39)*.36);
  if(tile===0||tile===5){
   const value=233+fine*12+broad*25+grain*13;
   rgb=[value,value+2,value-8];
   // Bruises have diffuse edges, wounds a darker dry centre and ragged rim.
   const bruise=stain(.31,.55,.14,.24)+stain(.73,.22,.19,.14);
   rgb=mix(rgb,[132,143,123],bruise*.65);
   const vein=line(u-(.37+.023*Math.sin(v*18)+.008*Math.sin(v*47)),.008)*oval(u,v,.37,.55,.16,.39);
   const branch=line(u-(.37+(v-.5)*.23),.006)*oval(u,v,.35,.43,.1,.17);
   rgb=mix(rgb,[123,132,115],(vein+branch)*.48);
   const wound=stain(.20,.36,.035,.13);
   rgb=mix(rgb,[122,69,53],wound*.88);
   rgb=mix(rgb,[69,48,38],oval(u,v,.20+.008*Math.sin(v*63),.36,.012,.105)*.85);
   if(tile===5){
    // UVs use ring index, not physical height: jaw 0, cheek .25,
    // temple .5, upper skull .75, crown 1 on the five-ring head.
    const sockets=oval(u,v,.027,.365,.026,.115)+oval(u,v,.098,.365,.026,.105);
    rgb=mix(rgb,[87,90,76],sockets*.73);
    const cheeks=oval(u,v,.007,.18,.022,.13)+oval(u,v,.123,.19,.024,.14);
    rgb=mix(rgb,[139,146,116],cheeks*.65);
    const brow=line(v-(.49+Math.sin(u*48)*.013),.015)*oval(u,v,.063,.49,.071,.11);
    rgb=mix(rgb,[142,148,119],brow*.6);
    const forehead=oval(u,v,.061,.64,.043,.12);
    rgb=mix(rgb,[249,242,204],forehead*.38);
    // Dried mouth/cheek blood sits behind the modelled jaw and teeth.
    rgb=mix(rgb,[126,57,40],stain(.096,.105,.042,.135)*.9);
    const drip=line(u-(.112+.008*Math.sin(v*29)),.009)*oval(u,v,.11,.10,.05,.17);
    rgb=mix(rgb,[96,46,34],drip*.85);
    const scalp=stain(.63,.78,.24,.26);
    rgb=mix(rgb,[100,111,84],scalp*.62);
    rgb=mix(rgb,[143,74,54],stain(.16,.62,.033,.15)*.72);
   }
  }else if(tile===1){
   const weave=(px%2===0?3:-3)+(py%3===0?3:0);
   const fold=Math.sin(v*43+Math.sin(u*17)*1.4)*7+Math.sin(u*52)*4;
   const value=229+fine*10+broad*25+grain*9+weave+fold;
   rgb=[value,value-2,value-7];
   const hem=line(v-.045,.014),cuff=line(v-.955,.012);
   const seam=line(u-.0625,.009)+line(u-.53,.009);
   rgb=mix(rgb,[112,114,100],Math.min(1,seam*.63+hem*.65+cuff*.45));
   const stitch=(line(u-.043,.004)+line(u-.081,.004))*(py%6<3?.75:0);
   rgb=mix(rgb,[249,232,184],stitch);
   const grime=stain(.30,.07,.32,.20)+stain(.75,.19,.22,.21);
   rgb=mix(rgb,[118,120,89],grime*.6);
   // Bleached elbow rub and collar wear stay broad enough to survive mipmaps.
   rgb=mix(rgb,[253,241,203],stain(.18,.67,.075,.17)*.25);
   const blood=stain(.103,.70,.052,.17)+stain(.79,.43,.075,.10);
   rgb=mix(rgb,[144,58,37],blood*.9);
   const drip=line(u-(.117+.006*Math.sin(v*37)),.007)*oval(u,v,.117,.48,.03,.22);
   rgb=mix(rgb,[117,49,33],drip*.86);
   // Jagged tears show an ochre frayed rim surrounding a deep interior.
   for(const [cx,cy,rx,ry] of [[.028,.29,.026,.10],[.67,.58,.035,.085],[.84,.09,.05,.07]]){
    const edge=oval(u,v,cx+.005*Math.sin(v*110),cy,rx,ry);
    rgb=mix(rgb,[239,218,161],Math.min(1,edge*5)*.85);
    rgb=mix(rgb,[61,56,41],Math.max(0,edge-.27)*1.8);
    const threads=line(v-cy,.006)*oval(u,v,cx,cy,rx*1.2,ry);
    rgb=mix(rgb,[210,192,145],threads*.7);
   }
   const buttons=line(u-.0625,.007)*Math.max(...[.43,.63,.83].map(t=>line(v-t,.014)));
   rgb=mix(rgb,[72,76,62],buttons);
  }else if(tile===2){
   const twill=(px+py*2)%5<2?5:-3;
   const value=224+fine*12+broad*22+grain*9+twill+Math.sin(v*63+u*15)*6;
   rgb=[value-5,value,value+3];
   const seam=line(u-.28,.009)+line(u-.78,.009);
   rgb=mix(rgb,[116,130,127],seam*.8);
   const stitching=(line(u-.263,.004)+line(u-.797,.004))*(py%6<3?.65:0);
   rgb=mix(rgb,[227,214,161],stitching);
   const knee=stain(.08,.5,.12,.16);
   rgb=mix(rgb,[243,240,214],knee*.48);
   const tear=oval(u,v,.079+.008*Math.sin(v*120),.51,.055,.047);
   rgb=mix(rgb,[139,136,105],tear*.85);
   rgb=mix(rgb,[68,75,65],Math.max(0,tear-.35)*1.4);
   rgb=mix(rgb,[226,218,171],line(v-.51,.005)*tear*.9);
   const mud=stain(.25,.07,.3,.18)+stain(.75,.11,.23,.18);
   rgb=mix(rgb,[122,110,76],mud*.7);
   rgb=mix(rgb,[130,60,40],stain(.11,.32,.045,.13)*.72);
  }else if(tile===3){
   const value=207+fine*16+broad*18+grain*10;
   rgb=[value+5,value,value-9];
   const scuff=stain(.07,.3,.15,.17)+stain(.59,.52,.13,.12);
   rgb=mix(rgb,[247,228,185],scuff*.65);
   const crack=line(u-(.3+.024*Math.sin(v*35)),.005)+line(v-(.41+.02*Math.sin(u*40)),.004);
   rgb=mix(rgb,[96,91,72],crack*.55);
   if(v<.16)rgb=mix(rgb,[106,109,91],.84);
   const welt=line(v-.18,.014);
   rgb=mix(rgb,[240,220,164],welt*.6);
   const laces=oval(u,v,.065,.68,.052,.3)*(py%13<3?.75:0);
   rgb=mix(rgb,[165,161,127],laces);
  }
  const i=(y*width+x)*4;data[i]=clamp(rgb[0]);data[i+1]=clamp(rgb[1]);data[i+2]=clamp(rgb[2]);data[i+3]=255;
 }
 const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.UnsignedByteType);
 texture.name='zombie-authored-material-atlas';texture.colorSpace=T.SRGBColorSpace;
 texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
