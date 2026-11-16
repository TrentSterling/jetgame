import {height} from './terrain.js';
import {buildFarTerrain} from './far-terrain-data.js';
self.onmessage=({data:plan})=>{const {positions,indices}=buildFarTerrain(plan,height);self.postMessage({key:plan.key,positions,indices},[positions.buffer,indices.buffer]);};
