'use strict';
const { parentPort, workerData } = require('worker_threads');
const { scan } = require('./scanner');

let stop = false;
parentPort.on('message', (m) => { if (m === 'stop') stop = true; });

scan(workerData.roots, {
  shouldStop: () => stop,
  onProgress: (p) => parentPort.postMessage({ type: 'progress', p }),
}).then(
  (r) => parentPort.postMessage({ type: 'done', r }),
  (e) => parentPort.postMessage({ type: 'error', message: String((e && e.stack) || e) }),
);
