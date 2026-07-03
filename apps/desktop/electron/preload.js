const { contextBridge, ipcRenderer } = require('electron');

// 웹 페이지에서 window.electronAPI 로 접근 가능
contextBridge.exposeInMainWorld('electronAPI', {
  // 네이티브 알림 보내기
  notify: (payload) => ipcRenderer.send('notify', payload),

  // Electron 환경 여부 감지
  isElectron: true,

  // 네이티브 PPTX 파일 열기 (DLP 우회 - Node.js fs로 직접 읽음)
  openPptxFile: () => ipcRenderer.invoke('open-pptx-file'),

  // 기본 앱(예: PowerPoint)으로 파일 열기
  openFileInDefaultApp: (filePath) => ipcRenderer.invoke('open-file-in-default-app', filePath),
});
