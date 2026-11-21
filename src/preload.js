'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (fn) => {
  const h = (_e, v) => fn(v);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('capri', {
  drives: () => ipcRenderer.invoke('drives'),
  scan: (roots) => ipcRenderer.invoke('scan:start', roots),
  cancel: () => ipcRenderer.invoke('scan:cancel'),
  onProgress: on('scan:progress'),
  onDone: on('scan:done'),
  onError: on('scan:error'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  trash: (paths) => ipcRenderer.invoke('trash', paths),
  clean: (paths) => ipcRenderer.invoke('clean', paths),
  remove: (paths) => ipcRenderer.invoke('delete', paths),
  emptyTrash: () => ipcRenderer.invoke('emptyTrash'),
  cleanmgr: () => ipcRenderer.invoke('cleanmgr'),
  uninstall: (src) => ipcRenderer.invoke('uninstall', src),
  version: () => ipcRenderer.invoke('app:version'),
  onUpdate: on('update'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
