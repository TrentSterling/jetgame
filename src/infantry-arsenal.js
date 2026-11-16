// Additive earned sidearm. Carbine ammo remains owned by the legacy runtime.
export const BREACHER=Object.freeze({name:'BREACHER',capacity:6,reserveMax:18,range:24,damage:19,interval:.85,reloadSeconds:1.8,pellets:6});
export function validArsenal(s){return s===undefined||!!(s&&s.version===1&&typeof s.unlocked==='boolean'&&['carbine','breacher'].includes(s.selected)&&(s.selected!=='breacher'||s.unlocked)&&Number.isInteger(s.shells)&&s.shells>=0&&s.shells<=6&&Number.isInteger(s.reserve)&&s.reserve>=0&&s.reserve<=18&&Number.isFinite(s.reload)&&s.reload>=0&&s.reload<=1.8&&(s.unlocked||(s.shells===0&&s.reserve===0&&s.reload===0)));}
export class InfantryArsenal{
 constructor(){this.reset();}
 reset(){Object.assign(this,{version:1,unlocked:false,selected:'carbine',shells:0,reserve:0,reload:0});}
 restore(s){this.reset();if(s!==undefined){if(!validArsenal(s))throw Error('Invalid infantry arsenal');Object.assign(this,s);}}
 snapshot(){const {version,unlocked,selected,shells,reserve,reload}=this;return {version,unlocked,selected,shells,reserve,reload};}
 reward(){const first=!this.unlocked;this.unlocked=true;this.shells=6;this.reserve=18;this.reload=0;return first;}
 select(id,{mode='foot',dead=false,paused=false,carbineReload=0}={}){if(mode!=='foot'||dead||paused||carbineReload>0||this.reload>0||!['carbine','breacher'].includes(id)||(id==='breacher'&&!this.unlocked))return false;this.selected=id;return true;}
 beginReload(){if(!this.unlocked||this.shells>=6||this.reserve<=0||this.reload>0)return false;this.reload=1.8;return true;}
 tick(dt){if(this.reload<=0)return;this.reload=Math.max(0,this.reload-Math.max(0,dt));if(this.reload===0){const n=Math.min(6-this.shells,this.reserve);this.shells+=n;this.reserve-=n;}}
 fire(){if(this.reload>0)return false;if(this.shells<=0){this.beginReload();return false;}this.shells--;return true;}
}
// Fixed symmetric pattern gives repeatable close-range coverage without extra GPU work.
export function breacherPellet(i){const a=i*Math.PI/3;return {x:Math.cos(a)*.075,y:Math.sin(a)*.075};}
