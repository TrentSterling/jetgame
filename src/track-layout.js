export const ramps=[
 {x:-7,z:-102,yaw:0,w:11,length:22,h:5},
 {x:-125,z:-90,yaw:Math.PI,w:12,length:18,h:3.8},
 {x:-105,z:77,yaw:Math.PI,w:11,length:20,h:4.5},
];
export function rampPoint(r,x,z){const dx=x-r.x,dz=z-r.z;return {side:Math.cos(r.yaw)*dx-Math.sin(r.yaw)*dz,along:-Math.sin(r.yaw)*dx-Math.cos(r.yaw)*dz};}
export function trackSurface(x,z,ground){
 let y=ground(x,z);
 for(const r of ramps){const p=rampPoint(r,x,z);if(Math.abs(p.side)<=r.w/2&&Math.abs(p.along)<=r.length/2)y=Math.max(y,ground(r.x,r.z)+(p.along/r.length+.5)*r.h);}
 return y;
}
export const rampBlocks=ramps.map(r=>({x:r.x,z:r.z,w:r.w,d:r.length}));

export const trackPoints=[[-7,65],[-7,-115],[-7,-205],[-35,-235],[-100,-235],[-140,-195],[-140,-140],[-125,-90],[-132,0],[-110,55],[-105,125],[-85,178],[-35,195],[10,167],[12,115]];
