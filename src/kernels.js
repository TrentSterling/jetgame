import {terrainWGSL} from './terrain.js';
import {spawnCrowdWGSL} from './spawn-layout.js';
import {localCrowdWGSL,localCrowdClearance,localCrowdRecycleDistance} from './local-crowd.js';
import {encounterRings,encounterPacks,encounterRelocationDistance,encounterPursuitDistance} from './regions.js';
import {
  Fn, If, Loop, Return, atomicAdd, atomicLoad, atomicStore, instanceIndex,
  float, uint, vec2, vec3, vec4, abs, atan, clamp, cos, dot, length,
  max, min, mix, normalize, pow, sin, step, wgslFn,
} from 'three/tsl';

// Keep buffer access in the entry point. Firefox's Naga compiler does not
// accept storage-space pointers as helper-function arguments. Pure value
// helpers are portable; all memory reads/writes below are ordinary TSL.
const cell = wgslFn(`fn cellIndex(p:vec2f)->u32 {
  let c=vec2u(clamp(floor((p+vec2f(192.0))/3.0),vec2f(0.0),vec2f(127.0)));
  return c.y*128u+c.x;
}`);
const ground=wgslFn(terrainWGSL);
const localPosition=wgslFn(localCrowdWGSL);
const outsideView=wgslFn(`fn outsideCrowdView(p:vec3f,view:mat4x4f)->bool{
 let q=view*vec4f(p+vec3f(0.0,1.5,0.0),1.0);
 // A margin includes the full articulated body and avoids edge popping.
 return q.w<=0.0||q.z>q.w+4.0||q.z < -4.0||abs(q.x)>q.w*1.12+4.0||abs(q.y)>q.w*1.12+4.0;
}`);

