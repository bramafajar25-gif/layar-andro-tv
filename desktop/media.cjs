'use strict';
const path = require('node:path');
const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'adsterra.com', 'popads.net', 'popcash.net', 'propellerads.com', 'exoclick.com',
  'adnxs.com', 'adsrvr.org', 'serving-sys.com', 'outbrain.com', 'taboola.com',
  'mgid.com', 'revcontent.com', 'juicyads.com', 'trafficjunky.com', 'hilltopads.net',
  'clickadu.com', 'richpush.co', 'pushwoosh.com', 'onclickmax.com', 'onclickmega.com',
  'admaven.com', 'ad-maven.com', 'betterads.org', 'bidswitch.net', 'casalemedia.com',
  'adcolony.com', 'unity3d.com', 'applovin.com', 'vungle.com', 'mopub.com',
  'pubmatic.com', 'openx.net', 'rubiconproject.com', 'criteo.com', 'smartadserver.com',
  'zedo.com', 'adbrite.com', 'advertising.com', 'yieldmanager.com',
  'revenuehits.com', 'adf.ly', 'sh.st', 'bc.vc', 'ouo.io',
  'linkbucks.com', 'shorte.st', 'adfoc.us', 'clicknupload.org',
  'go.onclasrv.com', 'onclasrv.com', 'onclkds.com', 'clickaine.com',
  'tsyndicate.com', 'syndication.exdynsrv.com', 'exdynsrv.com',
  'a-ads.com', 'ad-delivery.net', 'adtng.com', 'ero-advertising.com',
  'juicyads.com', 'trafficfactory.biz', 'trafficstars.com'
];
const AD_PATH_PATTERNS = [/\/ads?[\/_-]/i, /\/advert/i, /\/sponsor/i, /\/pop(up|under)/i, /\/banner/i, /\/tracking/i, /\/pixel/i, /\/impression/i];
function isAdRequest(value) {
  try {
    const url = new URL(value);
    if (AD_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return true;
    if (url.hostname === 'z2.idlixku.com' && url.pathname === '/api/watch/session/media') return true;
    if (AD_PATH_PATTERNS.some(pattern => pattern.test(url.pathname))) return true;
    return false;
  } catch { return false; }
}
function isStreamURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname);
  } catch { return false; }
}
const { parseManifest } = require('../stream-tools.js');
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
