import {QUALITY_PROFILES} from './quality.js';
// The small menu remains usable while shaders are loading or graphics fails.
// It is outside the GPU HUD so it does not add another game render pass.
export function mountQualityMenu(profile,apply,retry=()=>location.reload()){
 const root=document.createElement('section');root.setAttribute('aria-label','Graphics quality');
 root.style.cssText='position:fixed;right:12px;top:12px;z-index:20;padding:10px 12px;max-width:min(320px,calc(100vw - 48px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;background:#111a22ee;color:#eee;font:13px system-ui;border:1px solid #64717c;border-radius:6px;';
 const label=document.createElement('label');label.textContent='Graphics ';const select=document.createElement('select');select.setAttribute('aria-label','Graphics profile');
 for(const p of Object.values(QUALITY_PROFILES)){const o=document.createElement('option');o.value=p.id;o.textContent=p.label;select.append(o);}select.value=profile.id;label.append(select);
 const button=document.createElement('button');button.textContent='Apply & reload';button.style.marginLeft='8px';
 const detail=document.createElement('p');detail.style.cssText='margin:8px 0 0;line-height:1.4';
 const failure=document.createElement('div');failure.hidden=true;failure.setAttribute('role','alert');
 const heading=document.createElement('p');heading.textContent='Graphics could not start or stopped working.';heading.style.fontWeight='bold';
 const errorText=document.createElement('p');errorText.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:30vh;overflow:auto';
 const recovery=document.createElement('p');recovery.textContent='Reload to retry from your last saved checkpoint. Unsaved progress may be lost.';
 const retryButton=document.createElement('button');retryButton.textContent='Retry';retryButton.addEventListener('click',()=>{if(retryButton.disabled)return;retryButton.disabled=true;try{retry();}catch(error){recovery.textContent='Reload failed. '+(error?.message||String(error));retryButton.disabled=false;}});
 failure.append(heading,errorText,recovery,retryButton);
 const describe=()=>{detail.textContent=select.value==='potato'?'Lower resolution, simpler 3D zombies and terrain. No shadows, dynamic lights or gore. All 12,000 enemies and progress stay intact.':'Full graphics. All 12,000 enemies and progress stay intact.';button.disabled=select.value===profile.id;};
 select.addEventListener('change',describe);root.addEventListener('keydown',e=>e.stopPropagation());root.addEventListener('mousedown',e=>e.stopPropagation());
 button.addEventListener('click',async()=>{button.disabled=select.disabled=true;detail.textContent='Saving progress and reloading…';try{await apply(select.value);}catch(error){detail.textContent=error.message||String(error);button.disabled=select.disabled=false;}});
 root.append(label,button,detail,failure);document.body.append(root);describe();
 return {update(screen){root.hidden=failure.hidden&&(screen==='game'||screen==='death');},showError(message){if(failure.hidden)errorText.textContent=message||'An unexpected graphics error occurred.';failure.hidden=false;root.hidden=false;},root};
}
