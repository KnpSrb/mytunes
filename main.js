// MyTunes — оболочка Electron для Windows.
// Загружает тот же index.html; данные (IndexedDB, localStorage) хранятся в %APPDATA%\MyTunes.
const { app, BrowserWindow, Menu, shell, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');

// Откуда берутся обновления (публичные релизы на GitHub)
const RELEASES = { owner: 'KnpSrb', repo: 'mytunes' };
const AUDIO = /\.(mp3|wav|ogg|oga|flac|m4a|aac)$/i;

let win, rendererReady = false, pending = [], flushTimer = null;

// Отдельный профиль для разработки и тестов (не трогает настоящую медиатеку)
if (process.env.MYTUNES_PROFILE) app.setPath('userData', process.env.MYTUNES_PROFILE);

/* ---------- «Открыть с помощью MyTunes» ---------- */
// Аудиофайлы из аргументов командной строки (двойной клик в проводнике передаёт путь к файлу)
const argFiles = argv => argv.filter(a => AUDIO.test(a) && !a.startsWith('-') && fs.existsSync(a));

// Читаем файлы и прикладываем .lrc с тем же именем, если он лежит рядом
function readFiles(paths) {
  const out = [], seen = new Set();
  const push = p => { const k = p.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push({ name: path.basename(p), data: fs.readFileSync(p) }); };
  for (const p of paths) {
    try { push(p); const lrc = p.replace(/\.[^.\\/]+$/, '.lrc'); if (fs.existsSync(lrc)) push(lrc); }
    catch (e) { console.error('Не удалось прочитать', p, e); }
  }
  return out;
}

// При выделении нескольких файлов Windows запускает приложение для каждого —
// собираем их за 400 мс в одну пачку, чтобы они встали в очередь вместе
function queueFiles(paths) {
  if (!paths.length) return;
  pending.push(...paths);
  if (!rendererReady) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { const p = pending; pending = []; win.webContents.send('open-files', readFiles(p)); }, 400);
}

/* ---------- Обновления ---------- */
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;
let updater = null;
const send = u => { if (win && !win.isDestroyed()) win.webContents.send('update', u); };
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

function setupUpdater() {
  // Установленная версия обновляется сама (electron-updater); переносная — только сообщает о новой версии
  if (!app.isPackaged || isPortable) return;
  try { updater = require('electron-updater').autoUpdater; } catch (e) { console.error(e); return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => send({ state: 'checking' }));
  updater.on('update-available', i => send({ state: 'available', version: i.version }));
  updater.on('update-not-available', () => send({ state: 'none' }));
  updater.on('download-progress', p => send({ state: 'downloading', percent: p.percent }));
  updater.on('update-downloaded', i => send({ state: 'ready', version: i.version }));
  updater.on('error', e => { console.error(e); send({ state: 'error' }); });
}

async function checkPortable() {
  send({ state: 'checking' });
  try {
    const r = await net.fetch(`https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases/latest`,
      { headers: { 'User-Agent': 'MyTunes-App', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), v = String(j.tag_name || '').replace(/^v/, '');
    send(newer(v, app.getVersion()) ? { state: 'portable', version: v, url: j.html_url } : { state: 'none' });
  } catch (e) { console.error(e); send({ state: 'error' }); }
}

function checkUpdates() {
  if (!app.isPackaged) return send({ state: 'dev' });
  if (updater) updater.checkForUpdates().catch(() => send({ state: 'error' }));
  else checkPortable();
}

/* ---------- Окно ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 360, minHeight: 500,
    backgroundColor: '#121212',
    title: 'MyTunes',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
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
    if (i.control && i.key.toLowerCase() === 'r') { rendererReady = false; win.reload(); }
    if (i.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

// Только один экземпляр приложения: повторный запуск фокусирует окно и передаёт ему файлы
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    queueFiles(argFiles(argv.slice(1)));
  });
  pending = argFiles(process.argv.slice(1));

  // Разрешаем звук без жеста пользователя (восстановление воспроизведения и открытие файлов)
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  ipcMain.handle('version', () => app.getVersion());
  ipcMain.handle('ready', () => { rendererReady = true; const p = pending; pending = []; return readFiles(p); });
  ipcMain.handle('update-check', () => checkUpdates());
  ipcMain.handle('update-install', () => { if (updater) updater.quitAndInstall(); });
  ipcMain.handle('open-url', (_e, url) => { if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url); });

  app.whenReady().then(() => {
    createWindow(); setupUpdater();
    // первая проверка через 10 с после запуска, затем каждые 6 часов
    setTimeout(checkUpdates, 10e3);
    setInterval(checkUpdates, 6 * 3600e3);
  });
  app.on('window-all-closed', () => app.quit());
}
