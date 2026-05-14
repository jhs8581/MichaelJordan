const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 개발 중에는 localhost:3000, 배포 시에는 Vercel URL 사용
const START_URL = process.env.ELECTRON_START_URL || 'https://mjchat.vercel.app';

// ── IPC: 네이티브 파일 열기 (DLP 우회) ────────────────────
ipcMain.handle('open-pptx-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'PPT 파일 열기',
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    filePath,
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
});

ipcMain.handle('open-file-in-default-app', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: '잘못된 파일 경로입니다.' };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: '파일을 찾을 수 없습니다.' };
  }

  const errorMessage = await shell.openPath(filePath);
  if (errorMessage) {
    return { ok: false, error: errorMessage };
  }
  return { ok: true };
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '마이클조던',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true, // 메뉴바 숨김 (깔끔한 채팅앱 느낌)
    show: false,           // 로딩 완료 후 표시
  });

  mainWindow.loadURL(START_URL);

  // 로딩 완료 후 창 표시 (흰 화면 깜빡임 방지)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 창 닫기 → 시스템 트레이로 최소화
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  // 트레이 아이콘 (아이콘 파일이 없으면 빈 이미지 사용)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '열기',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('마이클조던');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// 단일 인스턴스 강제 (중복 실행 방지)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 트레이 앱이므로 창이 모두 닫혀도 종료하지 않음
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 웹에서 Electron으로 알림 받기 (preload를 통해 ipcMain 활용)
ipcMain.on('notify', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});
