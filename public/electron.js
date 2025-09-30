// File: public/electron.js

const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const url = require('url');
const isDev = require('electron-is-dev');
const fontList = require('font-list'); // ▼▼▼ [이동] font-list 모듈을 여기서 require 합니다.

let mainWindow;
let captureWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = isDev
    ? process.env.ELECTRON_START_URL || 'http://localhost:3000'
    : url.format({
        pathname: path.join(__dirname, '../build/index.html'),
        protocol: 'file:',
        slashes: true,
      });

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createCaptureWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    captureWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        alwaysOnTop: true,
        skipTaskbar: true,
    });

    captureWindow.loadFile(path.join(__dirname, 'capture.html'));
    captureWindow.setFullScreen(true);
    captureWindow.focus();
}

app.on('ready', createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});


ipcMain.on('start-capture', () => {
    if (!captureWindow || captureWindow.isDestroyed()) {
        createCaptureWindow();
    } else {
        captureWindow.show();
        captureWindow.focus();
    }
});

ipcMain.on('capture-region', async (event, rect) => {
    if (captureWindow) {
        captureWindow.hide();
    }

    try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: screen.getPrimaryDisplay().size });
        const primaryScreenSource = sources.find(source => source.display_id === String(screen.getPrimaryDisplay().id));
        
        if (primaryScreenSource) {
            const screenshotDataUrl = primaryScreenSource.thumbnail.toDataURL();
            if (mainWindow) {
                mainWindow.webContents.send('capture-complete', screenshotDataUrl, rect);
            }
        } else {
            console.error('Primary screen source not found.');
        }
    } catch (error) {
        console.error('Failed to capture screen:', error);
    }

    if (captureWindow && !captureWindow.isDestroyed()) {
        captureWindow.close();
        captureWindow = null;
    }
});

ipcMain.on('close-capture-window', () => {
    if (captureWindow && !captureWindow.isDestroyed()) {
        captureWindow.close();
        captureWindow = null;
    }
});

// ▼▼▼ [수정] 폰트 목록을 가져오는 로직이 이제 메인 프로세스에서 안전하게 실행됩니다.
ipcMain.handle('get-system-fonts', async () => {
    try {
        const fonts = await fontList.getFonts();
        const uniqueFonts = [...new Set(fonts.map(font => font.replace(/"/g, '')))];
        return uniqueFonts;
    } catch (error) {
        console.error('Failed to get system fonts:', error);
        return [];
    }
});