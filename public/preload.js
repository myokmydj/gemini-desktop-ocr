const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel, func) => {
    const subscription = (event, ...args) => func(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  // ▼▼▼ [추가] 시스템 폰트를 요청하는 함수 노출 ▼▼▼
  getSystemFonts: () => ipcRenderer.invoke('get-system-fonts')
});