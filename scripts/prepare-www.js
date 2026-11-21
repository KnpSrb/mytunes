// Готовит папку www для Capacitor (Android): та же страница index.html
// и jsQR — распознавание QR-кодов камерой (загружается только при сканировании)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), www = path.join(root, 'www');
fs.mkdirSync(www, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(www, 'index.html'));
fs.copyFileSync(require.resolve('jsqr/dist/jsQR.js'), path.join(www, 'jsqr.js'));
console.log('www обновлена: index.html, jsqr.js');
