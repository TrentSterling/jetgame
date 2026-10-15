import * as T from 'three/webgpu';
// Rigid parts move together in their parent's local frame. Keep the original
// meshes for collision and breakup; only their draw submission is replaced.
export function compositeRigid(root,exclude=new Set()){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),groups=new Map();
 const visit=o=>{
  if(exclude.has(o)||!o.visible)return;
  if(o!==root&&o.isMesh&&!o.userData.rigidComposite&&!Array.isArray(o.material)&&o.material.isMeshStandardMaterial&&!o.material.transparent&&!o.geometry.isInstancedBufferGeometry){
   const key=`${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
  }
  for(const child of o.children)visit(child);
 };visit(root);
 let before=0,after=0;
 for(const parts of groups.values()){
  before+=parts.length;if(parts.length<2){after++;continue;}
  const geometries=parts.map(p=>{const g=p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone();g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,p.matrixWorld));return g;});
  const geometry=new T.BufferGeometry();
  for(const name of ['position','normal','uv']){
   const size=name==='uv'?2:3,array=new Float32Array(geometries.reduce((n,g)=>n+g.getAttribute('position').count*size,0));let offset=0;
   for(const g of geometries){const a=g.getAttribute(name);if(a)array.set(a.array,offset);offset+=g.getAttribute('position').count*size;}
   geometry.setAttribute(name,new T.BufferAttribute(array,size));
  }
  geometry.computeBoundingSphere();const merged=new T.Mesh(geometry,parts[0].material);merged.name='Rigid model detail';merged.castShadow=parts[0].castShadow;merged.receiveShadow=parts[0].receiveShadow;merged.userData.rigidComposite=true;merged.updateMatrix();merged.matrixAutoUpdate=false;root.add(merged);
  for(const p of parts){p.visible=false;p.userData.rigidSource=true;p.updateMatrix();p.matrixAutoUpdate=false;}
  for(const g of geometries)g.dispose();after++;
 }
 return {before,after};
}
// Render composites must not change the original pieces emitted by a wreck.
export function visitOriginalParts(root,visit){
 if(root.userData.rigidComposite||(!root.visible&&!root.userData.rigidSource))return;
 if(root.isMesh)visit(root);for(const child of root.children)visitOriginalParts(child,visit);
}
// Bake stationary site components into one GPU mesh per material/shadow state.
// Original collision meshes retain their world matrices and geometry for rays.
export function compositeStatic(root,exclude=new Set()){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),groups=new Map();
 root.traverse(o=>{
  if(o===root||exclude.has(o)||!o.isMesh||!o.visible||!o.material.isMeshStandardMaterial||o.material.transparent||Array.isArray(o.material)||o.geometry.isInstancedBufferGeometry)return;
  const key=`${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
 });
 let before=0,after=0;
 for(const parts of groups.values()){
  before+=parts.length;if(parts.length<2){after++;continue;}
  const geometries=parts.map(p=>{const g=p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone();g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,p.matrixWorld));return g;});
  const geometry=new T.BufferGeometry();
  for(const name of ['position','normal','uv']){
   const size=name==='uv'?2:3,array=new Float32Array(geometries.reduce((n,g)=>n+g.getAttribute('position').count*size,0));let offset=0;
   for(const g of geometries){const attr=g.getAttribute(name);if(attr)array.set(attr.array,offset);offset+=g.getAttribute('position').count*size;}
   geometry.setAttribute(name,new T.BufferAttribute(array,size));
  }
  geometry.computeBoundingSphere();const merged=new T.Mesh(geometry,parts[0].material);merged.name='Composite site detail';merged.castShadow=parts[0].castShadow;merged.receiveShadow=parts[0].receiveShadow;root.add(merged);
  for(const p of parts){p.visible=false;p.matrixAutoUpdate=false;p.matrixWorldAutoUpdate=false;}for(const g of geometries)g.dispose();after++;
 }
 root.updateWorldMatrix(true,true);
 root.traverse(o=>{if(!exclude.has(o)){o.updateMatrix();o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;}});
 root.userData.composite={before,after};return root.userData.composite;
}
