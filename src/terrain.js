import {regionAt} from './regions.js';
// Shared coefficients generate identical CPU and shader terrain. The runway
// stays graded, with broad hills, bowls and ridges outside the airfield.
const hills=[[-255,-140,150,170,43],[230,-165,150,130,52],[-310,220,180,150,64],[250,210,155,170,58],[-75,-365,190,120,83],[100,390,180,150,95],[-520,-60,180,290,110],[525,40,160,280,125]];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Terrain Lab's deterministic lattice noise (Trent Sterling, MIT), adapted
// to an analytical heightfield shared with the crowd and blood shaders.
function hash(x,z,seed){let h=Math.imul(x,374761393)^Math.imul(z,2147483647)^Math.imul(seed,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295*2-1;}
export function noise(x,z,seed=13){const ix=Math.floor(x),iz=Math.floor(z);x-=ix;z-=iz;x=x*x*(3-2*x);z=z*z*(3-2*z);const a=hash(ix,iz,seed),b=hash(ix+1,iz,seed),c=hash(ix,iz+1,seed),d=hash(ix+1,iz+1,seed);return a+(b-a)*x+(c+(d-c)*x-a-(b-a)*x)*z;}
function rawHeight(x,z){
 if(Math.abs(x)<=45&&Math.abs(z)<=170)return 0;
 const edge=Math.max(smooth(45,110,Math.abs(x)),smooth(170,235,Math.abs(z)));
 let y=2.2*Math.sin(x*.024+z*.012)+1.7*Math.sin(z*.033-x*.009)+.6*Math.sin(x*.058-z*.041);
 if(x>=-700&&x<=685&&z>=-485&&z<=540)for(const [cx,cz,rx,rz,h] of hills){const t=Math.max(0,1-((x-cx)/rx)**2-((z-cz)/rz)**2);y+=h*t*t*(3-2*t);}
 const outer=smooth(120,260,Math.hypot(x*.9,z));
 y+=outer*(13*noise(x*.009,z*.009,13)+5*noise(x*.024,z*.024,17)+1.1*noise(x*.08,z*.08,19));
 const cut=x+240-35*Math.sin(z*.009);y-=outer*24*Math.exp(-cut*cut/1250);
 const ridge=Math.max(0,1-Math.abs(x-300-35*Math.sin(z*.015))/80);y+=outer*24*ridge*ridge*(.6+.4*noise(z*.03,0,31));
 y+=smooth(500,850,Math.hypot(x,z))*(52*noise(x*.0016,z*.0016,41)+20*noise(x*.004,z*.004,43));
 return y*edge;
}
function analyticHeight(x,z){
 const cx=Math.round(x/900),cz=Math.round(z/900);
 if(cx===0&&cz===0)return rawHeight(x,z);
 const site=regionAt(cx,cz),distance=Math.hypot(x-site.x,z-site.z);
 if(distance>=105)return rawHeight(x,z);
 if(distance<=42)return rawHeight(site.x,site.z);
 const base=rawHeight(x,z);return base+(rawHeight(site.x,site.z)-base)*(1-smooth(42,105,distance));
}
// The physics surface is exactly the pair of triangles used by each 2 m cell.
// This also keeps feet, wheels and GPU corpses on the rendered ridge surface.
export function height(x,z){
 const gx=Math.floor(x/2)*2,gz=Math.floor(z/2)*2,u=(x-gx)/2,v=(z-gz)/2;
 if(u===0&&v===0)return analyticHeight(gx,gz);
 const b=analyticHeight(gx+2,gz),c=analyticHeight(gx,gz+2);
 if(u+v<=1){const a=analyticHeight(gx,gz);return a+(b-a)*u+(c-a)*v;}
 const d=analyticHeight(gx+2,gz+2);return d+(c-d)*(1-u)+(b-d)*(1-v);
}
const f=x=>Number(x).toFixed(7);
export const terrainWGSL=`fn terrainHeight(p:vec2f)->f32{
 let g=floor(p/2.0)*2.0;let f=(p-g)/2.0;
 let b=terrainAnalytic(g+vec2f(2.0,0.0));let c=terrainAnalytic(g+vec2f(0.0,2.0));
 if(f.x+f.y<=1.0){let a=terrainAnalytic(g);return a+(b-a)*f.x+(c-a)*f.y;}
 let d=terrainAnalytic(g+vec2f(2.0));return d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}
fn terrainAnalytic(p:vec2f)->f32{
 let c=floor(p/900.0+vec2f(.5));
 if(all(c==vec2f(0.0))){return terrainRaw(p);}
 let site=c*900.0+vec2f(sin(c.x*7.0+c.y*13.0),sin(c.x*17.0-c.y*5.0))*110.0;
 let distance=length(p-site);
 if(distance>=105.0){return terrainRaw(p);}
 if(distance<=42.0){return terrainRaw(site);}
 return mix(terrainRaw(p),terrainRaw(site),1.0-smoothstep(42.0,105.0,distance));
}
fn terrainRaw(p:vec2f)->f32{
 if(abs(p.x)<=45.0&&abs(p.y)<=170.0){return 0.0;}
 let edge=max(smoothstep(45.0,110.0,abs(p.x)),smoothstep(170.0,235.0,abs(p.y)));
 var y=2.2*sin(p.x*.024+p.y*.012)+1.7*sin(p.y*.033-p.x*.009)+.6*sin(p.x*.058-p.y*.041);
 if(p.x>=-700.0&&p.x<=685.0&&p.y>=-485.0&&p.y<=540.0){
 ${hills.map(([x,z,rx,rz,h],i)=>`let q${i}=(p-vec2f(${f(x)},${f(z)}))/vec2f(${f(rx)},${f(rz)});let t${i}=max(0.0,1.0-dot(q${i},q${i}));y+=${f(h)}*t${i}*t${i}*(3.0-2.0*t${i});`).join('\n')}
 }
 let outer=smoothstep(120.0,260.0,length(p*vec2f(.9,1.0)));
 y+=outer*(13.0*terrainNoise(p*.009,13u)+5.0*terrainNoise(p*.024,17u)+1.1*terrainNoise(p*.08,19u));
 let cut=p.x+240.0-35.0*sin(p.y*.009);y-=outer*24.0*exp(-cut*cut/1250.0);
 let ridge=max(0.0,1.0-abs(p.x-300.0-35.0*sin(p.y*.015))/80.0);y+=outer*24.0*ridge*ridge*(.6+.4*terrainNoise(vec2f(p.y*.03,0.0),31u));
 y+=smoothstep(500.0,850.0,length(p))*(52.0*terrainNoise(p*.0016,41u)+20.0*terrainNoise(p*.004,43u));
 return y*edge;
}
fn terrainHash(x:i32,z:i32,s:u32)->f32{
 var h=(bitcast<u32>(x)*374761393u)^(bitcast<u32>(z)*2147483647u)^(s*1274126177u);
 h=(h^(h>>13u))*1274126177u;return f32(h^(h>>16u))/4294967295.0*2.0-1.0;
}
fn terrainNoise(p:vec2f,s:u32)->f32{
 let q=vec2i(floor(p));let f=fract(p);let t=f*f*(3.0-2.0*f);
 return mix(mix(terrainHash(q.x,q.y,s),terrainHash(q.x+1,q.y,s),t.x),mix(terrainHash(q.x,q.y+1,s),terrainHash(q.x+1,q.y+1,s),t.x),t.y);
}`;
