// Генерация скриншотов для README: npx electron scripts/screenshots.js
// Запускает index.html в отдельном профиле, наполняет медиатеку демо-треками
// (синтезированный звук + нарисованные обложки) и сохраняет PNG в docs/screenshots.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('mute-audio'); // визуализатор работает, но звук не слышен
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'mytunes-shots-')));

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const wait = ms => new Promise(r => setTimeout(r, ms));

// Код, выполняемый на странице: создаёт демо-медиатеку
const SEED = `(async () => {
  const demo = [
    ['Neon Harbor', 'Midnight Drive', 'City Lights', 214, ['#ff2e93','#3a0ca3']],
    ['Neon Harbor', 'Afterglow', 'City Lights', 198, ['#ff2e93','#3a0ca3']],
    ['Neon Harbor', 'Glass Towers', 'City Lights', 241, ['#ff2e93','#3a0ca3']],
    ['Aurora Fields', 'Northern Echo', 'Polar Bloom', 263, ['#06d6a0','#118ab2']],
    ['Aurora Fields', 'Snowfall Letters', 'Polar Bloom', 187, ['#06d6a0','#118ab2']],
    ['Velvet Static', 'Paper Planes', 'Lo-Fi Mornings', 156, ['#ffb703','#fb8500']],
    ['Velvet Static', 'Coffee & Rain', 'Lo-Fi Mornings', 172, ['#ffb703','#fb8500']],
    ['Velvet Static', 'Sunday Window', 'Lo-Fi Mornings', 149, ['#ffb703','#fb8500']],
    ['Echo Valley', 'Wildfire', 'Open Roads', 229, ['#e63946','#1d3557']],
    ['Echo Valley', 'Highway Hymn', 'Open Roads', 251, ['#e63946','#1d3557']],
    ['Luna Park', 'Carousel', 'Summer Reels', 203, ['#8338ec','#3a86ff']],
    ['Luna Park', 'Cotton Candy Skies', 'Summer Reels', 189, ['#8338ec','#3a86ff']],
  ];
  // WAV: аккорд с гармониками и шумом, чтобы спектр выглядел живо
  const wav = (seed, dur) => { const sr = 11025, n = sr * dur, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0,'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8,'WAVEfmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
    const f = [110, 220, 330, 440, 660, 880, 1320, 2640, 5280].map(x => x * (1 + seed * 0.03));
    for (let i = 0; i < n; i++) { const t = i / sr; let s = 0;
      f.forEach((fr, k) => s += Math.sin(2 * Math.PI * fr * t) * (0.5 + 0.5 * Math.sin(t * (k + 1) * 1.7)) / (k + 1.5));
      s += (Math.random() - 0.5) * 0.15; v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * 0.3)) * 32767, true); }
    return b; };
  // Обложка: градиент + геометрия
  const cover = (title, [a, c], k) => new Promise(res => { const cv = document.createElement('canvas'); cv.width = cv.height = 400; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 400, 400); g.addColorStop(0, a); g.addColorStop(1, c); x.fillStyle = g; x.fillRect(0, 0, 400, 400);
    x.globalAlpha = .25; x.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(80 + ((k * 97 + i * 71) % 260), 80 + ((k * 53 + i * 113) % 260), 30 + i * 22, 0, 7); x.fill(); }
    x.globalAlpha = 1; x.fillStyle = '#fff'; x.font = 'bold 34px Segoe UI, sans-serif'; x.fillText(title, 24, 370);
    cv.toBlob(res, 'image/jpeg', .9); });
  const files = demo.map((d, i) => new File([wav(i, d[3])], d[0] + ' - ' + d[1] + '.wav', { type: 'audio/wav' }));
  await Library.addFiles(files);
  const ts = Library.list();
  const albumCovers = {};
  for (const [i, d] of demo.entries()) { const t = ts.find(x => x.title === d[1]); if (!t) continue;
    t.album = d[2]; t.year = '2025'; t.duration = d[3]; t.added = Date.now() - i * 3600e3;
    t.cover = albumCovers[d[2]] ||= await cover(d[2], d[4], i); await Library.update(t); }
  const id = n => Library.list().find(t => t.title === n).id;
  ['Midnight Drive','Northern Echo','Coffee & Rain','Wildfire','Carousel'].forEach(n => Library.liked.push(id(n)));
  LS.set('liked', Library.liked);
  ['Paper Planes','Midnight Drive','Highway Hymn','Northern Echo','Carousel','Afterglow'].forEach(n => Library.pushRecent(id(n)));
  await Library.createPlaylist('Вечерний вайб', ['Midnight Drive','Afterglow','Coffee & Rain','Northern Echo','Carousel','Glass Towers','Sunday Window'].map(id));
  await Library.createPlaylist('В дорогу', ['Wildfire','Highway Hymn','Glass Towers'].map(id));
  await Library.createPlaylist('Фокус', ['Paper Planes','Snowfall Letters'].map(id));
  coverURLs.clear(); colorCache.clear();
  Player.setVolume(0.6);
  Queue.set(Library.pl(Library.playlists[0].id).tracks, 0); await Player.load(true);
  // история прослушиваний за год для статистики и итогов года
  const ts2 = Library.list(), w = ts2.map((_, k) => 1 / (k + 1.5)), W = w.reduce((a, b) => a + b);
  const pick = () => { let r = Math.random() * W; for (let k = 0; k < ts2.length; k++) if ((r -= w[k]) < 0) return ts2[k]; return ts2[0]; };
  const y0 = new Date(new Date().getFullYear(), 0, 1).getTime();
  for (let k = 0; k < 900; k++) { const t = pick(), d = new Date(y0 + Math.random() * (Date.now() - y0)); d.setHours([8, 13, 19, 21, 22, 23][k % 6], Math.random() * 60);
    if (d.getTime() < Date.now()) Stats.log.push({ i: t.id, ti: t.title, a: t.artist, al: t.album, t: d.getTime(), s: Math.round(t.duration * (0.6 + Math.random() * 0.4)) }); }
  Stats.log.sort((a, b) => a.t - b.t); Stats.save();
  UI.refresh(); return true;
})()`;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1440, height: 900, show: true, useContentSize: true, autoHideMenuBar: true, backgroundColor: '#121212' });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await wait(800);
  win.webContents.debugger.attach('1.3'); // захват через DevTools работает, даже если окно перекрыто
  const js = c => win.webContents.executeJavaScript(c);
  await js(SEED); await wait(4000);
  const shot = async (name, ms = 900) => { await wait(ms); await win.webContents.executeJavaScript('document.activeElement?.blur()'); const { data } = await win.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); console.log('saved', name); };

  await js(`Player.seek(72); UI.go('home')`); await shot('home.png');
  await js(`UI.go('playlist', Library.playlists[0].id)`); await shot('playlist.png', 1400);
  await js(`UI.go('album', 'City Lights\\u0001Neon Harbor'); UI.toggleQueue(true)`); await shot('queue.png', 1400);
  await js(`UI.toggleQueue(false); UI.go('search'); const i=document.querySelector('#sq'); i.value='neon'; UI.q='neon'; UI.renderResults()`); await shot('search.png');
  await js(`UI.toggleFull(true); document.querySelector('#full details').open = true`); await shot('now-playing.png', 1500);
  await js(`UI.toggleFull(false); applyTheme('light', '#1E90FF'); UI.go('liked')`); await shot('light-theme.png', 1400);
  await js(`applyTheme('dark', '#1DB954'); UI.statPeriod = String(new Date().getFullYear()); UI.go('stats')`); await shot('stats.png', 1400);
  await js(`UI.go('wrapped', String(new Date().getFullYear())); document.querySelectorAll('.ws')[2].scrollIntoView()`); await shot('wrapped.png', 1400);
  await js(`UI.go('home')`);
  win.setContentSize(390, 844); await shot('mobile.png', 1200);
  await js(`UI.toggleFull(true)`); await shot('mobile-now-playing.png', 1500);
  app.quit();
});
