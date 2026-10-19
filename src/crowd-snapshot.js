// One asynchronous position/state read shared by fixed turrets and all allies.
// Actor records are reused between scans. Consumers copy chosen target values.
export class CrowdSnapshot {
 constructor(){this.epoch=0;this.pending=null;this.pool=[];this.latest=null;this.scans=0;this.errors=[];}
 reset(){this.epoch++;this.latest=null;}
 read(h,time){
  if(this.pending)return this.pending;
  const generation=h.generation,epoch=this.epoch;
  const task=(async()=>{
   const [pb,sb]=await Promise.all([h.renderer.getArrayBufferAsync(h.pos.value),h.renderer.getArrayBufferAsync(h.state.value)]);
   if(epoch!==this.epoch||generation!==h.generation)return null;
   const positions=new Float32Array(pb),states=new Float32Array(sb),targets=[];
   for(let id=0;id<h.count;id++){
    const k=id*4;if(states[k]<=0)continue;
    const t=this.pool[id]||(this.pool[id]={id,x:0,y:0,z:0,hp:0,type:0});
    t.x=positions[k];t.y=positions[k+1];t.z=positions[k+2];t.hp=states[k];t.type=states[k+3];targets.push(t);
   }
   this.latest={generation,time,positions,states,targets};this.scans++;return this.latest;
  })().catch(error=>{if(epoch===this.epoch){this.latest=null;this.errors.push(String(error));this.errors=this.errors.slice(-4);}return null;}).finally(()=>{if(this.pending===task)this.pending=null;});
  this.pending=task;return task;
 }
 report(){return {scans:this.scans,pending:!!this.pending,targets:this.latest?.targets.length??0,errors:[...this.errors]};}
}
