// Keep the first failure, stop further submissions, and expose phase timings to
// browser tests. A failed backend must never become an enabled Play button.
export function startupUI(renderer) {
  const button = document.getElementById('play');
  const gate = document.getElementById('gate');
  const hint = gate.querySelector('div');
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
    gate.hidden = false;
    button.disabled = false;
    button.textContent = 'Startup failed · Click to reload';
    hint.textContent = message.split('\n').find(line => line.trim())?.slice(0,150) || 'GPU error';
    hint.title = message;
    console.error(error?.stack||error);
  };
  const phase = async (label, work, validate=false) => {
    if (state.failed) throw new Error(window.bootError);
    state.phase = label;
    button.textContent = label+'…';
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
      button.disabled = false;
      button.textContent = 'Enter battlefield';
      hint.textContent = 'WASD + mouse · Click to capture cursor';
    },
  };
}
