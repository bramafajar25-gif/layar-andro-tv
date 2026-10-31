'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseManifest } = require('../stream-tools.js');

test('HLS audio labels distinguish channel counts and codecs in the same audio group', () => {
  const parsed = parseManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="stereo",CHANNELS="2"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="dolby",CHANNELS="6"\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="avc1.4d,mp4a.40.2",AUDIO="stereo"\na.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160,CODECS="hvc1.1,ac-3",AUDIO="dolby"\nb.m3u8');
  assert.deepEqual(parsed.audioFormats, ['Stereo 2.0','Dolby Digital 5.1']);
  assert.deepEqual(parsed.resolutions, [2160,1080]);
});
test('AAC alone never implies stereo and unrelated Dolby variants never imply Dolby 5.1', () => {
  const parsed = parseManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="surround",CHANNELS="6"\n#EXT-X-STREAM-INF:CODECS="avc1,mp4a.40.2",AUDIO="surround"\na.m3u8\n#EXT-X-STREAM-INF:CODECS="avc1,ac-3",AUDIO="other"\nb.m3u8');
  assert.deepEqual(parsed.audioFormats, ['Surround (6 ch)']);
  assert.deepEqual(parseManifest('#EXTM3U\n#EXT-X-STREAM-INF:CODECS="mp4a.40.2"\na.m3u8').audioFormats, []);
});
test('subtitle channels and iframe renditions do not become audio or video quality claims', () => {
  const parsed = parseManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,CHANNELS="16/JOC"\n#EXT-X-I-FRAME-STREAM-INF:RESOLUTION=3840x2160');
  assert.equal(parsed.atmos, false);
  assert.deepEqual(parsed.resolutions, []);
  assert.deepEqual(parsed.audioFormats, []);
});
function playerFixture() {
  const video = { videoHeight: 720 };
  const hls = { media: video, levels: [{height:720},{height:1080},{height:2160}], currentLevel: 0, autoLevelEnabled: false };
  video._hls = hls;
  let ad = false;
  const context = vm.createContext({window:{}, document:{querySelector:()=>({querySelector:selector=>selector==='video'?video:{textContent:ad?'SPONSORED':'NOW PLAYING'}})}});
  vm.runInContext(fs.readFileSync(require.resolve('../stream-tools.js'),'utf8'), context);
  return { context, hls, video, tools:context.LayarStream, ad:()=>{ad=true;} };
}
test('quality selector changes the actual HLS level, supports Auto and rejects invented levels', () => {
  const f = playerFixture();
  assert.equal(f.tools.snapshot().levels[3].label, '4K UHD');
  assert.equal(f.tools.setQuality('2'), true); assert.equal(f.hls.currentLevel, 2);
  assert.equal(f.tools.setQuality('-1'), true); assert.equal(f.hls.currentLevel, -1);
  assert.equal(f.tools.setQuality('99'), false); assert.equal(f.hls.currentLevel, -1);
});
test('sponsored video and unrelated player instances expose no quality controls', () => {
  const f = playerFixture(); f.hls.media = {};
  assert.equal(f.tools.snapshot().canSelect, false);
  f.hls.media = f.video; f.ad();
  assert.equal(f.tools.snapshot().height, 0);
  assert.equal(f.tools.setQuality('0'), false);
});
test('a media playlist does not discard master audio detection', () => {
  const f = playerFixture();
  f.tools.receiveManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,CHANNELS="2"');
  f.tools.receiveManifest('#EXTM3U\n#EXTINF:10\nsegment.ts');
  assert.equal(f.tools.metadata().audioFormats[0], 'Stereo 2.0');
});


test('audio selection changes only a real track and rejects unrelated/ad players', () => {
  const f = playerFixture();
  f.hls.audioTracks = [{name:'Original'}, {name:'Dolby Atmos'}, {name:'Stereo'}];
  f.hls.audioTrack = 0;
  assert.equal(f.tools.snapshot().audioTracks.length, 3);
  assert.equal(f.tools.setAudio('1'), true);
  assert.equal(f.hls.audioTrack, 1);
  assert.equal(f.tools.setAudio('99'), false);
  assert.equal(f.hls.audioTrack, 1);
  f.ad();
  assert.equal(f.tools.setAudio('0'), false);
});

