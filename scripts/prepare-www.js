// Готовит папку www для Capacitor (Android): та же страница index.html
// и jsQR — распознавание QR-кодов камерой (загружается только при сканировании)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), www = path.join(root, 'www');
fs.mkdirSync(www, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(www, 'index.html'));
fs.copyFileSync(require.resolve('jsqr/dist/jsQR.js'), path.join(www, 'jsqr.js'));
// демо для Android: тот же index.html, но демо-режим включён всегда
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), flag = String.raw`const DEMO = /[?&]demo\b/.test(location.search)`;
if (!html.includes(flag)) throw new Error('не найден переключатель DEMO в index.html');
const demoDir = path.join(root, 'android', 'app', 'src', 'demo', 'assets', 'public'); fs.mkdirSync(demoDir, { recursive: true });
fs.writeFileSync(path.join(demoDir, 'index.html'), html.replace(flag, 'const DEMO = true'));
console.log('www обновлена: index.html, jsqr.js; демо для Android: src/demo/assets/public/index.html');
