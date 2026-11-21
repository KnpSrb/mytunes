// electron-builder: signAndEditExecutable выключен (его инструменты не распаковываются на Windows без прав на симлинки),
// поэтому иконку и сведения о версии вписываем в MyTunes.exe сами — через rcedit.
const path = require('path');
exports.default = async ctx => {
  if (ctx.electronPlatformName !== 'win32') return;
  const m = require('rcedit'), rcedit = m.rcedit || m.default || m;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe'), v = ctx.packager.appInfo.version;
  await rcedit(exe, { icon: path.join(__dirname, '..', 'build', 'icon.ico'), 'file-version': v, 'product-version': v,
    'version-string': { ProductName: 'MyTunes', FileDescription: 'MyTunes', CompanyName: 'MyTunes', LegalCopyright: 'MIT', OriginalFilename: 'MyTunes.exe' } });
  console.log('  • иконка и версия вписаны в', path.basename(exe));
};