test('preferences restore by label instead of source-specific track index', () => {
  const f = playerFixture(), stored = new Map();
  f.context.localStorage = { getItem: key => stored.get(key), setItem: (key,value) => stored.set(key,value) };
  f.hls.audioTracks = [{name:'Stereo'}, {name:'Original'}]; f.hls.audioTrack = 0;
  f.tools.setQuality('2'); f.tools.setAudio('1');
  assert.equal(stored.get('layar.playback.video'), '4K UHD');
  assert.equal(stored.get('layar.playback.audio'), 'Original');
  f.hls.levels = [{height:2160}, {height:720}]; f.hls.currentLevel = 1;
  f.hls.audioTracks = [{name:'Original'}, {name:'Stereo'}]; f.hls.audioTrack = 1;
  f.tools.snapshot();
  assert.equal(f.hls.currentLevel, 0);
  assert.equal(f.hls.audioTrack, 0);
});

test('Atmos tracks are recognised only by JOC channels or an Atmos name', () => {
  const { isAtmosTrack } = require('../stream-tools.js');
  assert.equal(isAtmosTrack({ attrs: { CHANNELS: '16/JOC' } }), true);
  assert.equal(isAtmosTrack({ channels: '16/JOC' }), true);
  assert.equal(isAtmosTrack({ name: 'English Dolby Atmos' }), true);
  assert.equal(isAtmosTrack({ name: 'English', attrs: { CHANNELS: '6' } }), false);
});

test('sound options offer Atmos only when the player has a real Atmos track', () => {
  const f = playerFixture(); f.video.currentSrc = 'blob:https://source.example/1';
  f.hls.audioTracks = [{ name: 'Stereo', attrs: { CHANNELS: '2' } }]; f.hls.audioTrack = 0;
  const options = () => [...f.tools.snapshot().sound.options].map(option => ({ ...option }));
  assert.deepEqual(options(), [{ id: 'original', available: true, reason: '' }, { id: 'surround', available: true, reason: '' }, { id: 'atmos', available: false, reason: 'no-atmos' }]);
  f.tools.receiveManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",CHANNELS="16/JOC"\n#EXT-X-STREAM-INF:CODECS="avc1,ec-3",AUDIO="a"\na.m3u8');
  assert.equal(options()[2].reason, 'no-decoder');
  f.hls.audioTracks.push({ name: 'English', attrs: { CHANNELS: '16/JOC' } });
  assert.equal(options()[2].available, true);
  assert.equal(f.tools.snapshot().audioTracks[1].atmos, true);
});

test('surround is withheld from cross-origin media that would play silently', () => {
  const f = playerFixture(); f.context.location = { href: 'https://source.example/watch', origin: 'https://source.example' }; f.context.URL = URL;
  f.video.currentSrc = 'https://cdn.other.example/film.mp4';
  assert.deepEqual({ ...f.tools.snapshot().sound.options[1] }, { id: 'surround', available: false, reason: 'cross-origin' });
  f.video.currentSrc = 'https://source.example/film.mp4';
  assert.equal(f.tools.snapshot().sound.options[1].available, true);
});

test('a sound mode that cannot start audio leaves the track and mode unchanged', async () => {
  const f = playerFixture(); f.video.currentSrc = 'blob:https://source.example/1';
  f.hls.audioTracks = [{ name: 'Stereo' }, { name: 'Dolby Atmos', attrs: { CHANNELS: '16/JOC' } }]; f.hls.audioTrack = 0;
  const result = await f.tools.setSoundMode('atmos');
  assert.equal(result.applied, false); assert.equal(result.reason, 'suspended');
  assert.equal(f.hls.audioTrack, 0); assert.equal(result.mode, 'original');
  assert.equal((await f.tools.setSoundMode('dolby-max')).applied, false);
});
