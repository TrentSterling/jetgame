import {QUALITY_PROFILES} from './quality.js';
// The small menu remains usable while shaders are loading or graphics fails.
// It is outside the GPU HUD so it does not add another game render pass.
export function mountQualityMenu(profile,apply){
 const root=document.createElement('section');root.setAttribute('aria-label','Graphics quality');
 root.style.cssText='position:fixed;right:12px;top:12px;z-index:20;padding:10px 12px;max-width:min(320px,calc(100vw - 48px));background:#111a22ee;color:#eee;font:13px system-ui;border:1px solid #64717c;border-radius:6px;';
 const label=document.createElement('label');label.textContent='Graphics ';const select=document.createElement('select');select.setAttribute('aria-label','Graphics profile');
 for(const p of Object.values(QUALITY_PROFILES)){const o=document.createElement('option');o.value=p.id;o.textContent=p.label;select.append(o);}select.value=profile.id;label.append(select);
 const button=document.createElement('button');button.textContent='Apply & reload';button.style.marginLeft='8px';
 const detail=document.createElement('p');detail.style.cssText='margin:8px 0 0;line-height:1.4';
 const describe=()=>{detail.textContent=select.value==='potato'?'Lower resolution, simpler 3D zombies and terrain. No shadows, dynamic lights or gore. All 12,000 enemies and progress stay intact.':'Full graphics. All 12,000 enemies and progress stay intact.';button.disabled=select.value===profile.id;};
 select.addEventListener('change',describe);root.addEventListener('keydown',e=>e.stopPropagation());root.addEventListener('mousedown',e=>e.stopPropagation());
 button.addEventListener('click',async()=>{button.disabled=select.disabled=true;detail.textContent='Saving progress and reloading…';try{await apply(select.value);}catch(error){detail.textContent=error.message||String(error);button.disabled=select.disabled=false;}});
 root.append(label,button,detail);document.body.append(root);describe();
 return {update(screen){root.hidden=screen==='game'||screen==='death';},root};
}
