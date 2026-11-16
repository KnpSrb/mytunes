// MyTunes — оболочка Electron для Windows.
// Загружает тот же index.html; данные (IndexedDB, localStorage) хранятся в %APPDATA%\MyTunes.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let win;

// Только один экземпляр приложения: повторный запуск фокусирует уже открытое окно
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Разрешаем звук без жеста пользователя (восстановление воспроизведения) и медиаклавиши
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 360, minHeight: 500,
    backgroundColor: '#121212',
    title: 'MyTunes',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Внешние ссылки открываем в браузере, а не внутри приложения
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // Запрещаем уход со страницы (например, если файл бросили мимо зоны загрузки)
  win.webContents.on('will-navigate', e => e.preventDefault());
  // F12 / Ctrl+Shift+I — инструменты разработчика, Ctrl+R — перезагрузка
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i')) win.webContents.toggleDevTools();
    if (i.control && i.key.toLowerCase() === 'r') win.reload();
    if (i.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
