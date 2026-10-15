import {encounterRings} from './regions.js';
// Keep every existing mission guard. The remaining bodies share the active
// collision/flow window instead of spending the encounter in distant rings.
export const localCrowdHalfSize=174,localCrowdClearance=140,localCrowdRecycleDistance=620;
export const isRegionalGuard=index=>Math.floor(index/9)%encounterRings.stride===0;
function hash(x){x=(x^(x>>>16))>>>0;x=Math.imul(x,0x7feb352d)>>>0;x=(x^(x>>>15))>>>0;x=Math.imul(x,0x846ca68b)>>>0;return (x^(x>>>16))>>>0;}
export function localCrowdOffset(index,attempt=0){const seed=(Math.imul(index,17)+Math.imul(attempt,719)+74129)>>>0;return {x:(hash(seed)/4294967296*2-1)*localCrowdHalfSize,z:(hash((seed+0x9e3779b9)>>>0)/4294967296*2-1)*localCrowdHalfSize};}
export const localCrowdWGSL=`fn localCrowd(id:u32,attempt:u32,origin:vec2f)->vec2f{
 let seed=id*17u+attempt*719u+74129u;
 return origin+(vec2f(f32(crowdHash(seed)),f32(crowdHash(seed+0x9e3779b9u)))/4294967296.0*2.0-vec2f(1.0))*${localCrowdHalfSize}.0;
}
fn crowdHash(value:u32)->u32{var x=value;x=x^(x>>16u);x=x*0x7feb352du;x=x^(x>>15u);x=x*0x846ca68bu;return x^(x>>16u);}`;
