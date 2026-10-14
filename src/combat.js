// Mounted weapons follow the hull over grades; reticle and projectiles share it.
export function carWeaponDirection(body,bias=-.018){const pitch=Math.max(-.65,Math.min(.65,(body.pitch||0)+bias)),c=Math.cos(pitch);return {x:-Math.sin(body.yaw)*c,y:Math.sin(pitch),z:-Math.cos(body.yaw)*c};}
export class Combat{
 constructor(){this.reset();}
 reset(){this.stamina=1;this.shoveDelay=0;this.recoverDelay=0;this.shoveAnimation=0;this.shoves=0;this.missilesFired=0;this.missileDelay={car:0,jet:0};this.ammo={car:6,jet:10};this.reload={car:0,jet:0};}
 update(dt){this.shoveDelay=Math.max(0,this.shoveDelay-dt);this.recoverDelay=Math.max(0,this.recoverDelay-dt);this.shoveAnimation=Math.max(0,this.shoveAnimation-dt*3.5);if(!this.recoverDelay)this.stamina=Math.min(1,this.stamina+dt*.22);
  for(const mode of ['car','jet']){this.missileDelay[mode]=Math.max(0,this.missileDelay[mode]-dt);const cap=mode==='car'?6:10;if(this.ammo[mode]<cap){this.reload[mode]+=dt;if(this.reload[mode]>(mode==='car'?2.4:1.6)){this.ammo[mode]++;this.reload[mode]=0;}}else this.reload[mode]=0;}
 }
 shove(){if(this.shoveDelay>0||this.stamina<.28)return false;this.stamina-=.28;this.shoveDelay=.43+(1-this.stamina)*.3;this.recoverDelay=1.15;this.shoveAnimation=1;this.shoves++;return true;}
 missile(mode){if(this.missileDelay[mode]>0||this.ammo[mode]<1)return 0;const count=Math.min(this.ammo[mode],mode==='jet'?2:1);this.ammo[mode]-=count;this.missileDelay[mode]=mode==='car'?.42:.38;this.missilesFired+=count;return count;}
}
