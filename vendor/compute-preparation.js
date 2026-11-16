// Narrow, version-pinned cold-compute preparation for this bundled renderer.
// Compilation never dispatches or changes the simulation's storage buffers.
const preparations = new WeakMap();

export function assertComputePrepared(renderer) {
  const records = preparations.get(renderer);
  for (const record of records?.values() || []) {
    if (record.status !== 'ready') throw new Error('Compute preparation is not ready.');
  }
}

export function cancelComputePreparations(renderer) {
  const records = preparations.get(renderer);
  if (!records) return;
  for (const record of [...records.values()]) record.dispose();
  preparations.delete(renderer);
}

export function prepareCompute(renderer, node) {
  if (!node?.isComputeNode) return Promise.reject(new Error('Expected a single compute node.'));
  if (!renderer._initialized || renderer._isDeviceLost) return Promise.reject(new Error('Renderer is not available for compute preparation.'));
  const backend = renderer.backend, device = backend.device;
  // Only compatibility route: select the original synchronous boot before any
  // cache/lifecycle changes if the native async API is genuinely absent.
  if (!backend.isWebGPUBackend || typeof device?.createComputePipelineAsync !== 'function') return Promise.resolve(false);
  let records = preparations.get(renderer);
  if (!records) preparations.set(renderer, records = new Map());
  const prior = records.get(node);
  if (prior) return prior.promise;
  if (records.size) return Promise.reject(new Error('Only one cold compute preparation per renderer is supported.'));
  const pipelines = renderer._pipelines, bindings = renderer._bindings, nodes = renderer._nodes;
  if (pipelines.has(node)) return Promise.reject(new Error('Compute preparation requires an unused node.'));
  const version = node.version;
  const oldPipelines = new Set(pipelines.caches.values()), oldPrograms = new Set(pipelines.programs.compute.values());
  let cleaned = false, rejectCancelled;
  const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
  const record = {status:'pending', promise:null, dispose:null};
  const token = {promises:[], isCurrent:() => record.status === 'pending' && node.version === version && !renderer._isDeviceLost && renderer._pipelines === pipelines};
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    node.removeEventListener('dispose', record.dispose);
    // Only this node's references are released. Shared stages/pipelines stay.
    if (pipelines.has(node)) pipelines.delete(node);
    if (bindings.has(node)) bindings.deleteForCompute(node);
    if (nodes.has(node)) nodes.delete(node);
    // A synchronous builder failure can precede reference-count publication.
    for (const pipeline of pipelines.caches.values()) if (!oldPipelines.has(pipeline) && pipeline.usedTimes === 0) pipelines._releasePipeline(pipeline);
    for (const program of pipelines.programs.compute.values()) if (!oldPrograms.has(program) && program.usedTimes === 0) pipelines._releaseProgram(program);
  };
  record.dispose = () => {
    record.status = 'disposed';
    clean();
    records.delete(node);
    rejectCancelled(new Error('Compute preparation was disposed.'));
  };
  // Publish the promise before invoking user onInit code; re-entrancy shares it.
  record.promise = Promise.resolve().then(async () => {
    if (!token.isCurrent()) throw new Error('Compute preparation became invalid.');
    node.addEventListener('dispose', record.dispose);
    if (node.onInitFunction !== null) node.onInitFunction.call(node, {renderer});
    if (!token.isCurrent()) throw new Error('Compute preparation became invalid.');
    nodes.updateForCompute(node);
    bindings.updateForCompute(node);
    pipelines.getForCompute(node, bindings.getForCompute(node), token);
    if (token.promises.length !== 1) throw new Error('Expected one asynchronous compute pipeline.');
    await Promise.race([Promise.all(token.promises), cancelled, device.lost.then(() => { throw new Error('GPU device lost during compute preparation.'); })]);
    if (!token.isCurrent()) throw new Error('Compute preparation became invalid.');
    record.status = 'ready';
    return true;
  }).catch(error => {
    record.status = 'failed';
    clean();
    throw error;
  });
  // A disposal before the microtask starts must still have a rejection observer.
  cancelled.catch(() => {});
  records.set(node, record);
  return record.promise;
}
