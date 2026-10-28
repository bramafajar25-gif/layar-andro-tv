'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, net, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { SOURCE, USER_AGENT, playbackUrl, createClient } = require('./source.cjs');
const { isAdRequest, isStreamURL, parseManifest, nativeArgs, nativeFileArgs } = require('./media.cjs');
const { installPlayerTools, playerSnapshot } = require('./player-tools.cjs');
const { createI18n } = require('../i18n.js');
const ROOT = path.resolve(__dirname, '..');
const HOME = pathToFileURL(path.join(ROOT, 'index.html')).href;
fs.mkdirSync(path.join(ROOT, '.runtime', 'profile'), { recursive: true });
app.setPath('userData', path.join(ROOT, '.runtime', 'profile'));
app.setName('Layar');
app.setAppUserModelId('com.layar.app');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
let win, player, rect, playerGeneration = 0, monitor, streamURL = '', streamMetadata = {}, nativeProcess;
const settingsPath = path.join(ROOT, '.runtime', 'profile', 'playback.json');
let settings = { quality: 'auto', blockAds: true, passthrough: false, nativePath: '', language: 'id' };
try { const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); settings = { ...settings, ...saved }; } catch {}
const i18n = createI18n(settings.language);
const t = (key, values) => i18n.t(key, values);
function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }
const client = createClient((url, options) => net.fetch(url, options));
function trusted(event) { if (event.sender !== win?.webContents || event.senderFrame?.url !== HOME) throw new Error(t("Permintaan tidak diizinkan.")); }
function status(value) { if (win && !win.isDestroyed()) win.webContents.send('layar:player-status', value); }
function fitPlayer() {
  if (!player || !rect || !win) return;
  const [width, height] = win.getContentSize();
  const x = Math.max(0, Math.min(Math.round(rect.x), width));
  const y = Math.max(0, Math.min(Math.round(rect.y), height));
  player.setBounds({ x, y, width: Math.max(1, Math.min(Math.round(rect.width), width - x)), height: Math.max(1, Math.min(Math.round(rect.height), height - y)) });
}
function closePlayer() {
  playerGeneration++;
  clearInterval(monitor); monitor = null; streamURL = ''; streamMetadata = {};
  if (nativeProcess) { nativeProcess.kill(); nativeProcess = null; }
  if (player) { player.webContents.session.webRequest.onBeforeRequest(null); player.webContents.session.webRequest.onHeadersReceived(null); win?.contentView.removeChildView(player); player.webContents.close(); player = null; }
}
const playerCSS = `
  html,body{background:#000!important;scrollbar-width:none!important}
  body.layar-player-active{overflow:hidden!important}
  body.layar-player-active *{visibility:hidden!important}
  body.layar-player-active [data-layar-player],body.layar-player-active [data-layar-player] *{visibility:visible!important}
  body.layar-player-active [role="dialog"],body.layar-player-active [role="dialog"] *,body.layar-player-active dialog,body.layar-player-active dialog *{visibility:visible!important}
  [data-layar-player]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;max-height:none!important;margin:0!important;border-radius:0!important;z-index:2147483600!important}
  [data-layar-player] .hero-player-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;transform:none!important;border-radius:0!important}
`;
async function captureStream(contents, url, generation) {
  if (generation !== playerGeneration || !isStreamURL(url) || streamURL) return;
  try { if ((await contents.executeJavaScript(`(${playerSnapshot.toString()})()`)).advertisement) return; } catch { return; }
  if (generation !== playerGeneration || streamURL) return;
  streamURL = url;
  status({ state: 'stream', externalReady: true });
  try {
    const response = await contents.session.fetch(url, { headers: { Referer: SOURCE + '/', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return;
    const reader = response.body.getReader(); let text = '', size = 0; const decoder = new TextDecoder();
    try {
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 262144) return; text += decoder.decode(next.value, { stream: true }); }
    } finally { await reader.cancel().catch(() => {}); }
    if (generation !== playerGeneration) return;
    streamMetadata = parseManifest(text);
    status({ state: 'stream', externalReady: true, ...streamMetadata });
  } catch { /* The source player can continue when manifest inspection is unavailable. */ }
}

ipcMain.handle('layar:api', (event, resource) => { trusted(event); return client(resource); });
ipcMain.handle('layar:settings', event => { trusted(event); return settings; });
ipcMain.handle('layar:set-language', (event, value) => {
  trusted(event);
  if (!['id', 'en'].includes(value)) throw new Error(t('Bahasa tidak didukung.'));
  i18n.setLanguage(value); settings.language = value; saveSettings();
  win?.setTitle(value === 'en' ? 'Layar · Movies & Series' : 'Layar · Film & Series');
  return value;
});
ipcMain.handle('layar:save-settings', (event, value) => {
  trusted(event);
  if (!value || !['auto','eco','maximum'].includes(value.quality) || typeof value.blockAds !== 'boolean' || typeof value.passthrough !== 'boolean') throw new Error(t("Pengaturan tidak valid."));
  settings = { ...settings, quality: value.quality, blockAds: value.blockAds, passthrough: value.passthrough }; saveSettings();
  return settings;
});
ipcMain.handle('layar:choose-native', async event => {
  trusted(event);
  const result = await dialog.showOpenDialog(win, { title: t("Pilih mpv.exe"), properties: ['openFile'], filters: [{ name: 'mpv player', extensions: ['exe'] }] });
  if (!result.canceled) {
    const selected = result.filePaths[0];
    if (path.basename(selected).toLowerCase() !== 'mpv.exe' || !fs.statSync(selected).isFile()) throw new Error(t("Pilih executable mpv.exe."));
    settings.nativePath = selected; saveSettings();
  }
  return settings;
});
ipcMain.handle('layar:native', async event => {
  trusted(event);
  if (!settings.nativePath || !fs.existsSync(settings.nativePath)) throw new Error(t("Pilih mpv.exe lewat Pengaturan terlebih dahulu."));
  if (!player || !streamURL) throw new Error(t("Tunggu sampai video tersedia dari sumber."));
  if (nativeProcess) throw new Error(t("mpv masih berjalan. Tutup jendela mpv sebelum membuka lagi."));
  const contents = player.webContents, generation = playerGeneration, url = streamURL;
  const snapshot = await contents.executeJavaScript(`(${playerSnapshot.toString()})()`);
  const cookies = await contents.session.cookies.get({ url });
  if (generation !== playerGeneration || contents.isDestroyed()) throw new Error(t("Sesi pemutaran sudah berganti."));
  const args = nativeArgs({ url, title: 'Layar · ' + contents.getTitle(), quality: settings.quality, passthrough: settings.passthrough, cookie: cookies.map(c => c.name + '=' + c.value).join('; '), referrer: SOURCE + '/', userAgent: USER_AGENT, start: snapshot.time });
  const child = spawn(settings.nativePath, args, { windowsHide: true, stdio: 'ignore', shell: false });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error(t("mpv tidak bisa dibuka. Pilih ulang mpv.exe di Pengaturan.")))); });
  if (generation !== playerGeneration || contents.isDestroyed()) { child.kill(); throw new Error(t("Sesi pemutaran sudah berganti.")); }
  nativeProcess = child;
  child.on('exit', code => { if (nativeProcess === child) nativeProcess = null; if (generation === playerGeneration) { player?.setVisible(true); status({ state: 'external-closed', message: code ? t("mpv berhenti. Sumber atau codec mungkin tidak didukung. Coba pemutar internal.") : t("mpv ditutup. Lanjutkan lewat player atau muat ulang.") }); } });
  await contents.executeJavaScript(`document.querySelectorAll('video').forEach(v=>v.pause())`).catch(() => {});
  if (nativeProcess !== child || child.exitCode !== null || generation !== playerGeneration) throw new Error(t("mpv sudah berhenti. Coba pemutar internal atau periksa sumber."));
  if (generation === playerGeneration) player?.setVisible(false);
  return { opened: true };
});
ipcMain.handle('layar:open-file', async event => {
  trusted(event);
  if (!settings.nativePath || !fs.existsSync(settings.nativePath)) throw new Error(t("Pilih mpv.exe lewat Pengaturan terlebih dahulu."));
  if (nativeProcess) throw new Error(t("Tutup jendela mpv sebelumnya terlebih dahulu."));
  const result = await dialog.showOpenDialog(win, { title: t("Buka film di mpv"), properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mkv','mp4','mov','webm','m2ts','ts','m4v','avi'] }] });
  if (result.canceled) return { opened: false };
  const file = result.filePaths[0];
  if (!fs.statSync(file).isFile()) throw new Error(t("File video tidak ditemukan."));
  const child = spawn(settings.nativePath, nativeFileArgs({ file, title: 'Layar · ' + path.basename(file), quality: settings.quality, passthrough: settings.passthrough }), { windowsHide: true, stdio: 'ignore', shell: false });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error(t("mpv tidak bisa dibuka. Pilih ulang mpv.exe di Pengaturan.")))); });
  nativeProcess = child;
  child.on('exit', code => { if (nativeProcess === child) nativeProcess = null; if (code) status({ state: 'local-error', message: t("File belum bisa diputar di mpv. Periksa file atau nonaktifkan passthrough untuk speaker laptop.") }); });
  return { opened: true };
});
ipcMain.on('layar:bounds', (event, value) => {
  trusted(event);
  if (!value || !['x','y','width','height'].every(k => Number.isFinite(value[k]))) return;
  rect = value; fitPlayer();
});
ipcMain.handle('layar:play', async (event, options) => {
  trusted(event);
  const url = playbackUrl(options);
  closePlayer();
  const generation = playerGeneration;
  player = new WebContentsView({ webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', partition: 'persist:idlix' } });
  const contents = player.webContents;
  contents.setUserAgent(USER_AGENT);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape' && !contents.isDestroyed()) { event.preventDefault(); status({ state: 'close-request' }); }
    if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  contents.on('will-navigate', (event, target) => {
    try { if (new URL(target).origin !== SOURCE) event.preventDefault(); } catch { event.preventDefault(); }
  });
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => callback({ cancel: settings.blockAds && isAdRequest(details.url) }));
  contents.session.webRequest.onHeadersReceived({ urls: ['https://*/*'] }, (details, callback) => {
    callback({});
    if (details.webContentsId !== contents.id || isAdRequest(details.url)) return;
    const type = Object.entries(details.responseHeaders || {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1]?.join(' ') || '';
    if (/mpegurl/i.test(type) || /\.m3u8(?:\?|$)/i.test(details.url)) void captureStream(contents, details.url, generation);
  });
  contents.session.setPermissionRequestHandler((_, permission, callback) => callback(permission === 'fullscreen'));
  contents.on('did-finish-load', async () => {
    try {
      const current = new URL(contents.getURL());
      if (current.origin === SOURCE) {
        await contents.insertCSS(playerCSS);
        await contents.executeJavaScript(`(${installPlayerTools.toString()})(${JSON.stringify({ blockAds: settings.blockAds })})`);
      }
      if (generation === playerGeneration) status({ state: 'loaded' });
    } catch { if (generation === playerGeneration) status({ state: 'loaded' }); }
  });
  contents.on('did-fail-load', (_, code, description, __, mainFrame) => {
    if (mainFrame && code !== -3 && generation === playerGeneration) status({ state: 'error', message: t("Player belum bisa dimuat. Coba lagi atau buka sumber IDLIX.") });
  });
  win.contentView.addChildView(player);
  let inspecting = false;
  monitor = setInterval(async () => {
    if (inspecting || contents.isDestroyed() || generation !== playerGeneration) return;
    inspecting = true;
    try { const data = await contents.executeJavaScript(`(${playerSnapshot.toString()})()`); if (generation === playerGeneration) status({ state: 'metrics', externalReady: !!streamURL, ...data }); } catch {} finally { inspecting = false; }
  }, 3000);
  fitPlayer();
  status({ state: 'loading' });
  contents.loadURL(url).catch(() => {});
  return { url };
});
ipcMain.handle('layar:close-player', event => { trusted(event); closePlayer(); });
ipcMain.handle('layar:fullscreen', event => { trusted(event); win.setFullScreen(!win.isFullScreen()); });
ipcMain.handle('layar:open-source', (event, options) => { trusted(event); return shell.openExternal(options ? playbackUrl(options) : SOURCE); });

async function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 920, minWidth: 900, minHeight: 640, backgroundColor: '#141414', title: 'Layar · Film & Series', icon: path.join(ROOT, 'layar.ico'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== HOME) event.preventDefault(); });
  win.on('resize', fitPlayer);
  win.on('closed', () => { clearInterval(monitor); if (nativeProcess) nativeProcess.kill(); if (player) { player.webContents.close(); player = null; } win = null; });
  await win.loadFile(path.join(ROOT, 'index.html'));
  if (process.argv.includes('--smoke-test')) require('../.tools/smoke.cjs').run({ app, win, fs, ROOT, getPlayer: () => player }).catch(error => { console.error(error); app.exit(1); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
