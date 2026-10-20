import * as T from 'three/webgpu';
import {sweepSolidBody} from './aircraft-collision.js';
const STEP=1/120,GRAVITY=17;
const v=new T.Vector3(),arm=new T.Vector3(),cross=new T.Vector3(),iv=new T.Vector3(),contact=new T.Vector3(),tangent=new T.Vector3(),normal=new T.Vector3(),q=new T.Quaternion(),matrix=new T.Matrix4();
function tensor(axis,diagonal){const r=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(axis)),d=new T.Matrix3().set(diagonal.x,0,0,0,diagonal.y,0,0,0,diagonal.z);return r.clone().multiply(d).multiply(r.transpose());}
function inverseApply(p,vector,out){return out.copy(vector).applyQuaternion(p.inverseQ).multiply(p.inverseInertia).applyQuaternion(p.mesh.quaternion);}
function sync(p){p.offset.copy(p.localCenter).multiply(p.mesh.scale).applyQuaternion(p.mesh.quaternion);p.mesh.position.copy(p.position).sub(p.offset);}
function extents(p){const e=matrix.makeRotationFromQuaternion(p.mesh.quaternion).elements,h=p.half;p.extent.set(Math.abs(e[0])*h.x+Math.abs(e[4])*h.y+Math.abs(e[8])*h.z,Math.abs(e[1])*h.x+Math.abs(e[5])*h.y+Math.abs(e[9])*h.z,Math.abs(e[2])*h.x+Math.abs(e[6])*h.y+Math.abs(e[10])*h.z);return p.extent;}

export function initializeWreck(parts,velocity,options={}){
 const random=options.random||Math.random,omega=new T.Vector3().copy(options.angularVelocity||{x:0,y:0,z:0}),base=velocity.clone(),n=new T.Vector3().copy(options.normal||{x:0,y:0,z:0});
 if(n.lengthSq()>.5&&options.impactSpeed>0)base.addScaledVector(n.normalize(),Math.min(8,options.impactSpeed*.12));
 let totalMass=0;const center=new T.Vector3(),meanKick=new T.Vector3(),spinMomentum=new T.Vector3(),pointInertia=new T.Matrix3().set(0,0,0,0,0,0,0,0,0),ownInertia=pointInertia.clone();
 for(const p of parts){p.mesh.geometry.computeBoundingBox();const b=p.mesh.geometry.boundingBox;p.localCenter=b.getCenter(new T.Vector3());p.half=b.getSize(new T.Vector3()).multiply(p.mesh.scale).multiplyScalar(.5);p.half.set(Math.max(.015,Math.abs(p.half.x)),Math.max(.015,Math.abs(p.half.y)),Math.max(.015,Math.abs(p.half.z)));p.offset=p.localCenter.clone().multiply(p.mesh.scale).applyQuaternion(p.mesh.quaternion);p.position=p.mesh.position.clone().add(p.offset);p.mass=Math.max(.025,Math.min(15,8*p.half.x*p.half.y*p.half.z));p.inertia=new T.Vector3(p.half.y**2+p.half.z**2,p.half.x**2+p.half.z**2,p.half.x**2+p.half.y**2).multiplyScalar(p.mass/3);p.inverseInertia=new T.Vector3(1/p.inertia.x,1/p.inertia.y,1/p.inertia.z);p.inverseQ=p.mesh.quaternion.clone().invert();p.extent=new T.Vector3();p.remainder=0;p.restTime=0;p.sleeping=false;p.physics=true;totalMass+=p.mass;center.addScaledVector(p.position,p.mass);}
 center.multiplyScalar(1/totalMass);
 // Flight velocity belongs to the aircraft root. Its centre of mass can be
 // offset from that root, so a turning aircraft carries additional COM motion.
 if(options.origin)base.add(new T.Vector3().crossVectors(omega,center.clone().sub(options.origin)));
 for(const p of parts){p.radius=p.position.clone().sub(center);p.kick=p.radius.clone().normalize().multiplyScalar((1.2+random()*1.8)/Math.pow(p.mass,.12)).add(new T.Vector3(random()-.5,random()-.5,random()-.5));p.jitter=new T.Vector3(random()*2-1,random()*2-1,random()*2-1).multiplyScalar(1.8/Math.pow(p.mass,.15));meanKick.addScaledVector(p.kick,p.mass);const r=p.radius,m=p.mass,e=pointInertia.elements;e[0]+=m*(r.y*r.y+r.z*r.z);e[4]+=m*(r.x*r.x+r.z*r.z);e[8]+=m*(r.x*r.x+r.y*r.y);e[1]-=m*r.x*r.y;e[3]-=m*r.x*r.y;e[2]-=m*r.x*r.z;e[6]-=m*r.x*r.z;e[5]-=m*r.y*r.z;e[7]-=m*r.y*r.z;const inertia=tensor(p.mesh.quaternion,p.inertia);spinMomentum.add(p.jitter.clone().applyMatrix3(inertia));for(let i=0;i<9;i++)ownInertia.elements[i]+=inertia.elements[i];}
 meanKick.multiplyScalar(1/totalMass);const torque=new T.Vector3();for(const p of parts){p.kick.sub(meanKick);torque.add(p.radius.clone().cross(p.kick).multiplyScalar(p.mass));}
 const correction=Math.abs(pointInertia.determinant())>1e-12?torque.applyMatrix3(pointInertia.invert()):new T.Vector3(),spinCorrection=Math.abs(ownInertia.determinant())>1e-12?spinMomentum.applyMatrix3(ownInertia.invert()):new T.Vector3();
 for(const p of parts){p.kick.sub(new T.Vector3().crossVectors(correction,p.radius));p.vel=base.clone().add(new T.Vector3().crossVectors(omega,p.radius)).add(p.kick);p.spin=omega.clone().add(p.jitter).sub(spinCorrection);delete p.kick;delete p.jitter;sync(p);}
 return {mass:totalMass,center:center.toArray(),velocity:base.toArray(),angularVelocity:omega.toArray()};
}