export function createKernels(h) {
  const {pos, old, vel, state, blood, density, flow, counters, dt, time,
    defenseOrigins, defenseRays, defenseIds, viewProjection, viewEnabled, fieldOrigin, streaming, goal, shot, rays, melee, meleeAim, blastType, blast, car, carOld, tool, jet, jetOld} = h;

  const cellIndex=p=>cell(p.sub(fieldOrigin));
  const inside=p=>abs(p.x.sub(fieldOrigin.x)).lessThan(188).and(abs(p.y.sub(fieldOrigin.y)).lessThan(188));
  const relocate=wgslFn(`fn relocate(id:f32,goal:vec2f)->vec2f{
    let c=floor(goal/900.0+vec2f(.5))+vec2f((id%3.0)-1.0,(floor(id/3.0)%3.0)-1.0);
    var site=c*900.0+vec2f(sin(c.x*7.0+c.y*13.0),sin(c.x*17.0-c.y*5.0))*110.0;
    if(all(c==vec2f(0.0))){return homeCrowd(id);}
    let a=id*2.39996;
    let guard=(floor(id/9.0)%${encounterRings.stride}.0)<.5;
    let r=select(sqrt((id%229.0)/229.0)*${encounterPacks.radius}.0,${encounterRings.guardMin}.0+sqrt((id%79.0)/79.0)*${encounterRings.guardSpan}.0,guard);
    let pack=floor(floor(id/9.0)/${encounterRings.stride}.0)%${encounterPacks.count}.0;
    let bearing=(pack+.5)*6.28318530718/${encounterPacks.count}.0;
    let offset=select(vec2f(cos(bearing),sin(bearing))*${encounterPacks.distance}.0,vec2f(0.0),guard);
    return site+offset+vec2f(cos(a),sin(a))*r;
  }
  ${spawnCrowdWGSL}`);
  const clear = Fn(() => {
    atomicStore(density.element(instanceIndex), uint(0));
    // Tail scratch slots preserve the eight-storage-buffer device limit.
    If(instanceIndex.lessThan(2),()=>{atomicStore(density.element(instanceIndex.add(16384)),uint(0));});
  })().compute(128 * 128);

  const snapshot = Fn(() => {
    const p = pos.element(instanceIndex);
    old.element(instanceIndex).assign(p);
    If(state.element(instanceIndex).x.greaterThan(0).and(inside(p.xz)), () => {
      atomicAdd(density.element(cellIndex(p.xz)), uint(1));
    });
  })().compute(h.count);

  const sim = Fn(() => {
    const id = instanceIndex;
    const a = old.element(id).toVar();
    const v = vel.element(id).toVar();
    const s = state.element(id).toVar();

    If(s.x.lessThanEqual(0), () => {
      If(v.w.lessThan(4), () => {
        v.y.subAssign(dt.mul(15));
        a.assign(vec4(a.xyz.add(v.xyz.mul(dt)), a.w.add(dt.mul(v.x).mul(.08))));
        const floorY = ground(a.xz).toVar();
        If(a.y.lessThan(floorY), () => {
          If(blood.element(id.mul(3)).w.lessThan(0),()=>{blood.element(id.mul(3)).assign(vec4(a.x,floorY.add(.045),a.z,time));});
          a.y.assign(floorY);
          v.y.assign(max(0, v.y.negate().mul(.22)));
          v.x.mulAssign(pow(.09, dt));
          v.z.mulAssign(pow(.09, dt));
        });
        v.w.addAssign(dt);
        pos.element(id).assign(a);
        vel.element(id).assign(v);
      });
      Return();
    });

    const guard=id.div(uint(9)).mod(uint(encounterRings.stride)).equal(uint(0));
    If(streaming.greaterThan(.5).and(guard.not()).and(length(a.xz.sub(goal.xz)).greaterThan(localCrowdRecycleDistance)).and(viewEnabled.lessThan(.5).or(outsideView(a.xyz,viewProjection))),()=>{
      // Choose only unoccupied navigation cells outside the current camera.
      // The same ID keeps its existing state, health and speed seed.
      Loop({start:uint(0),end:uint(16),type:'uint'},({i:attempt})=>{
        const q=localPosition(id,attempt,fieldOrigin).toVar(),point=vec3(q.x,ground(q),q.y).toVar();
        If(length(q.sub(goal.xz)).greaterThan(localCrowdClearance).and(flow.element(cellIndex(q)).w.lessThan(.5)).and(viewEnabled.lessThan(.5).or(outsideView(point,viewProjection))),()=>{
          pos.element(id).assign(vec4(point,0));vel.element(id).assign(vec4(0));Return();
        });
      });
    });
    If(streaming.greaterThan(.5).and(guard).and(length(a.xz.sub(goal.xz)).greaterThan(encounterRelocationDistance)),()=>{
      const q=relocate(float(id),goal.xz);a.assign(vec4(q.x,ground(q),q.y,0));v.assign(vec4(0));
      pos.element(id).assign(a);vel.element(id).assign(v);Return();
    });

    const damage = float(0).toVar();
    const impulse = vec3(0).toVar();
    const cause = uint(0).toVar();
    const heavy = step(1.5,s.w);
    const runner = step(.5,s.w).sub(heavy);
    const bodyScale = float(1).add(heavy.mul(.6));
    const center = a.xyz.add(vec3(0, bodyScale.mul(.95), 0)).toVar();
    for(let rayIndex=0;rayIndex<6;rayIndex++){
    const aim=rays.element(rayIndex);
    const along = dot(center.sub(shot.xyz), aim.xyz).toVar();
    const nearest = shot.xyz.add(aim.xyz.mul(clamp(along, 0, aim.w)));
    const rayDistance = length(center.sub(nearest).mul(vec3(1, .48, 1)));
    If(shot.w.greaterThan(0).and(along.greaterThan(0))
      .and(along.lessThan(aim.w)).and(rayDistance.lessThan(bodyScale.mul(.48))), () => {
      damage.addAssign(shot.w);
      impulse.addAssign(aim.xyz.mul(9).add(vec3(0, 3, 0)));
      cause.assign(uint(1));
      atomicAdd(counters.element(1), uint(1));
      s.z.assign(time.add(.09));
    });

    }
    for(let i=0;i<2;i++){
      const origin=defenseOrigins.element(i),aim=defenseRays.element(i),targetId=i===0?defenseIds.x:defenseIds.y;
      If(origin.w.greaterThan(0).and(float(id).equal(targetId)),()=>{
        const along=dot(center.sub(origin.xyz),aim.xyz),nearest=origin.xyz.add(aim.xyz.mul(clamp(along,0,aim.w)));
        If(along.greaterThan(0).and(along.lessThan(aim.w)).and(length(center.sub(nearest).mul(vec3(1,.48,1))).lessThan(bodyScale.mul(.48))),()=>{
          damage.addAssign(origin.w);impulse.addAssign(aim.xyz.mul(5).add(vec3(0,1,0)));cause.assign(7);s.z.assign(time.add(.09));
        });
      });
    }
    v.w.assign(max(0,v.w.sub(dt)));
    const shoveDelta=center.sub(melee.xyz).toVar();
    const shoveDistance=length(shoveDelta).toVar();
    If(melee.w.greaterThan(0).and(shoveDistance.lessThan(meleeAim.w))
      .and(dot(normalize(shoveDelta.add(.001)),meleeAim.xyz).greaterThan(.5))
      .and(flow.element(cellIndex(a.xz.add(melee.xz).mul(.5))).w.lessThan(.5)),()=>{
       damage.addAssign(melee.w);impulse.addAssign(normalize(vec3(shoveDelta.x,.1,shoveDelta.z)).mul(65));
       v.w.assign(.9);cause.assign(6);s.z.assign(time.add(.13));atomicAdd(counters.element(11),uint(1));
    });
    const blastDistance = length(center.sub(blast.xyz)).toVar();
    If(blast.w.greaterThan(0).and(blastDistance.lessThan(blast.w)), () => {
      damage.addAssign(float(1).sub(blastDistance.div(blast.w)).mul(200).add(90));
      impulse.addAssign(normalize(center.sub(blast.xyz).add(vec3(0, .1, 0)))
        .mul(blast.w.mul(.6).add(12)).add(vec3(0, 8, 0)));
      cause.assign(uint(blastType));
      s.z.assign(time.add(.15));
    });

    // Both physical vehicles remain lethal, independently of the occupied seat.
    for(const [body,before,skim,contactCounter,killCause] of [[car,carOld,0,4,2],[jet,jetOld,1,8,4]]){
      const travel=body.xyz.sub(before.xyz).toVar();
      const t=clamp(dot(center.sub(before.xyz),travel).div(max(dot(travel,travel),.001)),0,1);
      const point=before.xyz.add(travel.mul(t)).toVar();
      const distance=length(center.sub(point).mul(vec3(1,.4,1)));
      If(body.w.greaterThan(3).and(distance.lessThan(2+skim*2.2)).and(abs(center.y.sub(point.y)).lessThan(3)),()=>{
        damage.addAssign(max(35,body.w.mul(8+skim*6)));
        impulse.addAssign(normalize(travel.add(vec3(.001,0,0))).mul(body.w).mul(.75).add(vec3(0,5+skim*5,0)));
        cause.assign(uint(killCause));atomicAdd(counters.element(contactCounter),uint(1));s.z.assign(time.add(.1));
      });
    }

    If(damage.greaterThan(0),()=>{
      blood.element(id.mul(3).add(1)).assign(vec4(center,time));
      blood.element(id.mul(3).add(2)).assign(vec4(impulse.mul(.18),s.y.add(heavy)));
    });
    s.x.subAssign(damage);
    If(s.x.lessThanEqual(0), () => {
      atomicAdd(counters.element(0), uint(1));
      If(cause.notEqual(7),()=>{atomicAdd(counters.element(6), uint(float(1).add(heavy.mul(3))));});
      If(cause.equal(2), () => { atomicAdd(counters.element(2), uint(1)); });
      If(cause.equal(3), () => { atomicAdd(counters.element(3), uint(1)); });
      If(cause.equal(4), () => { atomicAdd(counters.element(7), uint(1)); });
      If(cause.equal(5), () => { atomicAdd(counters.element(12), uint(1)); });
      state.element(id).assign(s);
      vel.element(id).assign(vec4(impulse, 0));
      Return();
    });

    const k = cellIndex(a.xz).toVar();
    const direct = goal.xz.sub(a.xz).toVar();
    const distance = length(direct).toVar();
    const steer = normalize(direct.add(.001)).toVar();
    If(inside(a.xz),()=>{steer.assign(flow.element(k).xy);});
    If(distance.greaterThan(encounterPursuitDistance),()=>{steer.assign(vec2(sin(s.y.mul(91).add(time.mul(.05))),cos(s.y.mul(83).add(time.mul(.04)))).mul(.1));});
    If(distance.lessThan(8), () => { steer.assign(normalize(direct.add(.001))); });
    const left = float(atomicLoad(density.element(max(uint(1), k).sub(1))));
    const right = float(atomicLoad(density.element(min(uint(16382), k).add(1))));
    const front = float(atomicLoad(density.element(max(uint(128), k).sub(128))));
    const back = float(atomicLoad(density.element(min(uint(16255), k).add(128))));
    const local = float(0).toVar();If(inside(a.xz),()=>{local.assign(float(atomicLoad(density.element(k))));});
    If(inside(a.xz),()=>{steer.addAssign(clamp(vec2(left.sub(right), front.sub(back)).mul(.06), -1.3, 1.3));});
    steer.addAssign(vec2(sin(s.y.mul(65.1).add(time.mul(.35))),
      cos(s.y.mul(132.4).add(time.mul(.3)))).mul(.18));
    const speed = s.y.mul(.7).add(1.3).add(runner.mul(3.8)).sub(heavy.mul(.55))
      .mul(max(.24, float(1).sub(local.mul(.028))));
    const desired = normalize(steer.add(.001)).mul(speed).toVar();If(distance.greaterThan(encounterPursuitDistance),()=>{desired.mulAssign(.1);});
    const blend = min(1, dt.mul(6));
    If(v.w.greaterThan(0),()=>{v.x.mulAssign(pow(.08,dt));v.z.mulAssign(pow(.08,dt));}).Else(()=>{v.assign(vec4(mix(v.x, desired.x, blend), 0, mix(v.z, desired.y, blend), 0));});
    If(v.w.lessThanEqual(0).and(distance.lessThan(1.55)).and(abs(goal.y.sub(center.y)).lessThan(2.6)), () => {
      const contact=uint(dt.mul(1000).mul(float(1).add(heavy.mul(2))));
      atomicAdd(counters.element(5),contact);
      // Three ordinary attackers (or one heavy) can make contact together.
      // Bound each simulation frame, independent of CPU readback frequency.
      If(goal.w.lessThan(1.5),()=>{
        const seat=uint(step(.5,goal.w)),used=atomicAdd(density.element(seat.add(16384)),contact).toVar();
        const allowed=min(contact,uint(max(0,dt.mul(3000).sub(float(used)))));
        atomicAdd(counters.element(seat.add(9)),allowed);
      });
      const away = normalize(direct.add(.001)).mul(-.25);
      v.x.assign(away.x);
      v.z.assign(away.y);
    });
    If(damage.greaterThan(0),()=>{
      v.x.addAssign(impulse.x.mul(.18).div(bodyScale));
      v.z.addAssign(impulse.z.mul(.18).div(bodyScale));
    });

    const next = a.xz.add(v.xz.mul(dt)).toVar();
    If(inside(next).and(flow.element(cellIndex(next)).w.greaterThan(.5)), () => {
      next.assign(a.xz);
      const nx = a.xz.add(vec2(v.x.mul(dt), 0));
      const nz = a.xz.add(vec2(0, v.z.mul(dt)));
      If(flow.element(cellIndex(nx)).w.lessThan(.5), () => {
        next.assign(nx);
      }).ElseIf(flow.element(cellIndex(nz)).w.lessThan(.5), () => { next.assign(nz); });
    });
    a.assign(vec4(next.x, ground(next), next.y,
      atan(v.x.negate(), v.z.negate())));
    pos.element(id).assign(a);
    state.element(id).assign(s);
    vel.element(id).assign(v);
  })().compute(h.count);

  clear.name = 'HordeClear';
  snapshot.name = 'HordeSnapshot';
  sim.name = 'HordeSimulate';
  return {clear, snapshot, sim};
}
