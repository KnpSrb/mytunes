// MyTunes — оболочка Electron для Windows.
// Загружает тот же index.html; данные (IndexedDB, localStorage) хранятся в %APPDATA%\MyTunes.
const { app, BrowserWindow, Menu, shell, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

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

/* ---------- Перенос по Wi‑Fi ----------
   HTTP-сервер в локальной сети. Каждый запрос должен содержать 6-значный код;
   после 10 неверных попыток сервер выключается. Данные отдаёт и принимает страница (IndexedDB). */
let share = null, ridSeq = 0;
const waiting = new Map();
// адреса домашней сети (192.168.x, 10.x, 172.16–31.x) — первыми: телефон пробует их по порядку, VPN-адреса — в конце
const lanIPs = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')).map(i => i.address)
  .sort((a, b) => /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\./.test(b) - /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\./.test(a));

function stopShare() { if (share) { share.srv.close(); share.srv.closeAllConnections?.(); share = null; } }
function startShare() {
  if (share) return Promise.resolve({ ips: lanIPs(), port: share.port, code: share.code });
  const code = String(crypto.randomInt(100000, 1000000));
  const srv = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://local');
    if (!u.pathname.startsWith('/mt/')) { res.writeHead(404); return res.end(); }
    if (!share || u.searchParams.get('code') !== share.code) {
      if (share && ++share.fails >= 10) { stopShare(); send({ state: 'share-locked' }); }
      res.writeHead(403); return res.end('bad code');
    }
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 2e9) { res.writeHead(413); return res.end(); } chunks.push(c); }
    const rid = ++ridSeq;
    const r = await new Promise(resolve => {
      waiting.set(rid, resolve);
      win.webContents.send('share-req', { rid, method: req.method, path: u.pathname, name: os.hostname(), body: size ? Buffer.concat(chunks) : null });
      setTimeout(() => { if (waiting.delete(rid)) resolve({ status: 504 }); }, 300e3);
    });
    res.writeHead(r.status || 200, { 'Content-Type': r.type || 'application/octet-stream' });
    res.end(r.data ? Buffer.from(r.data) : undefined);
  });
  srv.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    const ok = () => { share = { srv, code, port: srv.address().port, fails: 0 }; resolve({ ips: lanIPs(), port: share.port, code }); };
    srv.once('error', e => { if (e.code === 'EADDRINUSE') { srv.removeAllListeners('error'); srv.once('error', reject); srv.listen(0, '0.0.0.0', ok); } else reject(e); });
    srv.listen(47800, '0.0.0.0', ok);
  });
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
  ipcMain.handle('share-start', () => startShare());
  ipcMain.handle('share-stop', () => stopShare());
  ipcMain.on('share-res', (_e, rid, r) => { const f = waiting.get(rid); if (f) { waiting.delete(rid); f(r); } });
  ipcMain.handle('open-url', (_e, url) => { if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url); });

  app.whenReady().then(() => {
    createWindow(); setupUpdater();
    // первая проверка через 10 с после запуска, затем каждые 6 часов
    setTimeout(checkUpdates, 10e3);
    setInterval(checkUpdates, 6 * 3600e3);
  });
  app.on('window-all-closed', () => app.quit());
}
