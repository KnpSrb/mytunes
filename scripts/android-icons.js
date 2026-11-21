// PNG-иконки для старых Android (до 8.0): npx electron scripts/android-icons.js
const { app, BrowserWindow } = require('electron'); const fs = require('fs'), path = require('path');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const svg = round => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${round ? '<circle cx="12" cy="12" r="12" fill="#121212"/>' : '<rect width="24" height="24" rx="5" fill="#121212"/>'}
  <g transform="translate(3.6 3.6) scale(.7)"><circle cx="12" cy="12" r="11" fill="#1DB954"/><path fill="#000" d="M10 7v7.3A2.5 2.5 0 1 0 11.5 16.6V9.5h4V7z"/></g></svg>`;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  for (const [d, px] of Object.entries(SIZES)) for (const round of [false, true]) {
    await w.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent"><canvas id=c width=${px} height=${px}></canvas><script>
      const i=new Image();i.onload=()=>{c.getContext('2d').drawImage(i,0,0,${px},${px});document.title='ok'};i.src='data:image/svg+xml,'+encodeURIComponent(${JSON.stringify(svg(round))});</script>`));
    await new Promise(r => setTimeout(r, 150));
    const url = await w.webContents.executeJavaScript(`c.toDataURL('image/png')`);
    fs.writeFileSync(path.join(RES, 'mipmap-' + d, round ? 'ic_launcher_round.png' : 'ic_launcher.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('иконки готовы'); app.quit();
});
