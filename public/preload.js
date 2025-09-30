// File: public/preload.js

const { contextBridge, ipcRenderer } = require('electron');
// const fontList = require('font-list'); // ▼▼▼ [제거] 이 줄을 완전히 삭제합니다.

contextBridge.exposeInMainWorld('electronAPI', {
  // Main window to Main process
  send: (channel, ...args) => {
    const validChannels = ['start-capture', 'capture-region', 'close-capture-window'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  // Main process to Main window
  on: (channel, func) => {
    const validChannels = ['capture-complete'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return a cleanup function
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  // Main process to Main window (Invoke/Handle)
  getSystemFonts: () => ipcRenderer.invoke('get-system-fonts')
});