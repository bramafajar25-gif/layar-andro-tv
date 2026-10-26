'use strict';
const path = require('node:path');
const AD_HOSTS = ['doubleclick.net', 'googlesyndication.com', 'adsterra.com', 'popads.net', 'popcash.net', 'propellerads.com', 'exoclick.com'];
function isAdRequest(value) {
  try {
    const url = new URL(value);
    return AD_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) ||
      (url.hostname === 'z2.idlixku.com' && url.pathname === '/api/watch/session/media');
  } catch { return false; }
}
function isStreamURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname);
  } catch { return false; }
}
function attributes(line) {
  const fields = {};
  for (const match of line.matchAll(/([\w-]+)=("[^"]*"|[^,\r\n]*)/g)) fields[match[1]] = match[2].replace(/^"|"$/g, '');
  return fields;
}
function parseManifest(text) {
  const resolutions = new Set(), codecs = new Set(), channels = new Set();
  let atmos = false;
  if (!text.trimStart().startsWith('#EXTM3U')) return { resolutions: [], codecs: [], channels: [], atmos: false };
  for (const line of text.split(/\r?\n/)) {
    if (!/^#EXT-X-(STREAM-INF|MEDIA|I-FRAME-STREAM-INF):/.test(line)) continue;
    const data = attributes(line);
    if (/^\d+x\d+$/.test(data.RESOLUTION || '')) resolutions.add(Number(data.RESOLUTION.split('x')[1]));
    for (const codec of (data.CODECS || '').split(',')) if (codec.trim()) codecs.add(codec.trim());
    if (data.CHANNELS) channels.add(data.CHANNELS);
    if (/(^|\/)JOC($|\/)/i.test(data.CHANNELS || '')) atmos = true;
  }
  return { resolutions: [...resolutions].sort((a,b) => b-a), codecs: [...codecs], channels: [...channels], atmos };
}
function nativeBaseArgs({ title, quality = 'auto', passthrough = false }) {
  const bitrate = quality === 'eco' ? '2000000' : quality === 'maximum' ? 'max' : '8000000';
  const args = ['--no-config', '--hwdec=auto-safe', '--cache=yes', '--demuxer-max-bytes=64MiB', '--force-window=immediate', '--save-position-on-quit=no', '--title=' + String(title).slice(0,250), '--hls-bitrate=' + bitrate];
  if (passthrough) args.push('--audio-spdif=ac3,eac3,truehd,dts,dts-hd', '--audio-channels=auto', '--audio-exclusive=yes');
  return args;
}
function nativeFileArgs({ file, ...preferences }) {
  if (!path.win32.isAbsolute(file || '') || !/\.(mkv|mp4|mov|webm|m2ts|ts|m4v|avi)$/i.test(file || '')) throw new Error('Pilih file video yang didukung.');
  return [...nativeBaseArgs(preferences), '--', file];
}
function nativeArgs({ url, title, quality = 'auto', passthrough = false, cookie = '', referrer, userAgent, start = 0 }) {
  if (!isStreamURL(url)) throw new Error('Alamat stream tidak didukung.');
  const args = nativeBaseArgs({ title, quality, passthrough });
  if (referrer) args.push('--referrer=' + referrer);
  if (userAgent) args.push('--user-agent=' + userAgent);
  if (cookie && !/[\r\n]/.test(cookie)) args.push('--http-header-fields=Cookie: ' + cookie);
  if (Number.isFinite(start) && start > 0) args.push('--start=' + Math.floor(start));
  args.push('--', url);
  return args;
}
module.exports = { isAdRequest, isStreamURL, parseManifest, nativeArgs, nativeFileArgs };
