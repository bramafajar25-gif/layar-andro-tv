'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAdRequest, isStreamURL, parseManifest, nativeArgs, nativeFileArgs } = require('../desktop/media.cjs');

test('ad filtering leaves playback sessions and media manifests available', () => {
  assert.equal(isAdRequest('https://ads.doubleclick.net/a'), true);
  assert.equal(isAdRequest('https://z2.idlixku.com/api/watch/session/media'), true);
  for (const url of ['https://notdoubleclick.net/film.m3u8', 'https://z2.idlixku.com/api/watch/session/claim', 'https://z2.idlixku.com/api/watch/session/renew', 'https://cdn.example/movie/master.m3u8']) assert.equal(isAdRequest(url), false);
});
test('HLS reports actual resolutions, codecs and Atmos JOC, without treating ec-3 alone as Atmos', () => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",CHANNELS="16/JOC"\n#EXT-X-STREAM-INF:BANDWIDTH=20000000,RESOLUTION=3840x2160,CODECS="hvc1.1.6.L153.B0,ec-3"\n4k.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"\nhd.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\nother.m3u8';
  const result = parseManifest(master);
  assert.deepEqual(result.resolutions, [2160,1080]);
  assert.deepEqual(result.codecs, ['hvc1.1.6.L153.B0','ec-3','avc1.640028','mp4a.40.2']);
  assert.equal(result.atmos, true);
  assert.equal(parseManifest('#EXTM3U\n#EXT-X-STREAM-INF:CODECS="ec-3"').atmos, false);
  assert.deepEqual(parseManifest('<html>error</html>').resolutions, []);
});
test('native handoff rejects local network URLs and non-HTTPS protocols', () => {
  for (const value of ['file:///C:/secret', 'https://127.0.0.1/a', 'https://192.168.1.2/a', 'https://172.16.2.3/a', 'https://[::1]/a', 'https://user:pass@cdn.example/a', 'http://cdn.example/a']) {
    assert.equal(isStreamURL(value), false);
    assert.throws(() => nativeArgs({ url: value }));
  }
  assert.equal(isStreamURL('https://cdn.example/master.m3u8?token=a'), true);
});
test('mpv receives quality, hardware decode and explicit opt-in audio passthrough as separate arguments', () => {
  const url = 'https://cdn.example/master.m3u8?token=a&b=c';
  const eco = nativeArgs({ url, title: 'Film $(literal)', quality: 'eco', start: 42.9 });
  assert.ok(eco.includes('--hls-bitrate=2000000'));
  assert.ok(eco.includes('--hwdec=auto-safe'));
  assert.ok(eco.includes('--start=42'));
  assert.ok(!eco.some(arg => arg.startsWith('--audio-spdif')));
  assert.deepEqual(eco.slice(-2), ['--',url]);
  const cinema = nativeArgs({ url, quality: 'maximum', passthrough: true });
  assert.ok(cinema.includes('--hls-bitrate=max'));
  assert.ok(cinema.includes('--audio-spdif=ac3,eac3,truehd,dts,dts-hd'));
});
test('local cinema passes the selected video as one argument and rejects scripts or relative paths', () => {
  const file = 'C:\\Movies\\Film 4K & Atmos.mkv';
  const args = nativeFileArgs({ file, title: 'Film', passthrough: true });
  assert.deepEqual(args.slice(-2), ['--',file]);
  for (const value of ['../film.mkv','C:\\Movies\\script.cmd','https://cdn.example/movie.mp4']) assert.throws(() => nativeFileArgs({ file: value }));
});
