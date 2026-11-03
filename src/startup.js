// Keep the first failure, stop further submissions, and expose phase timings to
// browser tests. A failed backend must never become an enabled Play button.
export function startupUI(renderer, {onChange=()=>{},phaseCount=0}={}) {
  const state = window.HordeStartup = {phase:'Starting graphics',phaseDetail:'Preparing the game renderer.',phaseIndex:0,phaseCount:Math.max(0,Math.floor(phaseCount)),completed:0,progress:0,active:false,startedMs:performance.now(),ready:false,failed:false,phases:[],errors:[]};
  let device;
  const fail = error => {
    const message = error?.message || String(error);
    state.errors.push(message);
    if (state.failed) return;
    state.failed = true;
    state.ready = false;
    window.bootError = message;
    renderer.setAnimationLoop(null);
    state.error = message.split('\n').find(line => line.trim())?.slice(0,150) || 'GPU error';
    // Notify the CPU UI state, but never submit more work to a failed device.
    // A GPU-only interface cannot draw an error when its GPU has been lost.
    onChange(state);
    console.error(error?.stack||error);
  };
  const phase = async (label, work, validate=false, {detail=''}={}) => {
    if (state.failed) throw new Error(window.bootError);
    if (state.ready) throw new Error('Startup is already ready.');
    if (state.active) throw new Error('A startup phase is already active.');
    if (state.phaseCount&&state.completed>=state.phaseCount) throw new Error('All startup phases have completed.');
    state.phase = label;
    state.phaseDetail = detail;
    state.phaseIndex = state.completed+1;
    state.active = true;
    onChange(state);
    await new Promise(resolve => setTimeout(resolve,0));
    if (state.failed) { state.active=false; throw new Error(window.bootError); }
    const start = performance.now();
    let failure,scoped=false;
    try {
      if (validate) { device.pushErrorScope('validation'); scoped=true; }
      await work();
      if (validate) await device.queue.onSubmittedWorkDone();
    } catch (error) { failure = error; }
    if (scoped) {
      try {
        const error = await device.popErrorScope();
        if (error) failure ||= new Error(label+': '+error.message);
      } catch(error) { failure ||= error; }
    }
    state.active = false;
    state.phases.push({label,detail,ms:Math.round(performance.now()-start),passed:!failure&&!state.failed});
    if (failure) throw failure;
    if (state.failed) throw new Error(window.bootError);
    state.completed++;
    state.progress = state.phaseCount?state.completed/state.phaseCount:0;
    onChange(state);
  };
  return {
    state, phase, fail,
    attach(gpuDevice) {
      device = gpuDevice;
      device.addEventListener('uncapturederror', event => fail(event.error));
      device.lost.then(info => { if(info.reason!=='destroyed')fail(new Error('GPU connection lost. Reload to retry. '+info.message)); });
    },
    ready() {
      if (state.failed) throw new Error(window.bootError);
      if (state.active||state.phaseCount&&state.completed!==state.phaseCount) throw new Error('Startup phases are not complete.');
      if (state.ready) return;
      state.ready = true;
      state.phase = 'Ready';
      state.phaseDetail = 'Your expedition is ready.';
      state.progress = 1;
      state.readyMs = Math.round(performance.now());
      onChange(state);
    },
  };
}

// Startup draws warm real scene resources without exposing an incomplete
// battlefield on the canvas. Keep this callback synchronous; never retain a
// private target across an await or the loading UI could render into it.
export function withStartupRenderTarget(renderer,target,work) {
  const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
  try { renderer.setRenderTarget(target); return work(); }
  finally { renderer.setRenderTarget(previous,face,mip); }
}
