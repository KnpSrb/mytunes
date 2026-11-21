// Иконки приложения из одного рисунка: npx electron scripts/icons.js
// build/icon.ico и build/icon.png — Windows, android/.../mipmap-*/ic_launcher*.png — Android до 8.0
// (на Android 8+ используется векторная адаптивная иконка drawable/ic_launcher_foreground.xml с тем же рисунком).
const { app, BrowserWindow } = require('electron'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res'), BUILD = path.join(ROOT, 'build');
const GREEN = '#1ED760', BG = '#121212';
// Знак: зелёный круг и чёрный эквалайзер из четырёх скруглённых полос (координаты 0–24)
const BARS = [[5.95, 9.6, 5.2], [9.25, 6.2, 11.6], [12.55, 8.1, 7.8], [15.85, 10.1, 3.8]];
const mark = `<circle cx="12" cy="12" r="11" fill="${GREEN}"/>${BARS.map(([x, y, h]) => `<rect x="${x}" y="${y}" width="2.2" height="${h}" rx="1.1" fill="#000"/>`).join('')}`;
const svg = kind => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${
  kind === 'win' ? mark                                                      // Windows: круг на прозрачном фоне
  : `${kind === 'round' ? `<circle cx="12" cy="12" r="12" fill="${BG}"/>` : `<rect width="24" height="24" rx="5" fill="${BG}"/>`}<g transform="translate(3.6 3.6) scale(.7)">${mark}</g>`}</svg>`;

function ico(pngs) { // контейнер .ico с PNG внутри
  const head = Buffer.alloc(6 + 16 * pngs.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(([s, b], i) => { const o = 6 + i * 16; head[o] = s >= 256 ? 0 : s; head[o + 1] = s >= 256 ? 0 : s; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(b.length, o + 8); head.writeUInt32LE(off, o + 12); off += b.length; });
  return Buffer.concat([head, ...pngs.map(p => p[1])]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<body style="margin:0">');
  const png = async (kind, px) => Buffer.from((await w.webContents.executeJavaScript(`new Promise(r => { const c = document.createElement('canvas'); c.width = c.height = ${px};
    const i = new Image(); i.onload = () => { c.getContext('2d').drawImage(i, 0, 0, ${px}, ${px}); r(c.toDataURL('image/png')); };
    i.src = 'data:image/svg+xml,' + encodeURIComponent(${JSON.stringify(svg(kind))}); })`)).split(',')[1], 'base64');
  fs.mkdirSync(BUILD, { recursive: true });
  const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256], pngs = [];
  for (const s of sizes) pngs.push([s, await png('win', s)]);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico(pngs));
  fs.writeFileSync(path.join(BUILD, 'icon.png'), await png('win', 512));
  fs.writeFileSync(path.join(BUILD, 'icon-android.png'), await png('square', 512));
  for (const [d, px] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    fs.writeFileSync(path.join(RES, 'mipmap-' + d, 'ic_launcher.png'), await png('square', px));
    fs.writeFileSync(path.join(RES, 'mipmap-' + d, 'ic_launcher_round.png'), await png('round', px));
  }
  console.log('иконки готовы'); app.quit();
});
