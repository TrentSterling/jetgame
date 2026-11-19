import {height,noise} from './terrain.js';
// Reusable tile worker. No DOM or renderer work runs here.
const linear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
const grass=[115,116,87].map(linear),sand=[177,138,93].map(linear),rock=[130,94,72].map(linear);
// One extra lattice point on each side for the centered normal probes.
const latticeStride=131;
let lattice;
function fillLattice(x0,z0){
 const values=lattice??=new Float64Array(latticeStride**2);
 for(let j=0,k=0;j<latticeStride;j++)for(let i=0;i<latticeStride;i++)
  values[k++]=height(x0+(i-1)*2,z0+(j-1)*2);
 return values;
}
self.onmessage=({data:{x0,z0,size,segments}})=>{
 const stride=segments+1,count=stride*stride,step=size/segments;
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),indices=new Uint32Array(segments*segments*6);
 // Use the collision lattice only for aligned production tiles. The
 // coordinate bound keeps the half-meter probes exactly representable.
 const grid=segments===128&&size===256&&x0%2===0&&z0%2===0
  &&Math.abs(x0)<2**50&&Math.abs(z0)<2**50?fillLattice(x0,z0):null;
 for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++){
  const k=(j*stride+i)*3,x=x0+i*step,z=z0+j*step;
  let y,dx,dz;
  if(grid){
   const n=(j+1)*latticeStride+i+1;
   y=grid[n];
   const west=grid[n-1],north=grid[n-latticeStride];
   // Reproduce terrain.js's interpolation and subtraction in that order.
   dx=(y+(grid[n+1]-y)*.25)-(west+(y-west)*.75);
   dz=(y+(grid[n+latticeStride]-y)*.25)-(north+(y-north)*.75);
  }else{
   y=height(x,z);dx=height(x+.5,z)-height(x-.5,z);dz=height(x,z+.5)-height(x,z-.5);
  }
  const len=Math.hypot(dx,1,dz);
  positions.set([x,y,z],k);normals.set([-dx/len,1/len,-dz/len],k);
  const moisture=.5+.24*Math.sin(x*.019+Math.cos(z*.023))+.18*Math.sin(z*.037-x*.022),steep=Math.min(.92,Math.max(0,Math.hypot(dx,dz)-.15)*1.3+Math.max(0,y-25)*.009),strata=.86+.14*Math.sin(y*.8+noise(x*.025,z*.025)*3);
  for(let c=0;c<3;c++){const base=grass[c]+(sand[c]-grass[c])*moisture;colors[k+c]=(base+(rock[c]-base)*steep)*strata;}
 }
 let k=0;for(let j=0;j<segments;j++)for(let i=0;i<segments;i++){const a=j*stride+i;indices.set([a,a+stride,a+1,a+1,a+stride,a+stride+1],k);k+=6;}
 self.postMessage({positions,normals,colors,indices},[positions.buffer,normals.buffer,colors.buffer,indices.buffer]);
};
