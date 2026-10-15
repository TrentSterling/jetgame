// Stable world addresses; generation is independent of traversal order.
export const REGION_SIZE=900;
// Keep rescue guards and four dense packs around each objective.
// Diagonal centres leave the cardinal approaches open between packs.
export const encounterRings={stride:16,guardMin:40,guardSpan:80};
export const encounterPacks={count:4,distance:270,radius:42};
// Existing saves also benefit: wake the whole outer ring without relocating it.
export const encounterPursuitDistance=340;
// Covers the opposite corner of a 3x3 region window, site jitter and outer ring
// even while the player stands at a region edge. Relocation cannot loop in place.
export const encounterRelocationDistance=2600;
export function encounterOffset(index,angle,random){
 const ordinal=Math.floor(index/9),guard=ordinal%encounterRings.stride===0;
 const radius=guard?encounterRings.guardMin+Math.sqrt(random)*encounterRings.guardSpan:Math.sqrt(random)*encounterPacks.radius;
 const pack=Math.floor(ordinal/encounterRings.stride)%encounterPacks.count;
 const bearing=(pack+.5)*Math.PI*2/encounterPacks.count;
 return {x:Math.cos(angle)*radius+(guard?0:Math.cos(bearing)*encounterPacks.distance),z:Math.sin(angle)*radius+(guard?0:Math.sin(bearing)*encounterPacks.distance)};
}
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