function impulse(p,n,restitution,friction){
 // A support point of the oriented bounds, with a face centre on tied axes.
 arm.copy(n).negate().applyQuaternion(p.inverseQ);arm.set(Math.sign(arm.x)*p.half.x,Math.sign(arm.y)*p.half.y,Math.sign(arm.z)*p.half.z).applyQuaternion(p.mesh.quaternion);
 contact.crossVectors(p.spin,arm).add(p.vel);const vn=contact.dot(n);if(vn>=0)return;
 cross.crossVectors(arm,n);inverseApply(p,cross,iv);const denominator=1/p.mass+cross.crossVectors(iv,arm).dot(n),j=-(1+(vn< -1.5?restitution:0))*vn/Math.max(1e-8,denominator);
 p.vel.addScaledVector(n,j/p.mass);cross.crossVectors(arm,n).multiplyScalar(j);inverseApply(p,cross,iv);p.spin.add(iv);
 contact.crossVectors(p.spin,arm).add(p.vel);tangent.copy(contact).addScaledVector(n,-contact.dot(n));const speed=tangent.length();if(speed>1e-8){tangent.multiplyScalar(1/speed);cross.crossVectors(arm,tangent);inverseApply(p,cross,iv);const mass=1/p.mass+cross.crossVectors(iv,arm).dot(tangent),jt=Math.min(friction*j,speed/Math.max(1e-8,mass));p.vel.addScaledVector(tangent,-jt/p.mass);cross.crossVectors(arm,tangent).multiplyScalar(-jt);inverseApply(p,cross,iv);p.spin.add(iv);}
 if(p.spin.lengthSq()>400)p.spin.setLength(20);
}
export function stepWreck(p,dt,ground,obstacles){
 if(p.sleeping)return;p.remainder+=Math.min(dt,.25);
 while(p.remainder+1e-10>=STEP){p.remainder=Math.max(0,p.remainder-STEP);const angular=p.spin.length();if(angular>1e-9){q.setFromAxisAngle(v.copy(p.spin).multiplyScalar(1/angular),angular*STEP);p.mesh.quaternion.premultiply(q).normalize();}p.inverseQ.copy(p.mesh.quaternion).invert();const h=extents(p),shape=[-h.x,-h.y,-h.z,h.x,h.y,h.z],dx=p.vel.x*STEP,dy=p.vel.y*STEP-GRAVITY*STEP*STEP/2,dz=p.vel.z*STEP;p.vel.y-=GRAVITY*STEP;
  const hit=sweepSolidBody(p.position,{x:dx,y:dy,z:dz},[shape],obstacles,ground,ground(p.position.x,p.position.z)+h.y+.01);if(hit.hit)impulse(p,normal.set(hit.normal.x,hit.normal.y,hit.normal.z),.18,.32);
  let supported=hit.blockedY&&hit.normal.y>0;const floor=ground(p.position.x,p.position.z)+h.y+.01;if(p.position.y<=floor+.001){p.position.y=Math.max(floor,p.position.y);const gx=(ground(p.position.x+.15,p.position.z)-ground(p.position.x-.15,p.position.z))/.3,gz=(ground(p.position.x,p.position.z+.15)-ground(p.position.x,p.position.z-.15))/.3;impulse(p,normal.set(-gx,1,-gz).normalize(),.18,.5);supported=true;}
  p.vel.multiplyScalar(Math.exp(-.025*STEP));p.spin.multiplyScalar(Math.exp(-(supported?1.7:.06)*STEP));if(supported&&p.vel.lengthSq()<.03&&p.spin.lengthSq()<.08)p.restTime+=STEP;else p.restTime=0;if(p.restTime>.35){p.sleeping=true;p.vel.set(0,0,0);p.spin.set(0,0,0);break;}
 }
 sync(p);
}
