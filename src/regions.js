// Stable world addresses; generation is independent of traversal order.
export const REGION_SIZE=900;
export const regionKinds=['relay','quarry','settlement','depot'];
export function regionAt(cx,cz){
 if(cx===0&&cz===0)return {id:'0,0',cx,cz,x:0,z:70,kind:'home',name:'Airfield refuge'};
 const x=cx*900+Math.sin(cx*7+cz*13)*110,z=cz*900+Math.sin(cx*17-cz*5)*110;
 const kind=regionKinds[((cx*7+cz*11)%4+4)%4];
 const names={relay:'Ridge relay',quarry:'Redstone quarry',settlement:'Lost settlement',depot:'Convoy depot'};
 return {id:`${cx},${cz}`,cx,cz,x,z,kind,name:`${names[kind]} ${cx}:${cz}`};
}
export function regionsNear(x,z,radius=1){const cx=Math.round(x/900),cz=Math.round(z/900),out=[];for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)out.push(regionAt(cx+dx,cz+dz));return out;}
export function expeditionOffer(site){return {people:site.kind==='settlement'?4:site.kind==='relay'?2:3,reward:site.kind==='settlement'?180:120};}
