// Мост между страницей и Electron: только нужные функции, без доступа к Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mtApp', {
  version: () => ipcRenderer.invoke('version'),
  // страница готова — вернуть файлы, с которыми приложение было запущено
  ready: () => ipcRenderer.invoke('ready'),
  check: () => ipcRenderer.invoke('update-check'),
  install: () => ipcRenderer.invoke('update-install'),
  openUrl: url => ipcRenderer.invoke('open-url', url),
  onOpenFiles: cb => ipcRenderer.on('open-files', (_e, list) => cb(list)),
  onUpdate: cb => ipcRenderer.on('update', (_e, u) => cb(u)),
});
