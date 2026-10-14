// CPU broadphase for streamed static obstacles. Arrays and obstacle identities
// remain ordinary game-facing values; membership/geometry edits invalidate lazily.
const lists=new WeakMap(),geometry=new WeakMap();
const CELL=64,MAX_BOX_CELLS=256,MAX_QUERY_CELLS=4096;
const numeric=key=>typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key);

function observe(box,state){
 if(!box||typeof box!=='object')return;
 let record=geometry.get(box);
 if(!record){
  record={listeners:new Set()};geometry.set(box,record);
  for(const key of ['x','z','w','d']){
   const descriptor=Object.getOwnPropertyDescriptor(box,key);
   // Frozen geometry cannot change. Custom accessors/nonconfigurable writable
   // fields can explicitly call invalidateObstacles after their own mutation.
   if(!descriptor?.configurable||!('value' in descriptor)||!descriptor.writable)continue;
   let value=descriptor.value;
   Object.defineProperty(box,key,{enumerable:descriptor.enumerable,configurable:true,
    get:()=>value,set:next=>{if(!Object.is(value,next)){value=next;for(const owner of record.listeners)owner.revision++;}}});
  }
 }
 record.listeners.add(state);
}

export function obstacleList(items=[]){
 const array=Array.from(items),state={array,revision:0,built:-1,buckets:new Map(),bounds:[],large:[]};
 for(const box of array)observe(box,state);
 const proxy=new Proxy(array,{
  set(target,key,value){const changed=!Object.is(target[key],value),ok=Reflect.set(target,key,value);if(ok&&changed){if(numeric(key))observe(value,state);state.revision++;}return ok;},
  deleteProperty(target,key){const had=Object.hasOwn(target,key),ok=Reflect.deleteProperty(target,key);if(ok&&had)state.revision++;return ok;},
  defineProperty(target,key,descriptor){const ok=Reflect.defineProperty(target,key,descriptor);if(ok){if(numeric(key)&&'value' in descriptor)observe(descriptor.value,state);state.revision++;}return ok;},
 });
 lists.set(proxy,state);return proxy;
}
export function obstacleRevision(array){return lists.get(array)?.revision??array.length;}
export function invalidateObstacles(array){const state=lists.get(array);if(state)state.revision++;}

const bounds=box=>({minX:box.x-box.w/2,maxX:box.x+box.w/2,minZ:box.z-box.d/2,maxZ:box.z+box.d/2});
const overlaps=(b,x0,z0,x1,z1)=>b.maxX>=x0&&b.minX<=x1&&b.maxZ>=z0&&b.minZ<=z1;
const valid=b=>Number.isFinite(b.minX)&&Number.isFinite(b.maxX)&&Number.isFinite(b.minZ)&&Number.isFinite(b.maxZ)&&b.minX<=b.maxX&&b.minZ<=b.maxZ;
function rebuild(state){
 state.buckets.clear();state.bounds.length=state.array.length;state.large.length=0;
 for(let i=0;i<state.array.length;i++){
  const box=state.array[i];if(!box){state.bounds[i]=null;continue;}
  const b=bounds(box);state.bounds[i]=b;
  const x0=Math.floor(b.minX/CELL),x1=Math.floor(b.maxX/CELL),z0=Math.floor(b.minZ/CELL),z1=Math.floor(b.maxZ/CELL);
  if(!valid(b)||(x1-x0+1)*(z1-z0+1)>MAX_BOX_CELLS){state.large.push(i);continue;}
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const key=`${x},${z}`;let bucket=state.buckets.get(key);if(!bucket)state.buckets.set(key,bucket=[]);bucket.push(i);}
 }
 state.built=state.revision;
}

// Inclusive bounds keep tangent contacts for the narrow-phase's own rules.
// Untracked fixture arrays still prune cheaply without caching mutable contents.
export function queryObstacles(array,minX,minZ,maxX,maxZ){
 const state=lists.get(array);
 if(![minX,minZ,maxX,maxZ].every(Number.isFinite))return Array.from(array).filter(Boolean);
 if(minX>maxX||minZ>maxZ)return [];
 if(!state)return array.filter(box=>{if(!box)return false;const b=bounds(box);return !valid(b)||overlaps(b,minX,minZ,maxX,maxZ);});
 if(state.built!==state.revision)rebuild(state);
 const x0=Math.floor(minX/CELL),x1=Math.floor(maxX/CELL),z0=Math.floor(minZ/CELL),z1=Math.floor(maxZ/CELL);
 if((x1-x0+1)*(z1-z0+1)>MAX_QUERY_CELLS)return state.array.filter((box,i)=>box&&(!valid(state.bounds[i])||overlaps(state.bounds[i],minX,minZ,maxX,maxZ)));
 const ids=new Set(state.large);
 for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const bucket=state.buckets.get(`${x},${z}`);if(bucket)for(const id of bucket)ids.add(id);}
 return [...ids].sort((a,b)=>a-b).filter(id=>!valid(state.bounds[id])||overlaps(state.bounds[id],minX,minZ,maxX,maxZ)).map(id=>state.array[id]);
}
export function querySweep(array,x,z,dx,dz,r){
 // Four collision iterations can each nudge by 0.0001 along a contact normal.
 const margin=r+.001;
 return queryObstacles(array,Math.min(x,x+dx)-margin,Math.min(z,z+dz)-margin,Math.max(x,x+dx)+margin,Math.max(z,z+dz)+margin);
}
