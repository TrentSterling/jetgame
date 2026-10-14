import * as T from 'three/webgpu';

// These stationary instances share a shader across tiles. Three r185 keys its
// InstancedMesh node programs by object UUID, rebuilding the same lighting
// graph for each newly visible tile. Bake the small low-poly sets on replacement
// instead; retain geometry/attributes and upload only their changed vertices.
export class TerrainDecoration extends T.Mesh{
 constructor(source,material,capacity){
  const geometry=new T.BufferGeometry(),vertices=source.getAttribute('position').count;
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(vertices*capacity*3),3));
  geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(vertices*capacity*3),3));
  const uv=source.getAttribute('uv');
  if(uv){const data=new Float32Array(vertices*capacity*2);for(let i=0;i<capacity;i++)data.set(uv.array,i*vertices*2);geometry.setAttribute('uv',new T.BufferAttribute(data,2));}
  if(source.index){const data=new Uint32Array(source.index.count*capacity);for(let i=0;i<capacity;i++)for(let j=0;j<source.index.count;j++)data[i*source.index.count+j]=source.index.getX(j)+i*vertices;geometry.setIndex(new T.BufferAttribute(data,1));}
  geometry.boundingBox=new T.Box3();geometry.boundingSphere=new T.Sphere();geometry.setDrawRange(0,0);
  super(geometry,material);this.source=source;this.capacity=capacity;this.vertices=vertices;this.decorationCount=0;this.normalTransform=new T.Matrix3();this.vector=new T.Vector3();
 }
 begin(){this.geometry.boundingBox.makeEmpty();}
 setMatrixAt(index,matrix){
  if(index<0||index>=this.capacity)throw new RangeError('Decoration capacity exceeded');
  const p=this.source.getAttribute('position'),n=this.source.getAttribute('normal'),position=this.geometry.getAttribute('position'),normal=this.geometry.getAttribute('normal'),v=this.vector;
  this.normalTransform.getNormalMatrix(matrix);
  for(let j=0;j<this.vertices;j++){
   v.fromBufferAttribute(p,j).applyMatrix4(matrix);position.setXYZ(index*this.vertices+j,v.x,v.y,v.z);this.geometry.boundingBox.expandByPoint(v.fromBufferAttribute(position,index*this.vertices+j));
   v.fromBufferAttribute(n,j).applyNormalMatrix(this.normalTransform);normal.setXYZ(index*this.vertices+j,v.x,v.y,v.z);
  }
 }
 finish(count){
  this.decorationCount=count;this.geometry.setDrawRange(0,count*(this.source.index?.count??this.vertices));
  this.geometry.getAttribute('position').needsUpdate=true;this.geometry.getAttribute('normal').needsUpdate=true;
  if(count)this.geometry.boundingBox.getBoundingSphere(this.geometry.boundingSphere);else{this.geometry.boundingBox.set(new T.Vector3(),new T.Vector3());this.geometry.boundingSphere.set(new T.Vector3(),0);}
 }
}
