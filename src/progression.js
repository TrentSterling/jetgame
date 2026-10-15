export class Progression {
  constructor() { this.reset(); }
  reset() { this.earned=0;this.spent=0;this.rewards=0;this.levels={foot:0,car:0,jet:0}; }
  sync(earned) { this.earned=Math.max(this.earned,earned||0); }
  get scrap() { return this.earned+this.rewards-this.spent; }
  cost(mode) { return this.levels[mode]>=3?Infinity:80+120*this.levels[mode]; }
  buy(mode) {
    if(!(mode in this.levels)||this.scrap<this.cost(mode))return false;
    this.spent+=this.cost(mode);this.levels[mode]++;return true;
  }
  get magazine() { return 32+this.levels.foot*8; }
  get rifleDamage() { return 52+this.levels.foot*20; }
  get rifleInterval() { return .105*Math.pow(.88,this.levels.foot); }
  get torque() { return 1+this.levels.car*.25; }
  get plow() { return 1+this.levels.car*.2; }
  get bombCapacity() { return 6+this.levels.jet; }
  get blastRadius() { return 13+this.levels.jet*2; }
  get rearmSeconds() { return 7/(1+this.levels.jet*.25); }
}
