export const CLUSTER_UNLOCK=Object.freeze({cost:600,name:'CLUSTER WARHEADS'});
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
export const defaultEquipment=()=>({version:1,cluster:false,missiles:'standard'});
export function validEquipment(value){
  return value===undefined||!!value&&value.version===1&&typeof value.cluster==='boolean'&&['standard','cluster'].includes(value.missiles)&&(value.missiles!=='cluster'||value.cluster);
}
export function restoreEquipment(value){
  if(!validEquipment(value))throw Error('Invalid missile equipment');
  return value===undefined?defaultEquipment():{version:1,cluster:value.cluster,missiles:value.missiles};
}

export class Progression {
  constructor() { this.reset(); }
  reset() { this.earned=0;this.spent=0;this.rewards=0;this.levels={foot:0,car:0,jet:0};this.equipment=defaultEquipment(); }
  sync(earned) { if(Number.isFinite(earned))this.earned=Math.max(this.earned,earned,0); }
  get scrap() { return this.earned+this.rewards-this.spent; }
  cost(mode) { return !own(this.levels,mode)||this.levels[mode]>=3?Infinity:80+120*this.levels[mode]; }
  buy(mode) {
    if(!own(this.levels,mode)||this.scrap<this.cost(mode))return false;
    this.spent+=this.cost(mode);this.levels[mode]++;return true;
  }
  // One synchronous purchase changes ownership, selection and currency together.
  // Repeated calls cannot spend twice. Input/UI choose whether to toggle later.
  buyCluster() {
    if(this.equipment.cluster||this.scrap<CLUSTER_UNLOCK.cost)return false;
    this.spent+=CLUSTER_UNLOCK.cost;this.equipment.cluster=true;this.equipment.missiles='cluster';return true;
  }
  toggleMissiles() {
    if(!this.equipment.cluster)return false;
    this.equipment.missiles=this.equipment.missiles==='cluster'?'standard':'cluster';return true;
  }
  get missileWarhead() { return this.equipment.cluster&&this.equipment.missiles==='cluster'?'cluster':'standard'; }
  get magazine() { return 32+this.levels.foot*8; }
  get rifleDamage() { return 68+this.levels.foot*22; }
  get rifleInterval() { return .105*Math.pow(.88,this.levels.foot); }
  get torque() { return 1+this.levels.car*.25; }
  get plow() { return 1+this.levels.car*.2; }
  get bombCapacity() { return 6+this.levels.jet; }
  get blastRadius() { return 13+this.levels.jet*2; }
  get rearmSeconds() { return 7/(1+this.levels.jet*.25); }
}
