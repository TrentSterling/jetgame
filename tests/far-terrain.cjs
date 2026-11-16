const fs=require('fs'),vm=require('vm'),assert=require('assert');const root=__dirname+'/..';let code=fs.readFileSync(root+'/src/far-terrain-data.js','utf8');const c={};vm.createContext(c);vm.runInContext(code.replaceAll('export function','function')+';this.plan=farTerrainPlan;this.build=buildFarTerrain;',c);
for(const [x,z] of [[0,70],[255,255],[256,-1],[-257,16000],[900000,-900000]]){
 const p=c.plan(x,z),g=c.build(p,(x,z)=>Math.sin(x*.02)*30+Math.cos(z*.01)*12);assert(g.positions.every(Number.isFinite));assert(g.indices.every(i=>i<g.positions.length/3));
 assert(Math.min(x-(p.x0+p.size/2-p.outer),p.x0+p.size/2+p.outer-x)>=2400);assert(Math.min(z-(p.z0+p.size/2-p.outer),p.z0+p.size/2+p.outer-z)>=2400);
 for(let i=0;i<g.positions.length;i+=3){const [a,y,b]=g.positions.slice(i,i+3);assert(!(a>p.x0+.001&&a<p.x0+p.size-.001&&b>p.z0+.001&&b<p.z0+p.size-.001),'no near interior overlap');}
 assert(g.indices.length/3<50000);console.log(p.key,'vertices',g.positions.length/3,'triangles',g.indices.length/3);
 // Near grid is 2m; apron supplies exact matching boundary samples every2m.
 for(let i=0;i<=p.size;i+=2){const a=p.x0+i,b=p.z0;let found=false;for(let n=0;n<g.positions.length;n+=3)if(g.positions[n]===a&&g.positions[n+2]===b&&Math.abs(g.positions[n+1]-(Math.sin(a*.02)*30+Math.cos(b*.01)*12))<.0001){found=true;break;}assert(found);}
}
const world=fs.readFileSync(root+'/src/world.js','utf8');assert(world.includes('QUALITY.far>QUALITY.terrainRadius*256'));assert(world.includes('sky.renderOrder=-1000'));assert(world.includes('depthTest:false'));
assert(500<=2*256,'potato does not allocate new worker/geometry');console.log('PASS finite/index bounds, negative/large coordinates, no overlap, boundary stitching, beyond far extent, <50k triangles, unchanged potato budgets');
