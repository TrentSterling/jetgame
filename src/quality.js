// Graphics-only, opt-in profiles. Population, physics, missions and checkpoint
// buffers deliberately stay identical so switching cannot invalidate a save.
export const QUALITY_KEY='Horde3D-graphics-quality';
export const QUALITY_PROFILES=Object.freeze({
 standard:Object.freeze({id:'standard',label:'Standard',pixelRatio:1.5,pixelBudget:Infinity,antialias:true,shadows:true,terrainRadius:4,terrainSegments:128,terrainWorkers:4,decorations:true,dynamicLights:true,surfaceDetail:true,environment:true,liteCrowd:false,gore:true,effectScale:1,far:2400}),
 potato:Object.freeze({id:'potato',label:'Potato',pixelRatio:.65,pixelBudget:921600,antialias:false,shadows:false,terrainRadius:2,terrainSegments:128,terrainWorkers:2,decorations:false,dynamicLights:false,surfaceDetail:false,environment:false,liteCrowd:true,gore:false,effectScale:.25,far:500}),
});
export function resolveQuality(search='',saved=''){
 const requested=new URLSearchParams(search).get('quality');
 return Object.hasOwn(QUALITY_PROFILES,requested)?QUALITY_PROFILES[requested]:Object.hasOwn(QUALITY_PROFILES,saved)?QUALITY_PROFILES[saved]:QUALITY_PROFILES.standard;
}
let saved='';try{saved=globalThis.localStorage?.getItem(QUALITY_KEY)||'';}catch{}
export const QUALITY=resolveQuality(globalThis.location?.search||'',saved);
export function renderPixelRatio(profile,width,height,dpr=1){
 const density=Number.isFinite(dpr)&&dpr>0?dpr:1;
 const area=Math.max(1,Number.isFinite(width*height)?width*height:1);
 return Math.min(density,profile.pixelRatio,Math.sqrt(profile.pixelBudget/area));
}
export function qualityURL(href,id){
 if(!Object.hasOwn(QUALITY_PROFILES,id))throw Error('Unknown graphics profile');
 const url=new URL(href);url.searchParams.set('quality',id);return url.href;
}
export function rememberQuality(id){try{globalThis.localStorage?.setItem(QUALITY_KEY,id);}catch{}}
export function qualityReport(profile,width,height,dpr=1){return {profile:profile.id,renderPixelRatio:renderPixelRatio(profile,width,height,dpr),antialias:profile.antialias,shadows:profile.shadows,dynamicLights:profile.dynamicLights,terrainTiles:(profile.terrainRadius*2+1)**2,terrainSegments:profile.terrainSegments,terrainTriangles:(profile.terrainRadius*2+1)**2*profile.terrainSegments**2*2,liteCrowd:profile.liteCrowd,gore:profile.gore,population:12000,far:profile.far};}
