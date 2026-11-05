import * as T from 'three/webgpu';
// Six indexed 3D boxes retain the articulated part IDs used by the same GPU
// animation and simulation. This is a visual-only 72-triangle silhouette.
export function zombieLiteGeometry(){
 const positions=[],normals=[],colors=[],parts=[],uvs=[],indices=[];
 for(const [size,center,tint,part,region] of [
  [[.43,.65,.25],[0,1.16,0],'#756c56',0,1],
  [[.27,.31,.25],[0,1.66,0],'#a1a184',0,0],
  [[.14,.67,.16],[-.30,1.15,0],'#756c56',1,1],
  [[.14,.67,.16],[.30,1.15,0],'#756c56',2,1],
  [[.18,.79,.24],[-.115,.405,0],'#40534e',3,2],
  [[.18,.79,.24],[.115,.405,0],'#40534e',4,2],
 ]){
  const box=new T.BoxGeometry(...size);box.translate(...center);const offset=positions.length/3,c=new T.Color(tint);
  for(let i=0;i<box.attributes.position.count;i++){
   const p=box.attributes.position,n=box.attributes.normal;positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c.r,c.g,c.b);parts.push(part);uvs.push((region+.5)/4,.25);
  }
  for(const index of box.index.array)indices.push(offset+index);box.dispose();
 }
 const geometry=new T.InstancedBufferGeometry();
 for(const [key,array,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['part',parts,1],['uv',uvs,2]])geometry.setAttribute(key,new T.Float32BufferAttribute(array,size));
 geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}
