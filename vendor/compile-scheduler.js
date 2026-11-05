// The Three fork used to wait after every shader stage and render object,
// including cache hits. Budget those cooperative pauses by CPU time instead.
// This changes scheduling only: every stage, pipeline and validation still runs.
export function createCompilationYield(yieldTask, now=()=>performance.now(), budgetMs=8) {
  let resumedAt=now(), pending=null;
  return function yieldForCompilation() {
    if (pending) return pending;
    if (now()-resumedAt<budgetMs) return;
    pending=Promise.resolve().then(yieldTask).finally(()=>{
      resumedAt=now();
      pending=null;
    });
    return pending;
  };
}
