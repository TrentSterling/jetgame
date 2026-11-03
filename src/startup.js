// Keep the first failure, stop further submissions, and expose phase timings to
// browser tests. A failed backend must never become an enabled Play button.
export function startupUI(renderer, {onChange=()=>{}}={}) {
  const state = window.HordeStartup = {phase:'Loading',ready:false,failed:false,phases:[],errors:[]};
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
  const phase = async (label, work, validate=false) => {
    if (state.failed) throw new Error(window.bootError);
    state.phase = label;
    onChange(state);
    await new Promise(resolve => setTimeout(resolve,0));
    const start = performance.now();
    if (validate) device.pushErrorScope('validation');
    let failure;
    try {
      await work();
      if (validate) await device.queue.onSubmittedWorkDone();
    } catch (error) { failure = error; }
    if (validate) {
      const error = await device.popErrorScope();
      if (error) failure ||= new Error(label+': '+error.message);
    }
    state.phases.push({label,ms:Math.round(performance.now()-start)});
    if (failure) throw failure;
    if (state.failed) throw new Error(window.bootError);
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
      state.ready = true;
      state.phase = 'Ready';
      state.readyMs = Math.round(performance.now());
      onChange(state);
    },
  };
}
