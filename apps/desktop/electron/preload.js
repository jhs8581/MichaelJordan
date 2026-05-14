const { contextBridge, ipcRenderer } = require('electron');

// 웹 페이지에서 window.electronAPI 로 접근 가능
contextBridge.exposeInMainWorld('electronAPI', {
  // 네이티브 알림 보내기
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),

  // Electron 환경 여부 감지
  isElectron: true,
});
