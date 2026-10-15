// Home-only layout. The north/south flight lane and east rescue gate stay open.
export const perimeterWalls=[
 {x:-50,z:40,w:2,d:48,h:1.7},{x:-50,z:108,w:2,d:64,h:1.7},
 {x:56,z:52,w:2,d:72,h:1.7},{x:56,z:126,w:2,d:28,h:1.7},
 {x:-38,z:16,w:24,d:2,h:1.7},{x:47,z:16,w:18,d:2,h:1.7},
 {x:-38,z:140,w:24,d:2,h:1.7},{x:47,z:140,w:18,d:2,h:1.7},
].map(o=>({...o,defense:true}));
export const turretSites=[{x:-48,z:61},{x:54,z:85}];
// Keep two flank packs; two approach along visible ground ahead of the runway.
// All start beyond 88 m, leaving time to board without hiding the whole horde.
export const homePacks=[[-120,28],[124,28],[-4,-34],[6,-70]];
export const homePackRadius=16;
export function spawnCrowdOffset(index){
 const pack=Math.floor(index/9)%4,[x,z]=homePacks[pack],a=index*2.39996,r=Math.sqrt((index*73%997)/997)*homePackRadius;
 return {x:x+Math.cos(a)*r,z:z+Math.sin(a)*r};
}
export const spawnCrowdWGSL=`fn homeCrowd(id:f32)->vec2f{
 let pack=u32(floor(id/9.0)%4.0);
 let centers=array<vec2f,4>(${homePacks.map(([x,z])=>`vec2f(${x}.0,${z}.0)`).join(',')});
 let a=id*2.39996;let r=sqrt(((id*73.0)%997.0)/997.0)*${homePackRadius}.0;
 return centers[pack]+vec2f(cos(a),sin(a))*r;
}`;
