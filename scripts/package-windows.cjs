'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const runtime = path.dirname(require('electron'));
if (!fs.existsSync(path.join(runtime, 'electron.exe'))) {
  throw new Error('Build the Windows download on Windows with npm ci installed.');
}
const name = `Layar-Windows-Laptop-v${manifest.version}-x64`;
const target = path.join(root, 'dist', 'windows', name);
// Refuse to overwrite a previous build; each run produces a reviewable folder.
if (fs.existsSync(target)) throw new Error(`Build folder already exists: ${target}`);
fs.mkdirSync(target, { recursive: true });
fs.cpSync(runtime, target, { recursive: true, filter: file => !file.endsWith('.log') });
fs.renameSync(path.join(target, 'electron.exe'), path.join(target, 'Layar.exe'));
const app = path.join(target, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
for (const file of ['index.html', 'app.js', 'stream-tools.js', 'cinema.css', 'i18n.js', 'layar.ico']) {
  fs.copyFileSync(path.join(root, file), path.join(app, file));
}
fs.cpSync(path.join(root, 'desktop'), path.join(app, 'desktop'), { recursive: true });
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({
  name: manifest.name, productName: 'Layar', version: manifest.version, main: manifest.main
}, null, 2) + '\n');
fs.copyFileSync(path.join(root, 'dist', 'desktop', 'Panduan.md'), path.join(target, 'Panduan.md'));
fs.writeFileSync(path.join(target, 'MULAI-DI-SINI.txt'),
  'LAYAR - WINDOWS LAPTOP\r\n\r\n' +
  '1. Ekstrak SELURUH ZIP ke folder milikmu (misalnya Downloads atau Desktop).\r\n' +
  '2. Klik dua kali Layar.exe. Tidak perlu Node.js, npm, atau server.\r\n' +
  '3. Biarkan file DLL, locales, dan resources bersama Layar.exe.\r\n\r\n' +
  'Paket ini untuk Windows x64. Untuk HP/TV Android, unduh APK terpisah.\r\n' +
  'Aplikasi memerlukan internet. mpv opsional dan dipasang terpisah.\r\n' +
  'Pengaturan tersimpan dalam resources/app/.runtime/profile.\r\n');
console.log(target);
